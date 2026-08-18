import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Plus, Trash2, Clock, CheckCircle2, XCircle, AlertTriangle, Loader2, LogOut, Sparkles } from 'lucide-react';
import { api } from '../api';
import { supabase } from '../supabase';
import type { Session, UserQuota } from '../types';

interface SidebarProps {
  currentSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
  onNewSession: () => void;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'complete')  return <CheckCircle2 size={13} color="var(--color-ok)" />;
  if (status === 'error')     return <XCircle size={13} color="var(--color-err)" />;
  if (status === 'cancelled') return <AlertTriangle size={13} color="var(--color-warn)" />;
  if (status === 'running')   return <Loader2 size={13} color="var(--color-blue-dim)" className="animate-spin" />;
  return <Clock size={13} color="var(--color-ink-mute)" />;
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
    <div
      className="flex h-full flex-col"
      style={{
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-line)',
      }}
    >
      {/* ── Header ── */}
      <div className="px-5 py-5" style={{ borderBottom: '1px solid var(--color-line)' }}>
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-md"
            style={{ background: 'var(--gradient-primary)' }}
          >
            <Brain size={16} color="white" />
          </div>
          <div>
            <div className="font-bold text-base leading-none" style={{ color: 'var(--color-ink)' }}>Delve</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-ink-mute)' }}>Deep Research AI</div>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={onNewSession}
          className="control-button control-button-primary w-full text-xs font-semibold"
          style={{ borderRadius: 10, minHeight: 38 }}
        >
          <Plus size={15} />
          New Research
        </motion.button>

        {quota && (
          <div
            className="mt-3 flex items-center justify-between text-xs px-3 py-1.5 rounded-lg"
            style={{
              background: quota.has_quota ? 'rgba(99,102,241,0.1)' : 'rgba(244,63,94,0.1)',
              border: `1px solid ${quota.has_quota ? 'rgba(99,102,241,0.2)' : 'rgba(244,63,94,0.2)'}`,
            }}
          >
            <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-ink-mute)' }}>
              <Sparkles size={11} color={quota.has_quota ? 'var(--color-pink)' : 'var(--color-err)'} />
              Plan:
            </span>
            <span
              className="font-semibold text-[11px]"
              style={{ color: quota.has_quota ? 'var(--color-blue-dim)' : 'var(--color-err)' }}
            >
              {quota.has_quota
                ? `${quota.papers_remaining} free ${quota.papers_remaining === 1 ? 'paper' : 'papers'} left`
                : '0 free papers left'}
            </span>
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="px-4 py-2 text-xs"
          style={{ color: 'var(--color-err)', background: 'rgba(244,63,94,0.1)', borderBottom: '1px solid rgba(244,63,94,0.2)' }}>
          {error}
        </div>
      )}

      {/* ── Session List ── */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {loading && sessions.length === 0 ? (
          <div className="px-3 py-6 space-y-2">
            {[1,2,3].map(i => (
              <div key={i} className="shimmer h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Brain size={26} color="var(--color-ink-mute)" className="mx-auto mb-2 opacity-50" />
            <p className="text-xs font-semibold" style={{ color: 'var(--color-ink-soft)' }}>No previous research</p>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--color-ink-mute)' }}>Your generated papers will appear here</p>
          </div>
        ) : (
          <div className="space-y-1">
            <AnimatePresence>
              {sessions.map((session) => {
                const selected = currentSessionId === session.session_id;
                return (
                  <motion.div
                    key={session.session_id}
                    layout
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.15 }}
                    className="group flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all cursor-pointer"
                    style={{
                      background: selected ? 'rgba(99,102,241,0.12)' : 'transparent',
                      border: selected ? '1px solid rgba(99,102,241,0.28)' : '1px solid transparent',
                    }}
                    onClick={() => onSelectSession(session.session_id)}
                  >
                    <div className="shrink-0">
                      <StatusIcon status={session.status} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-xs font-medium leading-tight"
                        style={{ color: selected ? 'var(--color-ink)' : 'var(--color-ink-soft)' }}
                      >
                        {session.topic}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[11px]" style={{ color: 'var(--color-ink-mute)' }}>
                          {relativeTime(session.updated_at)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDelete(session.session_id); }}
                      disabled={session.status === 'running' || deletingId === session.session_id}
                      className="opacity-50 sm:opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg disabled:opacity-20 hover:bg-white/5"
                      style={{ color: 'var(--color-ink-mute)' }}
                      onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-err)')}
                      onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-ink-mute)')}
                      aria-label="Delete session"
                    >
                      <Trash2 size={13} />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--color-line)' }}>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="control-button control-button-ghost w-full text-xs"
          style={{ minHeight: 32 }}
        >
          <LogOut size={12} />
          Sign out
        </button>
      </div>
    </div>
  );
}
