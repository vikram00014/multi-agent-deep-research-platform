import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRight, BarChart2, Brain, ChevronDown, FileText, Menu, Plus, RotateCcw, Sparkles, Square, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sidebar }       from './components/Sidebar';
import { ResearchFeed }  from './components/ResearchFeed';
import { PaperViewer }   from './components/PaperViewer';
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
type RightTab = 'paper' | 'stats';
type Depth    = 'quick' | 'standard' | 'deep';

const PAPER_FORMATS = [
  { value: 'ieee',     label: 'IEEE' },
  { value: 'academic', label: 'Academic' },
  { value: 'apa',      label: 'APA' },
  { value: 'acm',      label: 'ACM' },
  { value: 'mla',      label: 'MLA' },
] as const;

const DEPTHS: Array<{ value: Depth; label: string; desc: string }> = [
  { value: 'quick',    label: '⚡ Quick',    desc: '~8 min, 10 LLM calls' },
  { value: 'standard', label: '📚 Standard', desc: '~12 min, 16 calls' },
  { value: 'deep',     label: '🔬 Deep',     desc: '~20 min, 24 calls' },
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
  const [depth,             setDepth]            = useState<Depth>('deep');
  const [optionsOpen,       setOptionsOpen]      = useState(false);
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

  // ── Handlers ────────────────────────────────────────────────────────────

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

  // Polling
  useEffect(() => { setPolledComplete(false); }, [currentSessionId]);

  useEffect(() => {
    if (!currentSessionId) return;
    const poll = () => {
      Promise.all([api.getSessionStatus(currentSessionId), api.getSessionDetail(currentSessionId)])
        .then(([status, detail]) => {
          if (status?.status === 'complete') setPolledComplete(true);
          setSessionDetail(detail);
        })
        .catch((err) => setActionError(err instanceof Error ? err.message : 'Polling failed'));
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--gradient-hero)' }}>
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: 'var(--gradient-primary)' }}>
            <Brain size={18} color="white" />
          </div>
          <span className="font-semibold text-sm tracking-wide" style={{ color: 'var(--color-ink-soft)' }}>Loading Delve…</span>
        </motion.div>
      </div>
    );
  }

  if (appView === 'landing') return <LandingPage onSignIn={() => setAppView('auth')} />;
  if (appView === 'auth' || !authSession) return <AuthScreen />;

  const viewMotion = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
    : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.15, ease: 'easeOut' as const } };

  // ── Status badge config ──────────────────────────────────────────────
  const statusBadge = effectiveComplete
    ? { label: 'Complete',   color: 'var(--color-ok)',   bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)' }
    : isError
      ? { label: 'Error',     color: 'var(--color-err)',  bg: 'rgba(244,63,94,0.15)',  border: 'rgba(244,63,94,0.3)' }
      : isCancelled
        ? { label: 'Cancelled', color: 'var(--color-warn)', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.3)' }
        : currentSessionId
          ? { label: 'Researching', color: 'var(--color-blue-dim)', bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.3)' }
          : { label: 'Ready',    color: 'var(--color-ink-mute)', bg: 'var(--color-raised)',  border: 'var(--color-line)' };

  return (
    <div className="flex h-screen" style={{ background: 'var(--color-canvas)' }}>

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden w-[270px] shrink-0 md:block">
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
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="fixed inset-y-0 left-0 z-50 w-[290px] shadow-2xl md:hidden flex flex-col"
              style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-line)' }}
            >
              <div className="flex items-center justify-between p-4 border-b shrink-0" style={{ borderColor: 'var(--color-line)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shadow-md" style={{ background: 'var(--gradient-primary)' }}>
                    <Brain size={15} color="white" />
                  </div>
                  <span className="font-bold text-sm" style={{ color: 'var(--color-ink)' }}>Delve Research</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
                  style={{ color: 'var(--color-ink-mute)' }}
                  aria-label="Close menu"
                >
                  <X size={18} />
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

        {/* ── Top Header ── */}
        <header
          className="shrink-0 card-glass"
          style={{
            borderRadius: 0,
            borderTop: 0,
            borderLeft: 0,
            borderRight: 0,
          }}
        >
          <div className="mx-auto flex h-[62px] w-full max-w-[960px] items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Mobile Hamburger Button */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="control-button p-2 md:hidden shrink-0"
                aria-label="Open sessions menu"
              >
                <Menu size={16} />
              </button>

              <div className="min-w-0">
                <p className="mono-kicker text-[10px]">
                  {view === 'idle' ? 'New research' : view === 'running' ? 'In progress' : 'Paper ready'}
                </p>
                <p className="truncate text-sm font-semibold mt-0.5" style={{ color: 'var(--color-ink)' }}>
                  {view === 'idle' ? 'Academic Deep Research' : activeTopic}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* Status badge */}
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ background: statusBadge.bg, color: statusBadge.color, border: `1px solid ${statusBadge.border}` }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: statusBadge.color,
                    animation: currentSessionId && !effectiveComplete && !isError ? 'pulse-glow 1.8s ease infinite' : 'none',
                  }}
                />
                {statusBadge.label}
              </span>

              {view === 'running' && !isError && !isCancelled && (
                <button type="button" onClick={handleCancel} className="control-button text-xs">
                  <Square size={13} /> <span className="hidden sm:inline">Stop</span>
                </button>
              )}
              {(isError || isCancelled) && currentSessionId && (
                <button type="button" onClick={handleRetry} className="control-button control-button-primary text-xs">
                  <RotateCcw size={13} /> <span className="hidden sm:inline">Retry</span>
                </button>
              )}
              <button type="button" onClick={handleNewSession} className="control-button text-xs">
                <Plus size={13} /><span className="hidden sm:inline">New</span>
              </button>
            </div>
          </div>

          {/* Connection warning */}
          {(isPollingFallback || warning) && (
            <div className="px-4 py-1 text-center text-xs"
              style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--color-warn)', borderTop: '1px solid rgba(245,158,11,0.2)' }}>
              {warning || 'Live updates reconnecting — utilizing background polling.'}
            </div>
          )}
        </header>

        {/* ── Content ── */}
        <section className="min-h-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait">

            {/* ── IDLE: Topic Entry ── */}
            {view === 'idle' && (
              <motion.div key="idle" {...viewMotion} className="h-full overflow-y-auto">
                <div className="mx-auto flex min-h-full max-w-[860px] flex-col justify-center px-4 sm:px-6 py-8 sm:py-12">

                  {/* Hero heading */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mb-8"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: 'var(--gradient-primary)', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
                        <Sparkles size={14} color="white" />
                      </div>
                      <p className="mono-kicker">Delve Research Platform</p>
                    </div>
                    <h1 className="max-w-[760px] text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight"
                      style={{ color: 'var(--color-ink)', letterSpacing: '-0.025em' }}>
                      Deep research,{' '}
                      <span className="gradient-text">7 specialized AI agents,</span>
                      {' '}automated.
                    </h1>
                    <p className="mt-3 text-sm sm:text-base max-w-[620px]" style={{ color: 'var(--color-ink-soft)', lineHeight: 1.6 }}>
                      Enter any academic research query. Delve will search databases, synthesize literature, debate rigor, and generate publication-ready papers.
                    </p>
                  </motion.div>

                  {/* Topic Input Box */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, duration: 0.3 }}
                    className="card p-6 mb-4"
                  >
                    <label htmlFor="topic" className="mono-kicker mb-2.5 block text-xs">Research topic</label>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        id="topic"
                        type="text"
                        value={topic}
                        autoFocus
                        onChange={(e) => setTopic(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                        placeholder="e.g. Vision transformers for medical image segmentation"
                        className="delve-input flex-1 min-h-[48px] text-sm"
                      />
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={handleStart}
                        disabled={isStarting || !topic.trim()}
                        className="control-button control-button-primary disabled:opacity-50"
                        style={{ minHeight: 48, padding: '0 1.5rem', borderRadius: 10, fontSize: 14 }}
                      >
                        {isStarting ? (
                          <span className="loading-dots"><span/><span/><span/></span>
                        ) : (
                          <><Brain size={16} /> Start research <ArrowRight size={15} /></>
                        )}
                      </motion.button>
                    </div>

                    {actionError && (
                      <div className="mt-3 rounded-xl px-4 py-3 text-xs font-medium"
                        style={{ background: 'rgba(244,63,94,0.1)', color: 'var(--color-err)', border: '1px solid rgba(244,63,94,0.25)' }}>
                        {actionError}
                      </div>
                    )}

                    {/* Example Topics */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--color-ink-mute)' }}>Try:</span>
                      {EXAMPLE_TOPICS.map((ex) => (
                        <button key={ex} type="button" onClick={() => setTopic(ex)}
                          className="control-button text-xs"
                          style={{ borderRadius: 999, padding: '0.25rem 0.75rem', minHeight: 0, fontSize: 12 }}>
                          {ex}
                        </button>
                      ))}
                    </div>
                  </motion.div>

                  {/* Research Settings & PDF Grounding */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.3 }}
                    className="card overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setOptionsOpen((o) => !o)}
                      className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-white/[0.02] transition-colors"
                      aria-expanded={optionsOpen}
                    >
                      <span>
                        <span className="mono-kicker block text-xs">Pipeline Configuration</span>
                        <span className="mt-0.5 block text-xs" style={{ color: 'var(--color-ink-soft)' }}>
                          {depth} depth · {paperFormat.toUpperCase()} citation format
                        </span>
                      </span>
                      <ChevronDown
                        size={16}
                        color="var(--color-ink-mute)"
                        style={{ transform: optionsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}
                      />
                    </button>

                    <AnimatePresence>
                      {optionsOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden"
                        >
                          <div className="px-6 pb-6 space-y-6" style={{ borderTop: '1px solid var(--color-line)' }}>
                            {/* Depth Selection */}
                            <div className="pt-4">
                              <p className="mono-kicker mb-2.5 text-xs">Research Depth</p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                {DEPTHS.map((item) => (
                                  <button key={item.value} type="button" onClick={() => setDepth(item.value)}
                                    className="rounded-xl border p-3 text-xs text-left transition-all"
                                    style={depth === item.value ? {
                                      background: 'rgba(99,102,241,0.12)',
                                      borderColor: 'var(--color-blue)',
                                      color: 'var(--color-ink)',
                                      boxShadow: '0 0 0 1px var(--color-blue)',
                                    } : {
                                      background: 'var(--color-surface)',
                                      borderColor: 'var(--color-line)',
                                      color: 'var(--color-ink-soft)',
                                    }}
                                    aria-pressed={depth === item.value}>
                                    <div className="font-semibold text-xs">{item.label}</div>
                                    <div className="opacity-75 mt-1 text-[11px]">{item.desc}</div>
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Citation Format Selection */}
                            <div>
                              <p className="mono-kicker mb-2.5 text-xs">Citation & Paper Format</p>
                              <div className="flex flex-wrap gap-2">
                                {PAPER_FORMATS.map((item) => (
                                  <button key={item.value} type="button" onClick={() => setPaperFormat(item.value)}
                                    className="rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all"
                                    style={paperFormat === item.value ? {
                                      background: 'rgba(236,72,153,0.12)',
                                      borderColor: 'var(--color-pink)',
                                      color: 'var(--color-pink-dim)',
                                      boxShadow: '0 0 0 1px var(--color-pink)',
                                    } : {
                                      background: 'var(--color-surface)',
                                      borderColor: 'var(--color-line)',
                                      color: 'var(--color-ink-soft)',
                                    }}
                                    aria-pressed={paperFormat === item.value}>
                                    {item.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* PDF Grounding */}
                            <div>
                              <div className="mb-2.5 flex items-center gap-2">
                                <FileText size={14} color="var(--color-blue-dim)" />
                                <p className="mono-kicker text-xs">Ground with Custom PDFs (Optional)</p>
                              </div>
                              <PdfUpload onFilesChange={setUploadedFileIds} />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
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

            {/* ── DONE: Paper + Stats Tabs ── */}
            {view === 'done' && (
              <motion.div key="done" {...viewMotion} className="h-full flex flex-col overflow-hidden">
                {/* Tab bar */}
                <div className="shrink-0 flex items-center gap-1 sm:gap-2 px-4 sm:px-6 pt-3 pb-0 bg-surface/50"
                  style={{ borderBottom: '1px solid var(--color-line)' }}>
                  {([
                    { key: 'paper', label: 'Paper', fullLabel: 'Research Paper', icon: FileText },
                    { key: 'stats', label: 'Analytics', fullLabel: 'Verification Analytics', icon: BarChart2 },
                  ] as const).map(({ key, label, fullLabel, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setRightTab(key)}
                      className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-all"
                      style={rightTab === key ? {
                        borderBottomColor: 'var(--color-blue)',
                        color: 'var(--color-ink)',
                      } : {
                        borderBottomColor: 'transparent',
                        color: 'var(--color-ink-mute)',
                      }}
                    >
                      <Icon size={14} color={rightTab === key ? 'var(--color-blue-dim)' : 'var(--color-ink-mute)'} />
                      <span className="hidden sm:inline">{fullLabel}</span>
                      <span className="sm:hidden">{label}</span>
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-hidden">
                  <AnimatePresence mode="wait">
                    {rightTab === 'paper' && (
                      <motion.div key="paper" {...viewMotion} className="h-full overflow-hidden">
                        <PaperViewer sessionId={currentSessionId} isComplete={effectiveComplete} paper={paper} />
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
