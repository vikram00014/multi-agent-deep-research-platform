import { useEffect, useState } from 'react';
import { ArrowRight, ChevronDown, FileText, Plus, RotateCcw, Square } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sidebar } from './components/Sidebar';
import { ResearchFeed } from './components/ResearchFeed';
import { PaperViewer } from './components/PaperViewer';
import { PdfUpload } from './components/PdfUpload';
import { useWebSocket } from './hooks/useWebSocket';
import { api } from './api';
import type { SessionDetail } from './types';

type View = 'idle' | 'running' | 'done';
type Depth = 'quick' | 'standard' | 'deep';

const PAPER_FORMATS = [
  { value: 'ieee', label: 'IEEE' },
  { value: 'academic', label: 'Academic' },
  { value: 'apa', label: 'APA' },
  { value: 'acm', label: 'ACM' },
  { value: 'mla', label: 'MLA' },
] as const;

const DEPTHS: Array<{ value: Depth; label: string }> = [
  { value: 'quick', label: 'Quick' },
  { value: 'standard', label: 'Standard' },
  { value: 'deep', label: 'Deep' },
];

const EXAMPLE_TOPICS = [
  'Vision transformers for medical image segmentation',
  'Federated learning privacy attacks',
  'Retrieval-augmented generation for code',
];

export default function App() {
  const reduceMotion = useReducedMotion();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([]);
  const [polledComplete, setPolledComplete] = useState(false);
  const [paperFormat, setPaperFormat] = useState('ieee');
  const [depth, setDepth] = useState<Depth>('deep');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { isConnected, isPollingFallback, feedItems, isComplete, error, warning, sendStop } = useWebSocket(currentSessionId);
  const effectiveComplete = isComplete || polledComplete || sessionDetail?.status === 'complete';
  const view: View = !currentSessionId ? 'idle' : effectiveComplete ? 'done' : 'running';
  const isError = Boolean(error) || sessionDetail?.status === 'error';
  const isCancelled = sessionDetail?.status === 'cancelled';
  const activeTopic = sessionDetail?.topic || topic || 'Research session';

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const handleStart = async () => {
    const cleanedTopic = topic.trim();
    if (!cleanedTopic) return;
    setIsStarting(true);
    setActionError(null);
    setPolledComplete(false);
    try {
      const result = await api.startResearchAdvanced({
        topic: cleanedTopic,
        uploaded_paper_ids: uploadedFileIds,
        strict_mode: true,
        max_debate_rounds: 2,
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
  };

  const handleSelectSession = (sessionId: string | null) => {
    if (!sessionId) return;
    setCurrentSessionId(sessionId);
    setPolledComplete(false);
    setActionError(null);
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
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Retry failed');
    }
  };

  const handleCancel = async () => {
    if (!currentSessionId) return;
    setActionError(null);
    sendStop();
    try {
      await api.cancelSession(currentSessionId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Cancel failed');
    }
  };

  useEffect(() => {
    setPolledComplete(false);
  }, [currentSessionId]);

  useEffect(() => {
    if (!currentSessionId) return;

    const poll = () => {
      Promise.all([api.getSessionStatus(currentSessionId), api.getSessionDetail(currentSessionId)])
        .then(([status, detail]) => {
          if (status?.status === 'complete') setPolledComplete(true);
          setSessionDetail(detail);
        })
        .catch((err) => {
          setActionError(err instanceof Error ? err.message : 'Polling failed');
        });
    };

    poll();
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      poll();
    }, effectiveComplete ? 60000 : (isConnected ? 30000 : 6000));

    return () => clearInterval(interval);
  }, [currentSessionId, effectiveComplete, isConnected]);

  const status = effectiveComplete
    ? { label: 'Complete', dot: 'bg-ok', text: 'text-ok', border: 'border-ok/40' }
    : isError
      ? { label: 'Error', dot: 'bg-err', text: 'text-err', border: 'border-err/40' }
      : isCancelled
        ? { label: 'Cancelled', dot: 'bg-warn', text: 'text-warn', border: 'border-warn/40' }
        : currentSessionId
          ? { label: 'Researching', dot: 'bg-accent', text: 'text-accent', border: 'border-accent/40' }
          : { label: 'Ready', dot: 'bg-ink-mute', text: 'text-ink-mute', border: 'border-line' };

  const viewMotion = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 } };

  return (
    <div className="flex h-screen bg-canvas text-ink">
      <aside className="hidden w-[260px] shrink-0 md:block">
        <Sidebar
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-line bg-canvas">
          <div className="mx-auto flex h-16 w-full max-w-[860px] items-center justify-between gap-4 px-4 md:px-0">
            <div className="min-w-0">
              <p className="mono-kicker">{view === 'idle' ? 'New research' : view === 'running' ? 'In progress' : 'Paper'}</p>
              <p className="truncate text-sm font-medium text-ink">{view === 'idle' ? 'Ask Delve to map the literature' : activeTopic}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`inline-flex items-center gap-2 rounded-card border ${status.border} px-2.5 py-1.5 text-xs ${status.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
              {view === 'running' && !isError && !isCancelled ? (
                <button type="button" onClick={handleCancel} className="control-button" aria-label="Stop research">
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </button>
              ) : null}
              {(isError || isCancelled) && currentSessionId ? (
                <button type="button" onClick={handleRetry} className="control-button control-button-primary">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Retry
                </button>
              ) : null}
              <button type="button" onClick={handleNewSession} className="control-button" aria-label="New research">
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New</span>
              </button>
            </div>
          </div>
          {isPollingFallback || warning ? (
            <div className="border-t border-warn/30 bg-warn/15 px-4 py-2 text-center text-xs text-warn">
              {warning || 'Live updates unavailable, polling fallback is active.'}
            </div>
          ) : null}
        </header>

        <section className="min-h-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {view === 'idle' ? (
              <motion.div key="idle" {...viewMotion} className="h-full overflow-y-auto">
                <div className="mx-auto flex min-h-full max-w-[860px] flex-col justify-center px-4 py-10">
                  <div className="mb-8">
                    <p className="mono-kicker mb-3">Delve</p>
                    <h1 className="max-w-[760px] text-3xl font-semibold leading-tight text-ink md:text-5xl">
                      Deep research without the surface noise.
                    </h1>
                  </div>

                  <div className="border-y border-line py-6">
                    <label htmlFor="topic" className="mono-kicker mb-3 block">Research query</label>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        id="topic"
                        type="text"
                        value={topic}
                        autoFocus
                        onChange={(event) => setTopic(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && handleStart()}
                        placeholder="e.g. Vision transformers for medical imaging"
                        className="min-h-12 flex-1 rounded-card border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-ink-mute focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={handleStart}
                        disabled={isStarting || !topic.trim()}
                        className="control-button control-button-primary min-h-12 px-5 font-medium disabled:opacity-50"
                      >
                        {isStarting ? 'Starting' : 'Start research'}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                    {actionError ? (
                      <div className="mt-4 rounded-card border border-err/50 bg-err/10 px-4 py-3 text-sm text-err">
                        {actionError}
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {EXAMPLE_TOPICS.map((example) => (
                        <button
                          key={example}
                          type="button"
                          onClick={() => setTopic(example)}
                          className="rounded-card border border-line px-3 py-1.5 text-xs text-ink-soft hover:border-accent-dim hover:text-ink"
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="py-6">
                    <button
                      type="button"
                      onClick={() => setOptionsOpen((open) => !open)}
                      className="flex w-full items-center justify-between border-b border-line pb-3 text-left"
                      aria-expanded={optionsOpen}
                    >
                      <span>
                        <span className="mono-kicker block">Options</span>
                        <span className="mt-1 block text-sm text-ink-soft">{depth} depth, {paperFormat.toUpperCase()} format</span>
                      </span>
                      <ChevronDown className={`h-4 w-4 text-ink-mute transition-transform ${optionsOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {optionsOpen ? (
                      <div className="space-y-6 pt-5">
                        <div>
                          <p className="mono-kicker mb-3">Depth</p>
                          <div className="flex flex-wrap gap-2">
                            {DEPTHS.map((item) => (
                              <button
                                key={item.value}
                                type="button"
                                onClick={() => setDepth(item.value)}
                                className={`rounded-card border px-3 py-2 text-xs ${
                                  depth === item.value
                                    ? 'border-accent bg-accent/15 text-accent'
                                    : 'border-line bg-surface text-ink-soft hover:border-accent-dim'
                                }`}
                                aria-pressed={depth === item.value}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mono-kicker mb-3">Paper format</p>
                          <div className="flex flex-wrap gap-2">
                            {PAPER_FORMATS.map((item) => (
                              <button
                                key={item.value}
                                type="button"
                                onClick={() => setPaperFormat(item.value)}
                                className={`rounded-card border px-3 py-2 text-xs ${
                                  paperFormat === item.value
                                    ? 'border-accent bg-accent/15 text-accent'
                                    : 'border-line bg-surface text-ink-soft hover:border-accent-dim'
                                }`}
                                aria-pressed={paperFormat === item.value}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="mb-3 flex items-center gap-2">
                            <FileText className="h-4 w-4 text-ink-mute" />
                            <p className="mono-kicker">Ground with PDFs</p>
                          </div>
                          <PdfUpload onFilesChange={setUploadedFileIds} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            ) : view === 'running' ? (
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
            ) : (
              <motion.div key="done" {...viewMotion} className="h-full overflow-hidden">
                <PaperViewer sessionId={currentSessionId} isComplete={effectiveComplete} />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}
