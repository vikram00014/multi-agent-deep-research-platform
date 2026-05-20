import { useEffect, useState, useCallback } from 'react';
import { Search, Loader2, Radio, FileText, Square, PlusCircle, BarChart3, RotateCcw, Download, Activity, CheckCircle2, Clock, FolderArchive, Moon, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from './components/Sidebar';
import { ResearchFeed } from './components/ResearchFeed';
import { PaperViewer } from './components/PaperViewer';
import { PdfUpload } from './components/PdfUpload';
import { ResearchChatFloating } from './components/ResearchChatFloating';
import { VisualInsights } from './components/VisualInsights';
import { useWebSocket } from './hooks/useWebSocket';
import { api } from './api';
import type { SessionDetail } from './types';

type Tab = 'new' | 'feed' | 'paper' | 'insights' | 'resources';

const tabs: Array<{ key: Tab; label: string; requiresSession?: boolean }> = [
  { key: 'new', label: 'New Research' },
  { key: 'feed', label: 'Research Feed', requiresSession: true },
  { key: 'paper', label: 'Final Paper', requiresSession: true },
  { key: 'insights', label: 'Visual Insights', requiresSession: true },
  { key: 'resources', label: 'Resources', requiresSession: true },
];

export default function App() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('new');
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  const [topic, setTopic] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([]);
  const [polledComplete, setPolledComplete] = useState(false);
  const [strictMode, setStrictMode] = useState(false);
  const [enableDebate, setEnableDebate] = useState(false);
  const [paperFormat, setPaperFormat] = useState('academic');
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [resourceBibliography, setResourceBibliography] = useState<Array<Record<string, unknown>>>([]);
  const [sessionResources, setSessionResources] = useState<Array<{ name: string; size_bytes: number; updated_at: string }>>([]);

  const { isConnected, isPollingFallback, feedItems, isComplete, error, warning, sendStop } = useWebSocket(currentSessionId);
  const effectiveComplete = isComplete || polledComplete;

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const handleStart = async () => {
    if (!topic.trim()) return;
    setIsStarting(true);
    setPolledComplete(false);
    try {
      const result = await api.startResearchAdvanced({
        topic: topic.trim(),
        uploaded_paper_ids: uploadedFileIds,
        strict_mode: strictMode,
        max_debate_rounds: enableDebate ? 2 : 0,
        paper_format: paperFormat,
        depth: 'deep',
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
    setPolledComplete(false);
    api.retrySession(currentSessionId)
      .then(() => setActiveTab('feed'))
      .catch(() => {});
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

  const refreshSessionDetail = () => {
    if (!currentSessionId) return;
    api.getSessionDetail(currentSessionId)
      .then(setSessionDetail)
      .catch(() => {});
  };

  const loadResources = useCallback((sessId: string) => {
    api.getPaper(sessId)
      .then((p) => setResourceBibliography(Array.isArray(p?.bibliography) ? p.bibliography : []))
      .catch(() => setResourceBibliography([]));
    api.listSessionResources(sessId)
      .then((res) => setSessionResources(Array.isArray(res?.resources) ? res.resources : []))
      .catch(() => setSessionResources([]));
  }, []);

  // Reset polling state when session changes
  useEffect(() => {
    setPolledComplete(false);
  }, [currentSessionId]);

  useEffect(() => {
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

    // Initial poll
    poll();

    // Only poll if not complete and websocket is not connected (fallback) or very rarely if complete
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      poll();
    }, effectiveComplete ? 60000 : (isConnected ? 30000 : 6000));
    
    return () => clearInterval(interval);
  }, [currentSessionId, effectiveComplete, error, isConnected]);

  useEffect(() => {
    const isReady = effectiveComplete || sessionDetail?.status === 'complete';
    if (!currentSessionId || !isReady) {
      setResourceBibliography([]);
      setSessionResources([]);
      return;
    }
    loadResources(currentSessionId);
  }, [currentSessionId, effectiveComplete, sessionDetail?.status, loadResources]);

  return (
    <div className="h-screen flex mesh-bg">
      {/* ── Sidebar ─────────────────────────────────── */}
      <aside className="w-64 shrink-0 hidden md:block">
        <Sidebar
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
        />
      </aside>

      {/* ── Main Content ────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 animate-premium-fade">
        {/* ── Top Bar ─────────────────────────────────── */}
        <header className="flex items-center justify-between px-6 md:px-10 py-5 glass z-20 sticky top-0 border-b border-orion-border/60 backdrop-blur-xl shadow-sm transition-all duration-300">
          <div className="flex items-center gap-6">
            {/* Mobile menu trigger */}
            <button onClick={handleNewSession} className="md:hidden p-2 rounded-xl hover:bg-orion-surface-2 transition-colors border border-orion-border">
              <Search className="h-5 w-5 text-orion-text-muted" />
            </button>
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as Tab)}
              className="md:hidden min-w-0 rounded-xl border border-orion-border bg-orion-surface px-3 py-1.5 text-sm font-semibold text-orion-text shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {tabs.map((tab) => (
                <option key={tab.key} value={tab.key} disabled={tab.requiresSession && !currentSessionId}>
                  {tab.label}
                </option>
              ))}
            </select>

            {/* Tab Switcher */}
            <div className="hidden md:flex items-center p-1 rounded-full bg-orion-surface/40 border border-white/60 shadow-sm backdrop-blur-xl">
              <button
                onClick={() => setActiveTab('new')}
                className={`flex items-center gap-2 px-5 py-2 nav-pill text-sm transition-all ${
                  activeTab === 'new'
                    ? 'nav-pill-active holographic-glow'
                    : 'text-orion-text-muted hover:text-orion-text hover:bg-orion-surface/50'
                }`}
              >
                <PlusCircle className="h-4 w-4" />
                New Research
              </button>
              <button
                onClick={() => setActiveTab('feed')}
                disabled={!currentSessionId}
                className={`flex items-center gap-2 px-5 py-2 nav-pill text-sm transition-all ${
                  activeTab === 'feed'
                    ? 'nav-pill-active holographic-glow'
                    : 'text-orion-text-muted hover:text-orion-text hover:bg-orion-surface/50'
                } ${!currentSessionId ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Radio className="h-4 w-4" />
                Research Feed
              </button>
              <button
                onClick={() => setActiveTab('paper')}
                disabled={!currentSessionId}
                className={`flex items-center gap-2 px-5 py-2 nav-pill text-sm transition-all ${
                  activeTab === 'paper'
                    ? 'nav-pill-active holographic-glow'
                    : 'text-orion-text-muted hover:text-orion-text hover:bg-orion-surface/50'
                } ${!currentSessionId ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <FileText className="h-4 w-4" />
                Final Paper
              </button>
              <button
                onClick={() => setActiveTab('insights')}
                disabled={!currentSessionId}
                className={`flex items-center gap-2 px-5 py-2 nav-pill text-sm transition-all ${
                  activeTab === 'insights'
                    ? 'nav-pill-active holographic-glow'
                    : 'text-orion-text-muted hover:text-orion-text hover:bg-orion-surface/50'
                } ${!currentSessionId ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <BarChart3 className="h-4 w-4" />
                Visual Insights
              </button>
              <button
                onClick={() => setActiveTab('resources')}
                disabled={!currentSessionId}
                className={`flex items-center gap-2 px-5 py-2 nav-pill text-sm transition-all ${
                  activeTab === 'resources'
                    ? 'nav-pill-active holographic-glow'
                    : 'text-orion-text-muted hover:text-orion-text hover:bg-orion-surface/50'
                } ${!currentSessionId ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <FolderArchive className="h-4 w-4" />
                Resources
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {currentSessionId && (
              <div className="flex items-center gap-3">
                {!effectiveComplete && sessionDetail?.status !== 'cancelled' && !error && (
                  <button
                    onClick={() => { sendStop(); api.cancelSession(currentSessionId).catch(() => {}); }}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-orion-error border border-orion-error/30 bg-orion-error/5 hover:bg-orion-error/15 transition-all shadow-sm"
                  >
                    <Square className="h-3.5 w-3.5" />
                    Stop
                  </button>
                )}
                {(error || sessionDetail?.status === 'cancelled' || sessionDetail?.status === 'error') && (
                  <button
                    onClick={handleRetry}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-orion-accent border border-orion-accent/30 bg-orion-accent/5 hover:bg-orion-accent/15 transition-all shadow-sm"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                )}
                <span className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm border ${
                  effectiveComplete ? 'bg-orion-success/10 text-orion-success border-orion-success/30' :
                  error || sessionDetail?.status === 'error' ? 'bg-orion-error/10 text-orion-error border-orion-error/30' :
                  sessionDetail?.status === 'cancelled' ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' :
                  'bg-orion-accent/10 text-orion-accent border-orion-accent/30'
                }`}>
                  <span className={`h-2 w-2 rounded-full ${
                    effectiveComplete ? 'bg-orion-success' :
                    error || sessionDetail?.status === 'error' ? 'bg-orion-error' :
                    sessionDetail?.status === 'cancelled' ? 'bg-amber-500' :
                    'bg-orion-accent animate-pulse'
                  }`} />
                  {effectiveComplete ? 'Complete' : error || sessionDetail?.status === 'error' ? 'Error' : sessionDetail?.status === 'cancelled' ? 'Cancelled' : 'In Progress'}
                </span>
                <div className="h-8 w-px bg-orion-border mx-1 hidden md:block" />
                <button
                  onClick={handleNewSession}
                  className="hidden md:flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-orion-text bg-orion-surface border border-orion-border hover:bg-orion-surface-2 transition-all shadow-sm"
                >
                  <PlusCircle className="h-4 w-4 text-orion-accent" />
                  New
                </button>
                <button onClick={() => setDarkMode(!darkMode)} className="p-2.5 rounded-xl border border-orion-border bg-orion-surface text-orion-text hover:bg-orion-surface-2 transition-all shadow-sm active:scale-90" title="Toggle Theme">
                  {darkMode ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-orion-accent" />}
                </button>
              </div>
            )}
            {!currentSessionId && (
              <button onClick={() => setDarkMode(!darkMode)} className="p-2.5 rounded-xl border border-orion-border bg-orion-surface text-orion-text hover:bg-orion-surface-2 transition-all shadow-sm active:scale-90">
                {darkMode ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-orion-accent" />}
              </button>
            )}
          </div>
        </header>

        {/* ── Content Area ────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-hidden p-3 md:p-6">
          <div className="h-full rounded-[24px] border border-orion-border bg-orion-surface/40 backdrop-blur-3xl shadow-[0_8px_40px_rgba(0,0,0,0.06)] overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 1.01 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="h-full"
            >
              {activeTab === 'new' ? (
            <div className="h-full overflow-y-auto">
              <div className="card-premium section-accent max-w-4xl mx-auto mt-8 md:mt-16 animate-slide-up relative">
                <div className="space-y-6">
                  <h2 className="text-title text-center mb-6">Deep Research Query</h2>
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
                        className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-orion-surface shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-orion-border/50
                          text-orion-text placeholder:text-orion-text-dim text-md font-medium
                          focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10
                          transition-all duration-300"
                      />
                    </div>
                    <button
                      onClick={handleStart}
                      disabled={isStarting || !topic.trim()}
                      className="px-8 py-3.5 btn-primary font-medium text-md
                        disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed
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
                    <div className="flex items-center justify-between rounded-xl border border-orion-border/50 bg-orion-surface-2 px-4 py-3">
                      <span className="text-sm font-medium text-orion-text-muted">Strict synthesis mode</span>
                      <button
                        type="button"
                        onClick={() => setStrictMode((v) => !v)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orion-accent/20 ${strictMode ? 'bg-orion-accent' : 'bg-orion-border/60'}`}
                        aria-pressed={strictMode}
                        aria-label="Toggle strict synthesis mode"
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-orion-surface shadow-sm transition-transform ${strictMode ? 'translate-x-6' : 'translate-x-1'}`}
                        />
                      </button>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-orion-border/50 bg-orion-surface-2 px-4 py-3">
                      <span className="text-sm font-medium text-orion-text-muted">Peer-review debate</span>
                      <button
                        type="button"
                        onClick={() => setEnableDebate((v) => !v)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orion-accent/20 ${enableDebate ? 'bg-orion-accent' : 'bg-orion-border/60'}`}
                        aria-pressed={enableDebate}
                        aria-label="Toggle peer-review debate"
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-orion-surface shadow-sm transition-transform ${enableDebate ? 'translate-x-6' : 'translate-x-1'}`}
                        />
                      </button>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-orion-border/50 bg-orion-surface-2 px-4 py-3">
                      <span className="text-sm font-medium text-orion-text-muted">Paper format</span>
                      <select
                        value={paperFormat}
                        onChange={(e) => setPaperFormat(e.target.value)}
                        className="border border-orion-border/50 rounded-lg px-3 py-1 bg-orion-surface text-sm font-medium text-orion-text focus:outline-none focus:ring-2 focus:ring-orion-accent/20 cursor-pointer"
                      >
                        <option value="academic">Academic</option>
                        <option value="ieee">IEEE</option>
                        <option value="apa">APA</option>
                        <option value="acm">ACM</option>
                        <option value="mla">MLA</option>
                      </select>
                    </div>
                  </div>

                  {/* PDF Upload */}
                  <div className="pt-2">
                    <PdfUpload onFilesChange={setUploadedFileIds} />
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'feed' ? (
            <ResearchFeed items={feedItems} isConnected={isConnected} isPollingFallback={isPollingFallback} warning={warning} />
          ) : activeTab === 'paper' ? (
             <PaperViewer sessionId={currentSessionId} isComplete={effectiveComplete} />
          ) : activeTab === 'insights' ? (
            <VisualInsights
              sessionId={currentSessionId}
              isReady={effectiveComplete || sessionDetail?.status === 'complete'}
              sessionDetail={sessionDetail}
              feedItems={feedItems}
            />
          ) : activeTab === 'resources' ? (
            <div className="h-full overflow-y-auto p-6 md:p-10 animate-fade-in relative">
              <div className="max-w-6xl mx-auto space-y-8 relative z-10">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div>
                    <h2 className="text-xl font-black tracking-tight text-orion-text mb-2">Research Library</h2>
                    <p className="text-orion-text-dim text-xs font-medium max-w-lg">Access all synthesized sources, verified citations, and generated artifacts from your research session.</p>
                  </div>
                  <button
                    onClick={() => currentSessionId && loadResources(currentSessionId)}
                    disabled={!currentSessionId}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orion-surface border border-orion-border text-orion-text font-bold hover:bg-orion-surface-2 transition-all shadow-sm disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Refresh Library
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 space-y-6">
                    <section>
                      <div className="flex items-center gap-3 mb-4">
                        <FileText className="h-5 w-5 text-orion-accent" />
                        <h3 className="text-sm font-black text-orion-text uppercase tracking-widest">Synthesized Sources</h3>
                      </div>
                      
                      {resourceBibliography.length === 0 ? (
                        <div className="card-premium flex flex-col items-center justify-center py-16 text-center">
                          <div className="p-4 rounded-full bg-orion-surface-2 border border-orion-border mb-4">
                            <FolderArchive className="h-10 w-10 text-orion-text-dim" />
                          </div>
                          <p className="text-orion-text-muted font-medium">No sources synthesized yet.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-4">
                          {resourceBibliography.map((b, i) => (
                            <div key={`${String(b.paper_id || i)}-${i}`} className="card-premium !p-6 flex flex-col md:flex-row gap-6 items-start">
                              <div className="w-10 h-10 shrink-0 rounded-xl bg-orion-surface-2 border border-orion-border flex items-center justify-center text-orion-text-dim font-bold text-xl">
                                {i + 1}
                              </div>
                              <div className="flex-1">
                                <h4 className="text-sm font-bold text-orion-text leading-snug mb-1">{String(b.title || 'Untitled Source')}</h4>
                                <p className="text-orion-text-dim text-[11px] font-medium mb-2">{String(b.authors || 'Unknown Authors')} · {String(b.year || 'n.d.')}</p>
                                <div className="flex flex-wrap gap-2">
                                  {Boolean(b.verified) && <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-emerald-100 dark:border-emerald-800/40 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Verified</span>}
                                  {Boolean(b.doi) && <span className="px-2.5 py-1 rounded-lg bg-orion-accent/10 text-orion-accent text-xs font-bold border border-orion-accent/20">DOI: {String(b.doi)}</span>}
                                  {Boolean(b.url) && <a href={String(b.url)} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg bg-orion-surface-2 text-orion-text-muted text-xs font-bold border border-orion-border hover:bg-orion-surface-3 transition-colors">View Source</a>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>

                  <div className="space-y-6">
                    <section>
                      <div className="flex items-center gap-3 mb-4">
                        <Download className="h-5 w-5 text-orion-accent" />
                        <h3 className="text-sm font-black text-orion-text uppercase tracking-widest">Export Artifacts</h3>
                      </div>
                      <div className="space-y-3">
                        <button
                          onClick={handleExport}
                          disabled={!currentSessionId || !effectiveComplete}
                          className="w-full card-premium !p-5 flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-orion-accent/10 text-orion-accent group-hover:bg-orion-accent group-hover:text-white transition-all"><FolderArchive className="h-5 w-5" /></div>
                            <div className="text-left">
                              <p className="font-bold text-orion-text">Research Bundle</p>
                              <p className="text-xs text-orion-text-muted">JSON Archive</p>
                            </div>
                          </div>
                          <Download className="h-5 w-5 text-orion-text-dim group-hover:text-orion-accent transition-colors" />
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
                          className="w-full card-premium !p-5 flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-all"><FileText className="h-5 w-5" /></div>
                            <div className="text-left">
                              <p className="font-bold text-orion-text">Final Manuscript</p>
                              <p className="text-xs text-orion-text-muted">Markdown Format</p>
                            </div>
                          </div>
                          <Download className="h-5 w-5 text-orion-text-dim group-hover:text-emerald-600 transition-colors" />
                        </button>

                        <button
                          onClick={() => {
                            if (!currentSessionId) return;
                            const a = document.createElement('a');
                            a.href = api.paperPdfDownloadUrl(currentSessionId);
                            a.download = `orion-report-${currentSessionId.slice(0, 8)}.pdf`;
                            a.click();
                          }}
                          disabled={!currentSessionId || !effectiveComplete}
                          className="w-full card-premium !p-5 flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 group-hover:bg-rose-600 group-hover:text-white transition-all"><FileText className="h-5 w-5" /></div>
                            <div className="text-left">
                              <p className="font-bold text-orion-text">PDF Report</p>
                              <p className="text-xs text-orion-text-muted">Backend-generated PDF</p>
                            </div>
                          </div>
                          <Download className="h-5 w-5 text-orion-text-dim group-hover:text-rose-600 transition-colors" />
                        </button>
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center gap-3 mb-4">
                        <Activity className="h-5 w-5 text-orion-accent" />
                        <h3 className="text-sm font-black text-orion-text uppercase tracking-widest">Session Files</h3>
                      </div>
                      <div className="card-premium !p-4 space-y-2">
                        {sessionResources.length === 0 ? (
                          <p className="text-orion-text-dim text-sm font-medium text-center py-4">No individual files saved.</p>
                        ) : (
                          sessionResources.map((f) => (
                            <a
                              key={f.name}
                              href={currentSessionId ? api.resourceDownloadUrl(currentSessionId, f.name) : '#'}
                              className="flex items-center justify-between p-3 rounded-xl hover:bg-orion-surface-2 group transition-all"
                            >
                              <span className="text-sm font-bold text-orion-text-muted group-hover:text-orion-accent">{f.name}</span>
                              <span className="text-xs text-orion-text-dim">{(f.size_bytes / 1024).toFixed(1)} KB</span>
                            </a>
                          ))
                        )}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </div>
) : null}
            </motion.div>
          </AnimatePresence>
          </div>
        </div>
      </main>
      <ResearchChatFloating sessionId={currentSessionId} />
    </div>
  );
}
