import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowRight,
  BarChart2,
  BookOpen,
  Brain,
  Database,
  FileText,
  Menu,
  Microscope,
  Plus,
  RotateCcw,
  Square,
  X,
  Zap
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sidebar }       from './components/Sidebar';
import { ResearchFeed }  from './components/ResearchFeed';
import { PaperViewer }   from './components/PaperViewer';
import { SourceDossier } from './components/SourceDossier';
import { PdfUpload }     from './components/PdfUpload';
import { AuthScreen }    from './components/AuthScreen';
import { LandingPage }   from './components/LandingPage';
import { SessionStats }  from './components/SessionStats';
import { useWebSocket }  from './hooks/useWebSocket';
import { api }           from './api';
import { supabase }      from './supabase';
import type { SessionDetail, PaperResult } from './types';

type AppView  = 'landing' | 'auth' | 'app';
type WorkView = 'idle' | 'running' | 'done';
type RightTab = 'paper' | 'sources' | 'stats';
type Depth    = 'quick' | 'standard' | 'deep';

const PAPER_FORMATS = [
  { value: 'ieee', label: 'IEEE', desc: 'Two-Column Conference' },
  { value: 'acm',  label: 'ACM',  desc: 'Two-Column Sigconf' },
  { value: 'apa',  label: 'APA 7', desc: 'Single-Column Professional' },
  { value: 'mla',  label: 'MLA 9', desc: 'Double-Spaced Academic' },
] as const;

const PAPER_TYPES = [
  { value: 'experimental', label: 'Research Article' },
  { value: 'survey',       label: 'Survey / Review' },
  { value: 'system',       label: 'System Paper' },
  { value: 'position',     label: 'Position Paper' },
] as const;

const DEPTHS: Array<{ value: Depth; label: string; icon: typeof Zap; specs: string; est: string }> = [
  { value: 'quick',    label: 'Quick Synthesis',   icon: Zap,        specs: '8–10 papers · 0 debate rounds', est: '~3–5 min' },
  { value: 'standard', label: 'Standard Review',   icon: BookOpen,   specs: '12–15 papers · 1 debate round', est: '~6–8 min' },
  { value: 'deep',     label: 'Deep Deliberation', icon: Microscope, specs: '15–20 papers · 2 debate rounds', est: '~10–14 min' },
];

const EXAMPLE_TOPICS = [
  'Vision transformers for medical image segmentation',
  'Federated learning privacy attacks and defences',
  'Retrieval-augmented generation for code generation',
];

export default function App() {
  const [appView,     setAppView]     = useState<AppView>('landing');
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const reduceMotion = useReducedMotion();

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [topic,             setTopic]            = useState('');
  const [isStarting,        setIsStarting]       = useState(false);
  const [uploadedFileIds,   setUploadedFileIds]  = useState<string[]>([]);
  const [polledComplete,    setPolledComplete]   = useState(false);
  const [paperFormat,       setPaperFormat]      = useState('ieee');
  const [paperType,         setPaperType]        = useState('experimental');
  const [depth,             setDepth]            = useState<Depth>('deep');
  const [sessionDetail,     setSessionDetail]    = useState<SessionDetail | null>(null);
  const [actionError,       setActionError]      = useState<string | null>(null);
  const [rightTab,          setRightTab]         = useState<RightTab>('paper');
  const [paper,             setPaper]            = useState<PaperResult | null>(null);
  const [mobileMenuOpen,    setMobileMenuOpen]   = useState(false);

  const { isConnected, isPollingFallback, feedItems, isComplete, error, warning, sendStop, connect } = useWebSocket(currentSessionId);
  const effectiveComplete = isComplete || polledComplete || sessionDetail?.status === 'complete';
  const view: WorkView    = !currentSessionId ? 'idle' : effectiveComplete ? 'done' : 'running';
  const isError           = Boolean(error) || sessionDetail?.status === 'error';
  const isCancelled       = sessionDetail?.status === 'cancelled';
  const activeTopic       = sessionDetail?.topic || topic || 'Research session';

  // Auth initialization
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthSession(data.session);
      setAuthLoading(false);
      if (data.session) setAppView('app');
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthSession(session);
      setAppView(session ? 'app' : 'landing');
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Load paper when complete
  useEffect(() => {
    if (effectiveComplete && currentSessionId) {
      api.getPaper(currentSessionId).then(setPaper).catch(() => {});
    }
  }, [effectiveComplete, currentSessionId]);

  // ── Handlers ──
  const handleStart = async () => {
    const cleanedTopic = topic.trim();
    if (!cleanedTopic) return;
    setIsStarting(true);
    setActionError(null);
    setPolledComplete(false);
    setPaper(null);
    try {
      const result = await api.startResearchAdvanced({
        topic: cleanedTopic,
        uploaded_paper_ids: uploadedFileIds,
        strict_mode: true,
        max_debate_rounds: depth === 'deep' ? 2 : depth === 'standard' ? 1 : 0,
        paper_format: paperFormat,
        paper_type: paperType,
        depth,
      });
      setCurrentSessionId(result.session_id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to start research');
    } finally {
      setIsStarting(false);
    }
  };

  const handleNewSession = () => {
    setCurrentSessionId(null);
    setTopic('');
    setUploadedFileIds([]);
    setPolledComplete(false);
    setSessionDetail(null);
    setActionError(null);
    setPaper(null);
    setRightTab('paper');
  };

  const handleSelectSession = (sessionId: string | null) => {
    if (!sessionId) return;
    setCurrentSessionId(sessionId);
    setPolledComplete(false);
    setActionError(null);
    setPaper(null);
    api.getSessionDetail(sessionId).then(setSessionDetail).catch((err) => {
      setActionError(err instanceof Error ? err.message : 'Could not load session');
    });
  };

  const handleRetry = async () => {
    if (!currentSessionId) return;
    setPolledComplete(false);
    setActionError(null);
    try {
      await api.retrySession(currentSessionId);
      const detail = await api.getSessionDetail(currentSessionId);
      setSessionDetail(detail);
      connect();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Retry failed');
    }
  };

  const handleCancel = async () => {
    if (!currentSessionId) return;
    setActionError(null);
    sendStop();
    try { await api.cancelSession(currentSessionId); }
    catch (err) { setActionError(err instanceof Error ? err.message : 'Cancel failed'); }
  };

  // Background Polling
  useEffect(() => { setPolledComplete(false); }, [currentSessionId]);

  useEffect(() => {
    if (!currentSessionId) return;
    const poll = () => {
      Promise.all([api.getSessionStatus(currentSessionId), api.getSessionDetail(currentSessionId)])
        .then(([status, detail]) => {
          if (status?.status === 'complete') setPolledComplete(true);
          setSessionDetail(detail);
        })
        .catch((err) => console.warn('Background polling check:', err));
    };
    poll();
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      poll();
    }, effectiveComplete ? 60000 : (isConnected ? 30000 : 6000));
    return () => clearInterval(interval);
  }, [currentSessionId, effectiveComplete, isConnected]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary text-white flex items-center justify-center">
            <Brain size={16} />
          </div>
          <span className="text-xs font-medium text-ink-mute">Initializing Delve…</span>
        </div>
      </div>
    );
  }

  if (appView === 'landing') return <LandingPage onSignIn={() => setAppView('auth')} />;
  if (appView === 'auth' || !authSession) return <AuthScreen />;

  const viewMotion = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
    : { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.12, ease: 'easeOut' as const } };

  return (
    <div className="flex h-screen bg-canvas">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden w-[280px] shrink-0 md:block">
        <Sidebar
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
        />
      </aside>

      {/* ── Mobile Sidebar Drawer ── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-xs md:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.2 }}
              className="fixed inset-y-0 left-0 z-50 w-[300px] shadow-lg md:hidden flex flex-col bg-surface border-r border-line"
            >
              <div className="flex items-center justify-between p-3.5 border-b border-line shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-primary text-white flex items-center justify-center font-bold text-xs">
                    <Brain size={13} />
                  </div>
                  <span className="font-semibold text-xs text-ink">ResearchAgent</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded text-ink-mute hover:text-ink hover:bg-surface-subtle"
                  aria-label="Close menu"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <Sidebar
                  currentSessionId={currentSessionId}
                  onSelectSession={(id) => {
                    handleSelectSession(id);
                    setMobileMenuOpen(false);
                  }}
                  onNewSession={() => {
                    handleNewSession();
                    setMobileMenuOpen(false);
                  }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Main Content Area ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* ── Top Header Bar ── */}
        <header className="shrink-0 bg-surface border-b border-line">
          <div className="mx-auto flex h-14 w-full max-w-[1040px] items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="control-button p-1.5 md:hidden shrink-0"
                aria-label="Open sessions menu"
              >
                <Menu size={15} />
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="mono-kicker text-[10px]">
                    {view === 'idle' ? 'Workspace' : view === 'running' ? 'Active Run' : 'Deliberation Result'}
                  </span>
                </div>
                <p className="truncate text-xs sm:text-sm font-semibold text-ink leading-tight mt-0.5">
                  {view === 'idle' ? 'Autonomous Academic Deep Research' : activeTopic}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* Status Indicator */}
              <div className="hidden sm:inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-line bg-surface-subtle">
                <span
                  className={`status-dot ${
                    effectiveComplete
                      ? 'bg-ok'
                      : isError
                      ? 'bg-err'
                      : isCancelled
                      ? 'bg-warn'
                      : currentSessionId
                      ? 'status-dot-running'
                      : 'bg-ink-mute'
                  }`}
                />
                <span className="font-mono text-xs font-medium text-ink-soft">
                  {effectiveComplete
                    ? 'Complete'
                    : isError
                    ? 'Error'
                    : isCancelled
                    ? 'Cancelled'
                    : currentSessionId
                    ? 'Synthesizing'
                    : 'Ready'}
                </span>
              </div>

              {view === 'running' && !isError && !isCancelled && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="control-button text-xs font-medium"
                >
                  <Square size={12} /> <span className="hidden sm:inline">Stop</span>
                </button>
              )}
              {(isError || isCancelled) && currentSessionId && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="control-button control-button-primary text-xs font-medium"
                >
                  <RotateCcw size={12} /> <span className="hidden sm:inline">Retry</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleNewSession}
                className="control-button text-xs font-medium"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">New Run</span>
              </button>
            </div>
          </div>
        </header>

        {/* ── Content View ── */}
        <section className="min-h-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {/* ── IDLE: Topic Entry & Setup ── */}
            {view === 'idle' && (
              <motion.div key="idle" {...viewMotion} className="h-full overflow-y-auto">
                <div className="mx-auto flex min-h-full max-w-[840px] flex-col justify-center px-4 sm:px-6 py-8 sm:py-12">
                  {/* Lead Heading */}
                  <div className="mb-6">
                    <p className="mono-kicker text-xs mb-1.5">New Autonomous Research Run</p>
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-ink tracking-tight">
                      Synthesize Academic Literature & Draft Manuscripts
                    </h1>
                    <p className="mt-2.5 text-sm sm:text-base text-ink-soft leading-relaxed max-w-2xl">
                      Enter any academic research query. Eight autonomous agents will query repositories,
                      synthesize literature, conduct peer debate, and assemble a publication-grade manuscript.
                    </p>
                  </div>

                  {/* Topic Input Box */}
                  <div className="card p-5 sm:p-6 mb-4">
                    <label htmlFor="topic" className="block text-sm font-semibold text-ink mb-2">
                      Research topic or working hypothesis
                    </label>
                    <div className="flex flex-col gap-2.5 sm:flex-row">
                      <input
                        id="topic"
                        type="text"
                        value={topic}
                        autoFocus
                        onChange={(e) => setTopic(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                        placeholder="e.g. Vision transformers for medical image segmentation"
                        className="research-input flex-1 min-h-[46px] text-[15px]"
                      />
                      <button
                        type="button"
                        onClick={handleStart}
                        disabled={isStarting || !topic.trim()}
                        className="control-button control-button-primary disabled:opacity-50 shrink-0 font-medium"
                        style={{ minHeight: 46, padding: '0 1.5rem', fontSize: '14px' }}
                      >
                        {isStarting ? (
                          <span className="loading-dots"><span/><span/><span/></span>
                        ) : (
                          <>
                            <span>Start Research</span>
                            <ArrowRight size={15} />
                          </>
                        )}
                      </button>
                    </div>

                    {actionError && (
                      <div className="mt-3 rounded p-2.5 text-xs bg-err-subtle text-err border border-red-200">
                        {actionError}
                      </div>
                    )}

                    {/* Example Topic Prompts */}
                    <div className="mt-4 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-ink-mute mr-1">Suggested topics:</span>
                      {EXAMPLE_TOPICS.map((ex) => (
                        <button
                          key={ex}
                          type="button"
                          onClick={() => setTopic(ex)}
                          className="control-button text-xs py-1.5 px-3"
                          style={{ minHeight: 28 }}
                        >
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Research Settings & Configuration */}
                  <div className="card p-5 sm:p-6 space-y-6">
                    <div className="flex items-center justify-between border-b border-line pb-3">
                      <div>
                        <h2 className="mono-kicker text-xs">Execution Configuration</h2>
                        <p className="text-sm font-medium text-ink-soft mt-0.5">
                          {depth.toUpperCase()} Mode · {paperFormat.toUpperCase()} Format
                        </p>
                      </div>
                      <span className="badge badge-blue">Ready</span>
                    </div>

                    {/* Depth Selection */}
                    <div>
                      <p className="block text-sm font-semibold text-ink mb-2">
                        Research Depth & Deliberation Rounds
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {DEPTHS.map((item) => {
                          const Icon = item.icon;
                          const selected = depth === item.value;
                          return (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => setDepth(item.value)}
                              className={`rounded-md border p-3.5 text-left transition-colors ${
                                selected
                                  ? 'bg-surface-subtle border-ink text-ink shadow-xs'
                                  : 'bg-surface border-line text-ink-soft hover:border-line-strong'
                              }`}
                              aria-pressed={selected}
                            >
                              <div className="flex items-center gap-1.5 mb-1.5 text-ink">
                                <Icon size={15} />
                                <span className="font-semibold text-sm">{item.label}</span>
                              </div>
                              <div className="text-xs text-ink-mute leading-snug">{item.specs}</div>
                              <div className="text-xs text-ink-mute font-mono mt-1.5">{item.est}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Manuscript Profile & Publication Style */}
                    <div>
                      <p className="block text-sm font-semibold text-ink mb-2">
                        Publication Standard & Profile
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {PAPER_FORMATS.map((item) => {
                          const selected = paperFormat === item.value;
                          return (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => setPaperFormat(item.value)}
                              className={`p-2.5 rounded-lg border text-left transition-colors ${
                                selected
                                  ? 'bg-surface border-ink shadow-sm ring-1 ring-ink'
                                  : 'bg-surface border-line hover:border-line-dark'
                              }`}
                              aria-pressed={selected}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-xs text-ink">{item.label}</span>
                                {selected && <span className="h-1.5 w-1.5 rounded-full bg-ink" />}
                              </div>
                              <div className="text-[11px] text-ink-mute mt-0.5">{item.desc}</div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Paper Type Selector */}
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-ink-mute font-medium">Type:</span>
                        {PAPER_TYPES.map((pt) => {
                          const active = paperType === pt.value;
                          return (
                            <button
                              key={pt.value}
                              type="button"
                              onClick={() => setPaperType(pt.value)}
                              className={`px-2.5 py-1 text-xs rounded transition-colors border ${
                                active
                                  ? 'bg-ink text-white border-ink font-medium'
                                  : 'bg-surface border-line text-ink-soft hover:bg-surface-subtle'
                              }`}
                            >
                              {pt.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Verification Badges */}
                      <div className="mt-2.5 flex items-center gap-3 text-[11px] text-ink-mute flex-wrap">
                        <span className="flex items-center gap-1">
                          <span className="text-ok">✓</span> Professional Math Typesetting
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="text-ok">✓</span> CSL Citation Verification
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="text-ok">✓</span> Pre-Flight Document QA
                        </span>
                      </div>
                    </div>

                    {/* Custom PDF References */}
                    <div>
                      <p className="block text-sm font-semibold text-ink mb-2">
                        Reference PDF Documents (Optional)
                      </p>
                      <PdfUpload onFilesChange={setUploadedFileIds} />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── RUNNING: Live Feed ── */}
            {view === 'running' && (
              <motion.div key="running" {...viewMotion} className="h-full overflow-hidden">
                <ResearchFeed
                  items={feedItems}
                  isConnected={isConnected}
                  isPollingFallback={isPollingFallback}
                  warning={warning}
                  sessionError={actionError || error || sessionDetail?.error || null}
                  onRetry={handleRetry}
                />
              </motion.div>
            )}

            {/* ── DONE: Paper + Sources + Stats Tabs ── */}
            {view === 'done' && (
              <motion.div key="done" {...viewMotion} className="h-full flex flex-col overflow-hidden">
                {/* Clean Tab Bar */}
                <div className="shrink-0 flex items-center gap-1 sm:gap-2 px-4 sm:px-6 pt-2 bg-surface border-b border-line">
                  {([
                    { key: 'paper', label: 'Paper', fullLabel: 'Research Manuscript', icon: FileText },
                    { key: 'sources', label: 'Sources', fullLabel: 'Retrieved Sources & Proof', icon: Database },
                    { key: 'stats', label: 'Analytics', fullLabel: 'Session Analytics', icon: BarChart2 },
                  ] as const).map(({ key, label, fullLabel, icon: Icon }) => {
                    const active = rightTab === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setRightTab(key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                          active
                            ? 'border-ink text-ink font-semibold'
                            : 'border-transparent text-ink-mute hover:text-ink hover:border-line-strong'
                        }`}
                      >
                        <Icon size={14} className={active ? 'text-ink' : 'text-ink-mute'} />
                        <span className="hidden sm:inline">{fullLabel}</span>
                        <span className="sm:hidden">{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Tab content area */}
                <div className="flex-1 overflow-hidden">
                  <AnimatePresence mode="wait">
                    {rightTab === 'paper' && (
                      <motion.div key="paper" {...viewMotion} className="h-full overflow-hidden">
                        <PaperViewer sessionId={currentSessionId} isComplete={effectiveComplete} paper={paper} />
                      </motion.div>
                    )}
                    {rightTab === 'sources' && (
                      <motion.div key="sources" {...viewMotion} className="h-full overflow-hidden">
                        <SourceDossier paper={paper} detail={sessionDetail} />
                      </motion.div>
                    )}
                    {rightTab === 'stats' && sessionDetail && (
                      <motion.div key="stats" {...viewMotion} className="h-full overflow-y-auto px-4 sm:px-6 py-6 sm:py-8">
                        <div className="mx-auto max-w-[880px]">
                          <SessionStats detail={sessionDetail} paper={paper} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}
