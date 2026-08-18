import { useState, useEffect, useRef, useCallback } from 'react';
import type { WSMessage, FeedItem } from '../types';
import { api } from '../api';

function getWebSocketUrl(sessionId: string, ticket: string) {
  const configuredBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
  if (configuredBase) {
    const wsBase = configuredBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    return `${wsBase}/ws/${sessionId}?ticket=${encodeURIComponent(ticket)}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  // Dev: connect straight to the backend. Vite's proxy accepts the upgrade from
  // some clients but drops it from the browser, so the feed silently falls back
  // to polling. In production the app is served by the backend itself, so
  // window.location.host is already correct.
  if (import.meta.env.DEV) {
    return `${protocol}//127.0.0.1:8000/ws/${sessionId}?ticket=${encodeURIComponent(ticket)}`;
  }

  return `${protocol}//${window.location.host}/ws/${sessionId}?ticket=${encodeURIComponent(ticket)}`;
}

/**
 * Custom hook for WebSocket connection to Delve backend.
 * Manages connection lifecycle, heartbeats, and message parsing.
 */
export function useWebSocket(sessionId: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const [isPollingFallback, setIsPollingFallback] = useState(false);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const completedRef = useRef(false);
  const activeSessionRef = useRef<string | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);

  const addFeedItem = useCallback((msg: WSMessage) => {
    // Skip heartbeat and pong messages
    if (msg.type === 'heartbeat' || msg.type === 'pong') return;

    const item: FeedItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
      type: msg.type,
      message: msg.message || '',
      data: msg.data,
      node: typeof msg.data?.node === 'string' ? msg.data.node : undefined,
    };

    setFeedItems(prev => [...prev, item]);
  }, []);

  const connect = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    setWarning(null);
    setIsComplete(false);
    completedRef.current = false;

    // Pre-flight: skip WS for sessions that are already done or errored
    try {
      const statusRes = await api.getSessionStatus(sessionId);
      const s = statusRes?.status;
      if (s === 'complete' || s === 'error' || s === 'cancelled') {
        if (s === 'complete') {
          setIsComplete(true);
          completedRef.current = true;
        }
        if (s === 'error') setError('Session ended with an error');
        return; // don't open WebSocket
      }
    } catch {
      // session might not exist; skip silently
      return;
    }
    let ticket: string;
    try {
      ticket = (await api.createWebSocketTicket(sessionId)).ticket;
    } catch {
      setIsPollingFallback(true);
      setWarning('Live updates unavailable, using polling fallback');
      return;
    }
    const url = getWebSocketUrl(sessionId, ticket);

    // The status pre-flight above is async, so the effect cleanup may already
    // have run (React StrictMode double-mounts). Opening a socket now would
    // orphan it: nothing holds a reference, so it closes and trips the
    // reconnect/fallback path even though the server is healthy.
    if (activeSessionRef.current !== sessionId) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsPollingFallback(false);
        setWarning(null);
        setError(null);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          addFeedItem(msg);

          if (msg.type === 'complete') {
            setIsComplete(true);
            completedRef.current = true;
          }
          if (msg.type === 'error') {
            setError(msg.message || 'Unknown error');
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return; // superseded by a newer socket
        setIsConnected(false);
        wsRef.current = null;

        // Reconnect only for non-terminal sessions (max 3 times)
        if (!completedRef.current && sessionId && reconnectAttempts.current < 3) {
          reconnectAttempts.current++;
          if (connectTimeoutRef.current) window.clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = window.setTimeout(connect, 2000 * reconnectAttempts.current);
        } else if (!completedRef.current) {
          setIsPollingFallback(true);
          setWarning('Live updates unavailable, using polling fallback');
        }
      };

      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        setWarning('Live updates unavailable, using polling fallback');
      };

    } catch (e) {
      setIsPollingFallback(true);
      setWarning('Failed to create live connection, using polling fallback');
    }
  }, [sessionId, addFeedItem]);

  useEffect(() => {
    activeSessionRef.current = sessionId;
    if (sessionId) {
      // Reset state
      setFeedItems([]);
      setIsComplete(false);
      completedRef.current = false;
      setError(null);
      setWarning(null);
      setIsPollingFallback(false);
      reconnectAttempts.current = 0;
      connect();

      api.getTimeline(sessionId)
        .then((res) => {
          if (activeSessionRef.current !== sessionId) return;
          const timeline = Array.isArray(res?.timeline) ? res.timeline : [];
          const mapped: FeedItem[] = timeline
            .map((entry: Record<string, unknown>, idx: number) => {
              const type = (entry.type as WSMessage['type']) || 'status';
              const data = (entry.data as Record<string, unknown>) || {};
              const ts = typeof entry.timestamp === 'string' ? new Date(entry.timestamp) : new Date();
              return {
                id: `timeline-${idx}-${String(entry.timestamp || Date.now())}`,
                timestamp: ts,
                type,
                message: String(entry.message || ''),
                data,
                node: typeof data.node === 'string' ? data.node : undefined,
              };
            })
            .filter((item: FeedItem) => item.type !== 'heartbeat' && item.type !== 'pong');
          if (mapped.length) {
            setFeedItems(mapped);
            if (mapped.some(m => m.type === 'complete')) {
              setIsComplete(true);
              completedRef.current = true;
            }
          }
        })
        .catch(() => {});
    } else {
      setFeedItems([]);
      setIsComplete(false);
      setError(null);
      setWarning(null);
      setIsPollingFallback(false);
      completedRef.current = false;
    }

    return () => {
      activeSessionRef.current = null;
      if (connectTimeoutRef.current) {
        window.clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId, connect]);

  const sendStop = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
  }, []);

  return {
    isConnected,
    isPollingFallback,
    feedItems,
    isComplete,
    error,
    warning,
    sendStop,
    connect,
  };
}
