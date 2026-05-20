import { useEffect, useState } from 'react';
import { Plus, FlaskConical, Loader2, CheckCircle2, AlertCircle, Clock, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { Session } from '../types';

interface SidebarProps {
  currentSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
  onNewSession: () => void;
}

export function Sidebar({ currentSessionId, onSelectSession, onNewSession }: SidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSessions = () => {
    api.listSessions()
      .then(data => setSessions(data.sessions || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 8000);
    return () => clearInterval(interval);
  }, []);

  const formatStep = (step?: string) => {
    if (!step) return '';
    return step
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete': return <CheckCircle2 className="h-3.5 w-3.5 text-orion-success" />;
      case 'error': return <AlertCircle className="h-3.5 w-3.5 text-orion-error" />;
      case 'running': return <Loader2 className="h-3.5 w-3.5 text-orion-accent animate-spin" />;
      case 'cancelled': return <AlertCircle className="h-3.5 w-3.5 text-amber-500" />;
      default: return <Clock className="h-3.5 w-3.5 text-orion-text-dim" />;
    }
  };

  const handleDelete = async (sessionId: string) => {
    setDeletingId(sessionId);
    try {
      await api.deleteSession(sessionId);
      if (currentSessionId === sessionId) {
        onNewSession();
      } else {
        fetchSessions();
      }
    } catch {
      // no-op
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col sidebar-glass border-r border-orion-border/50">
      {/* Header */}
      <div className="p-4 pt-8 pb-3">
        <div className="flex items-center gap-3 mb-5">
          <div className="relative">
            <FlaskConical className="h-6 w-6 text-orion-accent" />
            <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tighter text-orion-text leading-none">ORION</h1>
            <p className="text-[9px] font-bold text-orion-text-dim tracking-widest uppercase mt-0.5">Deep Research</p>
          </div>
        </div>

        <button
          onClick={onNewSession}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5
            bg-orion-accent text-white rounded-xl text-sm font-bold shadow-[0_4px_12px_rgba(79,70,229,0.2)] hover:bg-orion-accent-light hover:shadow-[0_6px_16px_rgba(79,70,229,0.3)] transition-all active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          New Research
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading && sessions.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 text-orion-text-dim animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-sm text-orion-text-dim">No sessions yet</p>
            <p className="text-xs text-orion-text-dim mt-1">Start a new research to begin</p>
          </div>
        ) : (
          <div className="space-y-1.5 px-1">
            {sessions.map(session => (
              <div
                key={session.session_id}
                className={`
                  w-full px-3 py-3 rounded-xl transition-all text-sm group relative overflow-hidden
                  ${currentSessionId === session.session_id
                    ? 'bg-gradient-to-r from-orion-accent/10 to-transparent shadow-sm text-orion-text font-semibold border border-orion-accent/20'
                    : 'hover:bg-orion-surface-2/60 text-orion-text-muted border border-transparent hover:border-orion-border/50'
                  }
                `}
              >
                <div className="flex items-start gap-2 relative z-10">
                  {/* Active Pill Indicator */}
                {currentSessionId === session.session_id && (
                  <div className="absolute -left-3 top-0 bottom-0 w-1 rounded-r-full bg-gradient-to-b from-indigo-500 to-cyan-400 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                )}
                  <button
                    onClick={() => onSelectSession(session.session_id)}
                    className="flex-1 text-left min-w-0"
                  >
                  <div className="flex items-center gap-2.5">
                    {getStatusIcon(session.status)}
                    <span className="truncate block tracking-tight">{session.topic}</span>
                  </div>
                  <span className="text-[10px] text-orion-text-dim ml-6 block truncate font-mono mt-0.5 opacity-70">
                    {session.session_id.slice(0, 8)}
                  </span>
                  {session.current_step && (
                    <span className="text-[10px] text-orion-accent-light ml-6 block truncate mt-0.5">
                      {formatStep(session.current_step)}
                    </span>
                  )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(session.session_id);
                    }}
                    disabled={session.status === 'running' || deletingId === session.session_id}
                    className="shrink-0 mt-0.5 p-1.5 rounded-md text-orion-text-dim hover:text-orion-error hover:bg-orion-error/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={session.status === 'running' ? 'Cannot delete running session' : 'Delete session'}
                  >
                    {deletingId === session.session_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer spacer */}
      <div className="p-2" />
    </div>
  );
}
