import { useState, useEffect, useRef, useCallback } from 'react';
import type { WSMessage, FeedItem } from '../types';
import { api } from '../api';

function getWebSocketUrl(sessionId: string) {
  const configuredBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
  if (configuredBase) {
    const wsBase = configuredBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    return `${wsBase}/ws/${sessionId}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/${sessionId}`;
}

/**
 * Custom hook for WebSocket connection to ORION backend.
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

  const getIcon = useCallback((type: WSMessage['type']): FeedItem['icon'] => {
    switch (type) {
      case 'connected': return 'connect';
      case 'paper_found': return 'paper';
      case 'gap': return 'gap';
      case 'debate': return 'debate';
      case 'complete': return 'check';
      case 'error': return 'error';
      default: return 'search';
    }
  }, []);

  const addFeedItem = useCallback((msg: WSMessage) => {
    // Skip heartbeat and pong messages
    if (msg.type === 'heartbeat' || msg.type === 'pong') return;

    const item: FeedItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
      type: msg.type,
      message: msg.message || '',
      data: msg.data,
      icon: getIcon(msg.type),
      node: typeof msg.data?.node === 'string' ? msg.data.node : undefined,
    };

    // Determine icon based on message content
    if (msg.message?.toLowerCase().includes('summariz')) item.icon = 'brain';
    if (msg.message?.toLowerCase().includes('draft') || msg.message?.toLowerCase().includes('review')) item.icon = 'debate';
    if (msg.message?.toLowerCase().includes('gap')) item.icon = 'gap';
    if (msg.message?.toLowerCase().includes('assembl') || msg.message?.toLowerCase().includes('paper')) item.icon = 'file';

    setFeedItems(prev => [...prev, item]);
  }, [getIcon]);

  const connect = useCallback(async () => {
    if (!sessionId) return;

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
    const url = getWebSocketUrl(sessionId);

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
                icon: getIcon(type),
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
      if (connectTimeoutRef.current) {
        window.clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId, connect, getIcon]);

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
  };
}
