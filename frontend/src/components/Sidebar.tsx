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
    <div className="h-full flex flex-col glass border-r border-orion-border/30">
      {/* Header */}
      <div className="p-5 pb-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="relative">
            <FlaskConical className="h-7 w-7 text-orion-accent" />
            <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-orion-cyan" style={{ animation: 'orbit 3s linear infinite' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold gradient-text leading-none">ORION</h1>
            <p className="text-[10px] text-orion-text-dim tracking-widest uppercase">Deep Research</p>
          </div>
        </div>

        <button
          onClick={onNewSession}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
            bg-orion-accent text-white text-sm font-medium
            hover:bg-orion-accent-light transition-all shadow-md active:scale-[0.98]"
        >
          <Plus className="h-4.5 w-4.5" />
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
          <div className="text-center py-8 px-4">
            <p className="text-sm text-orion-text-dim">No sessions yet</p>
            <p className="text-xs text-orion-text-dim mt-1">Start a new research to begin</p>
          </div>
        ) : (
          <div className="space-y-1.5 px-1">
            {sessions.map(session => (
              <div
                key={session.session_id}
                className={`
                  w-full px-3 py-3 rounded-xl transition-all text-sm group
                  ${currentSessionId === session.session_id
                    ? 'bg-white shadow-sm text-orion-text font-medium'
                    : 'hover:bg-white/50 text-orion-text-muted border border-transparent hover:border-orion-border/30'
                  }
                `}
              >
                <div className="flex items-start gap-2">
                  {/* Active Pill Indicator */}
                {currentSessionId === session.session_id && (
                  <div className="w-1 self-stretch rounded-r-full bg-orion-accent" />
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
