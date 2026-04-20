import { useEffect, useMemo, useState } from 'react';
import { Search, Loader2, Radio, FileText, Square, PlusCircle, BarChart3, RotateCcw, Download, Activity, CheckCircle2, AlertCircle, Clock3, FolderArchive } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { ResearchFeed } from './components/ResearchFeed';
import { PaperViewer } from './components/PaperViewer';
import { PdfUpload } from './components/PdfUpload';
import { ResearchChatFloating } from './components/ResearchChatFloating';
import { useWebSocket } from './hooks/useWebSocket';
import { api } from './api';
import type { SessionDetail } from './types';

type Tab = 'new' | 'feed' | 'paper' | 'analytics' | 'resources';

export default function App() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('new');
  const [topic, setTopic] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([]);
  const [polledComplete, setPolledComplete] = useState(false);
  const [strictMode, setStrictMode] = useState(false);
  const [debateRounds, setDebateRounds] = useState(1);
  const [paperFormat, setPaperFormat] = useState('academic');
  const [sessionsSnapshot, setSessionsSnapshot] = useState<Array<{
    session_id: string;
    topic: string;
    status: string;
    updated_at?: string;
    token_estimate?: number;
    cost_estimate_usd?: number;
  }>>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [resourceBibliography, setResourceBibliography] = useState<Array<Record<string, unknown>>>([]);
  const [sessionResources, setSessionResources] = useState<Array<{ name: string; size_bytes: number; updated_at: string }>>([]);

  const { isConnected, feedItems, isComplete, error, sendStop } = useWebSocket(currentSessionId);
  const effectiveComplete = isComplete || polledComplete;
  const totalSessions = sessionsSnapshot.length;
  const completedSessions = sessionsSnapshot.filter((s) => s.status === 'complete').length;
  const runningSessions = sessionsSnapshot.filter((s) => s.status === 'running').length;
  const erroredSessions = sessionsSnapshot.filter((s) => s.status === 'error').length;
  const completionRate = totalSessions ? Math.round((completedSessions / totalSessions) * 100) : 0;
  const totalTokens = sessionsSnapshot.reduce((acc, s) => acc + Number(s.token_estimate || 0), 0);
  const totalCost = sessionsSnapshot.reduce((acc, s) => acc + Number(s.cost_estimate_usd || 0), 0);
  const avgTokensPerRun = totalSessions ? Math.round(totalTokens / totalSessions) : 0;
  const recentSessions = useMemo(
    () => [...sessionsSnapshot].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))).slice(0, 6),
    [sessionsSnapshot],
  );

  const handleStart = async () => {
    if (!topic.trim()) return;
    setIsStarting(true);
    setPolledComplete(false);
    try {
      const result = await api.startResearchAdvanced({
        topic: topic.trim(),
        uploaded_paper_ids: uploadedFileIds,
        strict_mode: strictMode,
        max_debate_rounds: debateRounds,
        paper_format: paperFormat,
      });
      setCurrentSessionId(result.session_id);
      setActiveTab('feed');
    } catch (err) {
      console.error('Failed to start research:', err);
    } finally {
      setIsStarting(false);
    }
  };

  const handleNewSession = () => {
    setCurrentSessionId(null);
    setTopic('');
    setUploadedFileIds([]);
    setActiveTab('new');
    setPolledComplete(false);
    setSessionDetail(null);
  };

  const handleSelectSession = (sessionId: string | null) => {
    if (sessionId) {
      setCurrentSessionId(sessionId);
      setPolledComplete(false);
      setActiveTab('feed');
      api.getSessionDetail(sessionId).then(setSessionDetail).catch(() => {});
    }
  };

  const handleRetry = () => {
    if (!currentSessionId) return;
    api.retrySession(currentSessionId).catch(() => {});
  };

  const handleExport = () => {
    if (!currentSessionId) return;
    api.exportBundle(currentSessionId).then((bundle) => {
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orion-export-${currentSessionId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }).catch(() => {});
  };

  const refreshSessionsSnapshot = () => {
    setSessionsLoading(true);
    api.listSessions()
      .then((data) => setSessionsSnapshot(Array.isArray(data?.sessions) ? data.sessions : []))
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  };

  const refreshSessionDetail = () => {
    if (!currentSessionId) return;
    api.getSessionDetail(currentSessionId)
      .then(setSessionDetail)
      .catch(() => {});
  };

  useEffect(() => {
    setPolledComplete(false);
    if (!currentSessionId) return;

    const poll = () => {
      Promise.all([api.getSessionStatus(currentSessionId), api.getSessionDetail(currentSessionId)])
        .then(([status, detail]) => {
          if (status?.status === 'complete') {
            setPolledComplete(true);
          }
          setSessionDetail(detail);
        })
        .catch(() => {});
    };

    poll();
    const interval = setInterval(() => {
      const isRunning = !effectiveComplete && !error;
      if (!isRunning && document.visibilityState !== 'visible') return;
      poll();
    }, effectiveComplete ? 20000 : 6000);
    return () => clearInterval(interval);
  }, [currentSessionId, effectiveComplete, error]);

  useEffect(() => {
    if (activeTab !== 'analytics' && activeTab !== 'resources') return;
    refreshSessionsSnapshot();
    const interval = setInterval(refreshSessionsSnapshot, 12000);
    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    if (!currentSessionId || !effectiveComplete) {
      setResourceBibliography([]);
      setSessionResources([]);
      return;
    }
    api.getPaper(currentSessionId)
      .then((p) => {
        setResourceBibliography(Array.isArray(p?.bibliography) ? p.bibliography : []);
      })
      .catch(() => setResourceBibliography([]));
    api.listSessionResources(currentSessionId)
      .then((res) => {
        setSessionResources(Array.isArray(res?.resources) ? res.resources : []);
      })
      .catch(() => setSessionResources([]));
  }, [currentSessionId, effectiveComplete]);

  return (
    <div className="h-screen flex">
      {/* ── Sidebar ─────────────────────────────────── */}
      <aside className="w-64 shrink-0 hidden md:block">
        <Sidebar
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
        />
      </aside>

      {/* ── Main Content ────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* ── Top Bar ─────────────────────────────────── */}
        <header className="flex items-center justify-between px-6 py-4 glass z-10 sticky top-0 border-b border-orion-border/40">
          <div className="flex items-center gap-4">
            {/* Mobile menu trigger */}
            <button onClick={handleNewSession} className="md:hidden p-2 rounded-lg hover:bg-orion-surface/50 transition-colors">
              <Search className="h-5 w-5 text-orion-text-muted" />
            </button>

            {/* Tab Switcher */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-orion-surface-2/50 border border-orion-border/60 backdrop-blur-md shadow-sm">
              <button
                onClick={() => setActiveTab('new')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'new'
                    ? 'bg-orion-surface text-orion-accent shadow-sm border border-orion-border'
                    : 'text-orion-text-muted hover:text-orion-text hover:bg-orion-surface/50'
                }`}
              >
                <PlusCircle className="h-4 w-4" />
                New Research
              </button>
              <button
                onClick={() => setActiveTab('feed')}
                disabled={!currentSessionId}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'feed'
                    ? 'bg-orion-surface text-orion-accent shadow-sm border border-orion-border'
                    : 'text-orion-text-muted hover:text-orion-text hover:bg-orion-surface/50'
                } ${!currentSessionId ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Radio className="h-4 w-4" />
                Research Feed
              </button>
              <button
                onClick={() => setActiveTab('paper')}
                disabled={!currentSessionId}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'paper'
                    ? 'bg-orion-surface text-orion-accent shadow-sm border border-orion-border'
                    : 'text-orion-text-muted hover:text-orion-text hover:bg-orion-surface/50'
                } ${!currentSessionId ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <FileText className="h-4 w-4" />
                Final Paper
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'analytics'
                    ? 'bg-orion-surface text-orion-accent shadow-sm border border-orion-border'
                    : 'text-orion-text-muted hover:text-orion-text hover:bg-orion-surface/50'
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                Analytics
              </button>
              <button
                onClick={() => setActiveTab('resources')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'resources'
                    ? 'bg-orion-surface text-orion-accent shadow-sm border border-orion-border'
                    : 'text-orion-text-muted hover:text-orion-text hover:bg-orion-surface/50'
                }`}
              >
                <FolderArchive className="h-4 w-4" />
                Resources
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status Badge */}
            {currentSessionId && (
              <div className="flex items-center gap-2">
                 {!effectiveComplete && !error && (
                  <button
                    onClick={() => {
                      sendStop();
                      if (currentSessionId) {
                        api.cancelSession(currentSessionId).catch(() => {});
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                      text-orion-error border border-orion-error/30 hover:bg-orion-error/10 transition-all"
                  >
                    <Square className="h-3 w-3" />
                    Stop
                  </button>
                )}
                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                   effectiveComplete ? 'bg-orion-success/10 text-orion-success border border-orion-success/20' :
                  error ? 'bg-orion-error/10 text-orion-error border border-orion-error/20' :
                  'bg-orion-accent/10 text-orion-accent-light border border-orion-accent/20'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                     effectiveComplete ? 'bg-orion-success' :
                    error ? 'bg-orion-error' :
                    'bg-orion-accent animate-pulse'
                  }`} />
                   {effectiveComplete ? 'Complete' : error ? 'Error' : 'In Progress'}
                </span>
                <button
                  onClick={handleNewSession}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-orion-accent-light border border-orion-accent/30 hover:bg-orion-accent/10 transition-all"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  New
                </button>
                <button
                  onClick={handleRetry}
                  disabled={!currentSessionId}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-orion-accent-light border border-orion-accent/30 hover:bg-orion-accent/10 transition-all disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Retry
                </button>
                <button
                  onClick={handleExport}
                  disabled={!currentSessionId || !effectiveComplete}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-orion-accent-light border border-orion-accent/30 hover:bg-orion-accent/10 transition-all disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </button>
              </div>
            )}
          </div>
        </header>

        {/* ── Content Area ────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-hidden p-3 md:p-4">
          <div className="h-full rounded-2xl border border-orion-border/50 bg-white/55 backdrop-blur-sm shadow-sm overflow-hidden">
          {activeTab === 'new' ? (
            <div className="h-full overflow-y-auto">
              <div className="glass-solid p-6 m-4 md:m-8 rounded-2xl animate-slide-up z-10 relative border border-orion-border/50">
                <div className="max-w-3xl mx-auto space-y-4">
                  <h2 className="text-xl font-display text-orion-text tracking-tight mb-2">Deep Research Query</h2>
                  {/* Topic Input */}
                  <div className="flex gap-3">
                    <div className="relative flex-1 group">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-orion-text-dim group-focus-within:text-orion-accent transition-colors" />
                      <input
                        type="text"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                        placeholder="Enter your research topic"
                        className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white shadow-sm border border-orion-border/50
                          text-orion-text placeholder:text-orion-text-dim text-md font-medium
                          focus:outline-none focus:border-orion-accent/40 focus:ring-4 focus:ring-orion-accent/5
                          transition-all duration-300"
                      />
                    </div>
                    <button
                      onClick={handleStart}
                      disabled={isStarting || !topic.trim()}
                      className="px-8 py-3.5 rounded-xl bg-orion-accent text-white font-medium text-md
                        shadow-lg shadow-orion-accent/20 hover:shadow-orion-accent/30 hover:bg-orion-accent-light 
                        disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed
                        transition-all duration-300 active:scale-[0.98]
                        flex items-center gap-2"
                    >
                      {isStarting ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Starting...
                        </>
                      ) : (
                        'Research'
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex items-center justify-between rounded-xl border border-orion-border/50 bg-white px-3 py-2">
                      <span className="text-sm text-orion-text-muted">Strict synthesis mode</span>
                      <button
                        type="button"
                        onClick={() => setStrictMode((v) => !v)}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${strictMode ? 'bg-orion-accent' : 'bg-orion-surface-3'}`}
                        aria-pressed={strictMode}
                        aria-label="Toggle strict synthesis mode"
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${strictMode ? 'translate-x-6' : 'translate-x-1'}`}
                        />
                      </button>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-orion-text-muted">
                      Debate rounds
                      <select
                        value={debateRounds}
                        onChange={(e) => setDebateRounds(Number(e.target.value))}
                        className="border border-orion-border rounded-md px-2 py-1 bg-white"
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                        <option value={5}>5</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-orion-text-muted">
                      Paper format
                      <select
                        value={paperFormat}
                        onChange={(e) => setPaperFormat(e.target.value)}
                        className="border border-orion-border rounded-md px-2 py-1 bg-white"
                      >
                        <option value="academic">Academic</option>
                        <option value="ieee">IEEE</option>
                        <option value="apa">APA</option>
                        <option value="acm">ACM</option>
                        <option value="mla">MLA</option>
                      </select>
                    </label>
                  </div>

                  {/* PDF Upload */}
                  <div className="pt-2">
                    <PdfUpload onFilesChange={setUploadedFileIds} />
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'feed' ? (
            <ResearchFeed items={feedItems} isConnected={isConnected} />
          ) : activeTab === 'paper' ? (
             <PaperViewer sessionId={currentSessionId} isComplete={effectiveComplete} />
          ) : activeTab === 'analytics' ? (
            <div className="h-full overflow-y-auto p-6 md:p-8 animate-fade-in">
              <div className="max-w-5xl space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-2xl font-display text-orion-text">Analytics</h2>
                  {sessionsLoading && <span className="text-xs text-orion-text-dim">Refreshing…</span>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="rounded-xl border border-orion-border/50 bg-white p-4">
                    <p className="text-xs text-orion-text-dim uppercase tracking-wide">Total Runs</p>
                    <p className="mt-1 text-lg font-semibold text-orion-text-muted">{totalSessions}</p>
                  </div>
                  <div className="rounded-xl border border-orion-border/50 bg-white p-4">
                    <p className="text-xs text-orion-text-dim uppercase tracking-wide">Completion Rate</p>
                    <p className="mt-1 text-lg font-semibold text-orion-text-muted">{completionRate}%</p>
                  </div>
                  <div className="rounded-xl border border-orion-border/50 bg-white p-4">
                    <p className="text-xs text-orion-text-dim uppercase tracking-wide">Total Tokens</p>
                    <p className="mt-1 text-lg font-semibold text-orion-text-muted">{totalTokens.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-orion-border/50 bg-white p-4">
                    <p className="text-xs text-orion-text-dim uppercase tracking-wide">Estimated Cost</p>
                    <p className="mt-1 text-lg font-semibold text-orion-text-muted">${totalCost.toFixed(4)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-orion-border/50 bg-white p-5">
                    <p className="text-sm font-semibold text-orion-text-muted mb-3">Run Status Distribution</p>
                    <div className="space-y-3">
                      {[
                        { label: 'Completed', value: completedSessions, color: 'bg-orion-success' },
                        { label: 'Running', value: runningSessions, color: 'bg-orion-accent' },
                        { label: 'Errored', value: erroredSessions, color: 'bg-orion-error' },
                      ].map((item) => {
                        const pct = totalSessions ? Math.round((item.value / totalSessions) * 100) : 0;
                        return (
                          <div key={item.label}>
                            <div className="flex items-center justify-between text-xs text-orion-text-dim mb-1">
                              <span>{item.label}</span>
                              <span>{item.value} ({pct}%)</span>
                            </div>
                            <div className="h-2 rounded-full bg-orion-surface-2 overflow-hidden">
                              <div className={`h-full ${item.color}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="rounded-xl border border-orion-border/50 bg-white p-5">
                    <p className="text-sm font-semibold text-orion-text-muted mb-3">Current Workspace Pulse</p>
                    <div className="space-y-2 text-sm text-orion-text-muted">
                      <p className="flex items-center gap-2"><Activity className="h-4 w-4 text-orion-accent" /> Feed events in selected run: <strong>{feedItems.length}</strong></p>
                      <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-orion-info" /> Active session: <strong>{currentSessionId ? currentSessionId.slice(0, 8) : 'None'}</strong></p>
                      <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-orion-success" /> Avg tokens per run: <strong>{avgTokensPerRun.toLocaleString()}</strong></p>
                      <p className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-orion-error" /> Current state: <strong>{effectiveComplete ? 'Complete' : error ? 'Error' : currentSessionId ? 'In Progress' : 'Idle'}</strong></p>
                      <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-orion-success" /> Strict mode: <strong>{strictMode ? 'On' : 'Off'}</strong></p>
                      <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-orion-info" /> Debate rounds: <strong>{debateRounds}</strong></p>
                      <p className="flex items-center gap-2"><Activity className="h-4 w-4 text-orion-accent" /> Paper format: <strong>{String(sessionDetail?.controls?.paper_format || paperFormat).toUpperCase()}</strong></p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-orion-border/50 bg-white p-5">
                  <p className="text-sm font-semibold text-orion-text-muted mb-3">Recent Runs</p>
                  {recentSessions.length === 0 ? (
                    <p className="text-sm text-orion-text-dim">No runs available yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {recentSessions.map((s) => (
                        <div key={s.session_id} className="flex items-center gap-3 text-sm border border-orion-border/30 rounded-lg px-3 py-2">
                          <span className="font-mono text-xs text-orion-text-dim w-20">{s.session_id.slice(0, 8)}</span>
                          <span className="truncate flex-1 text-orion-text-muted">{s.topic}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full border border-orion-border/40">{s.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === 'resources' ? (
            <div className="h-full overflow-y-auto p-6 md:p-8 animate-fade-in">
              <div className="max-w-5xl space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-2xl font-display text-orion-text">Resources</h2>
                  <button
                    onClick={refreshSessionDetail}
                    disabled={!currentSessionId}
                    className="px-3 py-1.5 text-xs rounded-lg border border-orion-border/50 bg-white hover:bg-orion-surface transition-all disabled:opacity-50"
                  >
                    Refresh
                  </button>
                </div>
                <div className="rounded-xl border border-orion-border/50 bg-white p-5">
                  <p className="text-sm text-orion-text-muted">Session artifacts and exports for the selected research run.</p>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                    <div className="rounded-lg border border-orion-border/40 bg-orion-surface p-3">
                      <p className="text-xs text-orion-text-dim uppercase tracking-wide">Selected Session</p>
                      <p className="mt-1 text-orion-text-muted"><strong>{currentSessionId ? currentSessionId.slice(0, 8) : 'None'}</strong></p>
                    </div>
                    <div className="rounded-lg border border-orion-border/40 bg-orion-surface p-3">
                      <p className="text-xs text-orion-text-dim uppercase tracking-wide">Paper Format</p>
                      <p className="mt-1 text-orion-text-muted"><strong>{String(sessionDetail?.controls?.paper_format || paperFormat).toUpperCase()}</strong></p>
                    </div>
                    <div className="rounded-lg border border-orion-border/40 bg-orion-surface p-3">
                      <p className="text-xs text-orion-text-dim uppercase tracking-wide">Uploaded PDFs</p>
                      <p className="mt-1 text-orion-text-muted"><strong>{sessionDetail?.uploaded_paper_ids?.length || 0}</strong></p>
                    </div>
                    <div className="rounded-lg border border-orion-border/40 bg-orion-surface p-3">
                      <p className="text-xs text-orion-text-dim uppercase tracking-wide">Quality Signals</p>
                      <p className="mt-1 text-orion-text-muted"><strong>{resourceBibliography.length > 0 ? 'Available' : 'Pending'}</strong></p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-orion-border/50 bg-white p-5">
                    <p className="text-sm font-semibold text-orion-text-muted mb-3">Downloads</p>
                    <div className="space-y-2">
                      <button
                        onClick={handleExport}
                        disabled={!currentSessionId || !effectiveComplete}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-orion-border/40 bg-orion-surface hover:bg-white transition-all disabled:opacity-50"
                      >
                        <span className="text-sm text-orion-text-muted">Full Export Bundle (JSON)</span>
                        <Download className="h-4 w-4 text-orion-accent-light" />
                      </button>
                      <button
                        onClick={() => {
                          if (!currentSessionId) return;
                          api.getPaper(currentSessionId).then((p) => {
                            const blob = new Blob([p.paper || ''], { type: 'text/markdown' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `orion-paper-${currentSessionId.slice(0, 8)}.md`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }).catch(() => {});
                        }}
                        disabled={!currentSessionId || !effectiveComplete}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-orion-border/40 bg-orion-surface hover:bg-white transition-all disabled:opacity-50"
                      >
                        <span className="text-sm text-orion-text-muted">Paper Markdown</span>
                        <Download className="h-4 w-4 text-orion-accent-light" />
                      </button>
                      <button
                        onClick={() => window.print()}
                        disabled={!currentSessionId || !effectiveComplete}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-orion-border/40 bg-orion-surface hover:bg-white transition-all disabled:opacity-50"
                      >
                        <span className="text-sm text-orion-text-muted">Print / Save as PDF</span>
                        <Download className="h-4 w-4 text-orion-accent-light" />
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-orion-border/50 bg-white p-5">
                    <p className="text-sm font-semibold text-orion-text-muted mb-3">Session Summary</p>
                    <div className="space-y-2 text-sm text-orion-text-muted">
                      <p>Selected session: <strong>{currentSessionId ? currentSessionId.slice(0, 8) : 'None'}</strong></p>
                      <p>Status: <strong>{sessionDetail?.status || (effectiveComplete ? 'complete' : currentSessionId ? 'running' : 'idle')}</strong></p>
                      <p>Current step: <strong>{sessionDetail?.current_step || 'n/a'}</strong></p>
                      <p>Elapsed seconds: <strong>{sessionDetail?.elapsed_seconds ?? 0}</strong></p>
                      <p>Token estimate: <strong>{sessionDetail?.token_estimate ?? 0}</strong></p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-orion-border/50 bg-white p-5">
                  <p className="text-sm font-semibold text-orion-text-muted mb-3">Recent Sessions</p>
                  {recentSessions.length === 0 ? (
                    <p className="text-sm text-orion-text-dim">No session activity yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {recentSessions.slice(0, 4).map((s) => (
                        <div key={s.session_id} className="flex items-center gap-3 border border-orion-border/30 rounded-lg px-3 py-2">
                          <span className="font-mono text-xs text-orion-text-dim w-20">{s.session_id.slice(0, 8)}</span>
                          <span className="text-sm text-orion-text-muted truncate flex-1">{s.topic}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full border border-orion-border/40">{s.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-orion-border/50 bg-white p-5">
                  <p className="text-sm font-semibold text-orion-text-muted mb-3">Resources Used in This Topic</p>
                  {resourceBibliography.length === 0 ? (
                    <p className="text-sm text-orion-text-dim">No bibliography resources available yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {resourceBibliography.map((b, i) => (
                        <div key={`${String(b.paper_id || i)}-${i}`} className="rounded-lg border border-orion-border/30 px-3 py-2">
                          <p className="text-sm text-orion-text-muted font-medium">
                            {String(b.title || 'Untitled resource')}
                          </p>
                          <p className="text-xs text-orion-text-dim mt-1">
                            {String(b.authors || 'Unknown')} · {String(b.year || 'n.d.')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-orion-border/50 bg-white p-5">
                  <p className="text-sm font-semibold text-orion-text-muted mb-3">Saved Session Files</p>
                  {sessionResources.length === 0 ? (
                    <p className="text-sm text-orion-text-dim">No saved files yet for this session.</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {sessionResources.map((f) => (
                        <a
                          key={f.name}
                          href={currentSessionId ? api.resourceDownloadUrl(currentSessionId, f.name) : '#'}
                          className="flex items-center justify-between rounded-lg border border-orion-border/30 px-3 py-2 hover:bg-orion-surface transition-all"
                        >
                          <span className="text-sm text-orion-text-muted">{f.name}</span>
                          <span className="text-xs text-orion-text-dim">{(f.size_bytes / 1024).toFixed(1)} KB</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
          </div>
        </div>
      </main>
      <ResearchChatFloating sessionId={currentSessionId} />
    </div>
  );
}
