import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  LogOut,
  FolderOpen
} from 'lucide-react';
import { api } from '../api';
import { supabase } from '../supabase';
import type { Session, UserQuota } from '../types';

interface SidebarProps {
  currentSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
  onNewSession: () => void;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'complete')  return <CheckCircle2 size={13} className="text-ok shrink-0" />;
  if (status === 'error')     return <AlertCircle size={13} className="text-err shrink-0" />;
  if (status === 'cancelled') return <AlertTriangle size={13} className="text-warn shrink-0" />;
  if (status === 'running')   return <Loader2 size={13} className="text-accent animate-spin shrink-0" />;
  return <Clock size={13} className="text-ink-mute shrink-0" />;
}

function relativeTime(value?: string) {
  if (!value) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60)  return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)  return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)    return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function Sidebar({ currentSessionId, onSelectSession, onNewSession }: SidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [quota, setQuota]       = useState<UserQuota | null>(null);
  const [loading, setLoading]   = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const fetchSessions = () => {
    api.listSessions()
      .then((data) => { setSessions(data.sessions || []); setError(null); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load sessions'))
      .finally(() => setLoading(false));

    api.getQuota()
      .then(setQuota)
      .catch(() => {});
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (sessionId: string) => {
    setDeletingId(sessionId);
    setError(null);
    try {
      await api.deleteSession(sessionId);
      if (currentSessionId === sessionId) onNewSession();
      fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col bg-surface border-r border-line select-none">
      {/* ── Brand & Action Header ── */}
      <div className="p-4 border-b border-line">
        <div className="flex items-center gap-2.5 mb-3.5">
          <div className="w-8 h-8 rounded-md bg-primary text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
            <Brain size={16} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-none text-ink truncate">ResearchAgent</div>
            <div className="text-xs text-ink-mute mt-1 truncate">Autonomous Deep Research</div>
          </div>
        </div>

        <button
          type="button"
          onClick={onNewSession}
          className="control-button control-button-primary w-full text-sm font-medium"
          style={{ minHeight: 36 }}
        >
          <Plus size={15} />
          <span>New Research</span>
        </button>

        {quota && (
          <div className="mt-3 flex items-center justify-between text-xs px-2.5 py-1.5 rounded border border-line bg-surface-subtle">
            <span className="mono-kicker text-[11px]">Plan</span>
            <span className="font-mono text-xs font-medium text-ink-soft">
              {quota.unlimited
                ? `${sessions.length} ${sessions.length === 1 ? 'paper' : 'papers'} · Unlimited`
                : `${quota.papers_remaining} ${quota.papers_remaining === 1 ? 'paper' : 'papers'} left`}
            </span>
          </div>
        )}
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="px-3 py-2 text-xs bg-err-subtle text-err border-b border-red-200" role="alert">
          {error}
        </div>
      )}

      {/* ── Sessions List ── */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="px-2 py-1.5 mb-1">
          <span className="mono-kicker text-[11px]">Research History</span>
        </div>

        {loading && sessions.length === 0 ? (
          <div className="p-2 space-y-1.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="shimmer h-11 w-full rounded" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <FolderOpen size={22} className="mx-auto mb-2 text-ink-mute opacity-50" />
            <p className="text-sm font-medium text-ink-soft">No previous research</p>
            <p className="mt-1 text-xs text-ink-mute">Initiated research runs will be cataloged here.</p>
          </div>
        ) : (
          <nav className="space-y-0.5" aria-label="Past research sessions">
            <AnimatePresence>
              {sessions.map((session) => {
                const selected = currentSessionId === session.session_id;
                return (
                  <div
                    key={session.session_id}
                    onClick={() => onSelectSession(session.session_id)}
                    className={`group relative flex items-center gap-2.5 rounded px-2.5 py-2 transition-colors cursor-pointer border ${
                      selected
                        ? 'bg-surface-subtle border-line-strong text-ink font-semibold shadow-xs'
                        : 'border-transparent text-ink-soft hover:bg-surface-subtle hover:text-ink'
                    }`}
                  >
                    <StatusIcon status={session.status} />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium leading-snug">
                        {session.topic}
                      </p>
                      <span className="text-xs text-ink-mute font-mono block mt-0.5">
                        {relativeTime(session.updated_at)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(session.session_id);
                      }}
                      disabled={session.status === 'running' || deletingId === session.session_id}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-canvas text-ink-mute hover:text-err disabled:opacity-0"
                      aria-label={`Delete ${session.topic}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </AnimatePresence>
          </nav>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="p-3 border-t border-line">
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="control-button control-button-ghost w-full text-xs justify-start"
          style={{ minHeight: 32 }}
        >
          <LogOut size={14} className="text-ink-mute" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}
