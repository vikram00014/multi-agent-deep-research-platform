import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { Session } from '../types';

interface SidebarProps {
  currentSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
  onNewSession: () => void;
}

function statusDot(status: string) {
  if (status === 'complete') return 'bg-ok';
  if (status === 'error') return 'bg-err';
  if (status === 'cancelled') return 'bg-warn';
  if (status === 'running') return 'bg-accent';
  return 'bg-ink-mute';
}

function relativeTime(value?: string) {
  if (!value) return 'no time';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return 'no time';
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatStep(step?: string) {
  if (!step) return 'idle';
  return step.replaceAll('_', ' ');
}

export function Sidebar({ currentSessionId, onSelectSession, onNewSession }: SidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = () => {
    api.listSessions()
      .then((data) => {
        setSessions(data.sessions || []);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load sessions'))
      .finally(() => setLoading(false));
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
      if (currentSessionId === sessionId) {
        onNewSession();
      }
      fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col border-r border-line bg-surface">
      <div className="border-b border-line px-5 py-5">
        <div className="mb-5">
          <div className="text-lg font-semibold leading-none text-ink">Delve</div>
          <div className="mono-kicker mt-1">Delve research</div>
        </div>
        <button type="button" onClick={onNewSession} className="control-button control-button-primary w-full">
          <Plus className="h-4 w-4" />
          New research
        </button>
      </div>

      {error ? (
        <div className="border-b border-err/40 bg-err/10 px-4 py-3 text-xs text-err">
          {error}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto py-2">
        {loading && sessions.length === 0 ? (
          <div className="px-5 py-8 text-sm text-ink-mute">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="px-5 py-8">
            <p className="text-sm text-ink-soft">No sessions yet</p>
            <p className="mt-1 text-xs text-ink-mute">Start a topic to build the first paper.</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {sessions.map((session) => {
              const selected = currentSessionId === session.session_id;
              return (
                <div
                  key={session.session_id}
                  className={`group flex items-start gap-2 border-l-2 px-3 py-3 transition-colors ${
                    selected
                      ? 'border-accent bg-raised'
                      : 'border-transparent hover:bg-raised'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSession(session.session_id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot(session.status)}`} />
                      <span className="truncate text-sm font-medium text-ink">{session.topic}</span>
                    </div>
                    <div className="ml-4 mt-1 flex items-center gap-2 text-[11px] text-ink-mute">
                      <span className="font-mono uppercase tracking-[0.12em]">{session.session_id.slice(0, 8)}</span>
                      <span aria-hidden="true">/</span>
                      <span>{relativeTime(session.updated_at)}</span>
                    </div>
                    <div className="ml-4 mt-1 truncate text-[11px] text-ink-mute">{formatStep(session.current_step)}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(session.session_id)}
                    disabled={session.status === 'running' || deletingId === session.session_id}
                    className="rounded-card border border-transparent p-1.5 text-ink-mute opacity-0 transition-opacity hover:border-line hover:text-err disabled:opacity-30 group-hover:opacity-100"
                    aria-label={`Delete session ${session.topic}`}
                    title={session.status === 'running' ? 'Cannot delete a running session' : 'Delete session'}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
