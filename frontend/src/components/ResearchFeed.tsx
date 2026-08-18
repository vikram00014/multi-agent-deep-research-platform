import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { BookOpen, CheckCircle2, FileText, Sparkles, MessageSquare, AlertCircle, ArrowRight } from 'lucide-react';
import type { FeedItem } from '../types';

const PIPELINE_STAGES = [
  { key: 'planner', label: 'Research Planning', desc: 'Formulates search vectors & angle strategy', nodes: ['planner'] },
  { key: 'retrieval', label: 'Academic Retrieval', desc: 'Searches 6 academic databases & journals', nodes: ['retrieval'] },
  { key: 'summarizer', label: 'Paper Summarization', desc: 'Extracts methodology, datasets & limitations', nodes: ['summarizer'] },
  { key: 'synthesis', label: 'Synthesis & Peer Review', desc: 'Proposer & Critic debate literature rigor', nodes: ['proposer', 'critic'] },
  { key: 'cross_paper', label: 'Cross-Paper Analysis', desc: 'Maps cross-citation themes & contradictions', nodes: ['cross_paper'] },
  { key: 'gap_analysis', label: 'Gap Discovery', desc: 'Identifies unaddressed research frontiers', nodes: ['gap_analysis'] },
  { key: 'paper_architect', label: 'Manuscript Assembly', desc: 'Assembles publication-ready manuscripts', nodes: ['paper_architect'] },
  { key: 'complete', label: 'Paper Ready', desc: 'Synthesis verified & ready for export', nodes: ['complete'] },
] as const;

interface ResearchFeedProps {
  items: FeedItem[];
  isConnected: boolean;
  isPollingFallback?: boolean;
  warning?: string | null;
  sessionError?: string | null;
  onRetry?: () => void;
}

function normalizedNode(node?: string) {
  if (node === 'proposer' || node === 'critic') return 'synthesis';
  return node || '';
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, '0')}s` : `${seconds}s`;
}

function eventTypeLabel(type: FeedItem['type']) {
  switch (type) {
    case 'paper_found': return 'Paper Discovered';
    case 'gap':         return 'Research Gap';
    case 'debate':      return 'Peer Review';
    case 'complete':    return 'Paper Complete';
    case 'error':       return 'System Notice';
    default:            return 'Agent Milestone';
  }
}

function compactAuthors(value: unknown) {
  const text = String(value || 'Unknown authors');
  const authors = text.split(',').map((item) => item.trim()).filter(Boolean);
  if (authors.length <= 3) return authors.join(', ') || text;
  return `${authors.slice(0, 3).join(', ')} et al.`;
}

function EventCard({ item, onRetry }: { item: FeedItem; onRetry?: () => void }) {
  const isPaper = item.type === 'paper_found';
  const isGap = item.type === 'gap';
  const isDebate = item.type === 'debate';
  const isError = item.type === 'error';

  if (isDebate) {
    const speaker = String(item.data?.speaker || 'proposer');
    const isCritic = speaker === 'critic';
    return (
      <motion.div 
        layout
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        className="card p-4 shadow-sm hover:shadow-md transition-shadow"
        style={{
          borderLeft: isCritic ? '3.5px solid var(--color-pink)' : '3.5px solid var(--color-blue)',
        }}
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <span className={`badge ${isCritic ? 'badge-pink' : 'badge-blue'}`}>
              <MessageSquare size={11} />
              {isCritic ? 'Reviewer Critique' : 'Literature Draft'}
            </span>
            <span className="text-[11px] font-medium" style={{ color: 'var(--color-ink-mute)' }}>
              Round {String(item.data?.round || 1)}
            </span>
          </div>
          <time className="text-[11px]" style={{ color: 'var(--color-ink-mute)' }}>
            {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </time>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-ink-soft)' }}>
          {String(item.data?.snippet || item.message || 'Synthesis debate progressed.')}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className="card p-4 shadow-sm hover:shadow-md transition-shadow"
      style={{
        borderLeft: isError ? '3.5px solid var(--color-err)' : isGap ? '3.5px solid var(--color-warn)' : isPaper ? '3.5px solid var(--color-blue)' : '1px solid var(--color-line)',
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {item.type === 'complete' && <CheckCircle2 size={14} color="var(--color-ok)" />}
          {isError && <AlertCircle size={14} color="var(--color-err)" />}
          {isPaper && <BookOpen size={14} color="var(--color-blue)" />}
          {isGap && <Sparkles size={14} color="var(--color-warn)" />}
          <span className="mono-kicker text-[10px]">
            {eventTypeLabel(item.type)}
          </span>
        </div>
        <time className="text-[11px]" style={{ color: 'var(--color-ink-mute)' }}>
          {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </time>
      </div>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-ink-soft)' }}>
        {item.message || 'Processing research step...'}
      </p>

      {isPaper && item.data && (
        <div className="mt-3 p-3 rounded-lg border border-line" style={{ background: 'var(--color-raised)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--color-ink)' }}>
            {String(item.data?.title || 'Untitled paper')}
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--color-ink-mute)' }}>
            {compactAuthors(item.data?.authors)} {item.data?.year ? `(${item.data.year})` : ''}
          </p>
          {Boolean(item.data?.source) && (
            <div className="mt-2">
              <span className="badge badge-blue text-[10px]">
                {String(item.data.source).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      )}

      {isGap && Boolean(item.data?.proposed_direction) ? (
        <div className="mt-3 p-3 rounded-lg border" style={{ background: 'rgba(217,119,6,0.05)', borderColor: 'rgba(217,119,6,0.2)' }}>
          <span className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--color-warn)' }}>
            Opportunity for Innovation:
          </span>
          <p className="text-xs" style={{ color: 'var(--color-ink-soft)' }}>
            {String(item.data?.proposed_direction)}
          </p>
        </div>
      ) : null}

      {isError && onRetry && (
        <button type="button" onClick={onRetry} className="control-button control-button-primary mt-3 text-xs">
          Retry Step
        </button>
      )}
    </motion.div>
  );
}

export function ResearchFeed({
  items,
  isConnected,
  isPollingFallback,
  warning,
  sessionError,
  onRetry,
}: ResearchFeedProps) {
  const streamRef = useRef<HTMLDivElement | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const reduceMotion = useReducedMotion();

  const isComplete = useMemo(() => items.some((item) => item.type === 'complete'), [items]);
  const isError = useMemo(() => Boolean(sessionError) || items.some((item) => item.type === 'error'), [items, sessionError]);
  const isTerminal = isComplete || isError;

  const statusByNode = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      const nodeKey = normalizedNode(item.node);
      if (nodeKey && item.message) {
        map.set(nodeKey, item.message);
      }
    }
    return map;
  }, [items]);

  const activeIndex = useMemo(() => {
    if (isComplete) return PIPELINE_STAGES.length - 1;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const nodeKey = normalizedNode(item.node);
      const stageIdx = PIPELINE_STAGES.findIndex((s) => (s.nodes as readonly string[]).includes(nodeKey));
      if (stageIdx !== -1) return stageIdx;
    }
    return 0;
  }, [items, isComplete]);

  useEffect(() => {
    if (!items.length) {
      setElapsedSec(0);
      return;
    }
    const startMs = items[0].timestamp.getTime();
    if (isTerminal) {
      const endMs = items[items.length - 1].timestamp.getTime();
      setElapsedSec(Math.max(0, Math.floor((endMs - startMs) / 1000)));
      return;
    }
    const tick = () => setElapsedSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [items, isTerminal]);

  useEffect(() => {
    const element = streamRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [items.length, reduceMotion]);

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mx-auto max-w-[960px]">

        {/* Header summary */}
        <motion.div 
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b pb-5 sm:pb-6" 
          style={{ borderColor: 'var(--color-line)' }}
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="mono-kicker">Autonomous Deliberation</span>
              {!isComplete && <span className="status-dot status-dot-running" />}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--color-ink)' }}>
              {isComplete ? 'Research Complete' : isError ? 'Needs Attention' : PIPELINE_STAGES[activeIndex]?.label || 'Researching'}
            </h1>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-ink-mute)' }}>
              {items.length} live events · Elapsed time: <strong style={{ color: 'var(--color-ink-soft)' }}>{formatElapsed(elapsedSec)}</strong>
            </p>
          </div>
          <div className="card px-3.5 py-2 text-right shadow-sm shrink-0">
            <p className="mono-kicker text-[10px]">
              {isComplete ? 'Finished' : isConnected ? 'Live' : isPollingFallback ? 'Live (Polling)' : 'Connecting'}
            </p>
            {warning && <p className="mt-1 text-[11px]" style={{ color: 'var(--color-warn)' }}>{warning}</p>}
          </div>
        </motion.div>

        {/* Pipeline Progress Grid */}
        <div className="grid gap-4 lg:gap-6 lg:grid-cols-[290px_1fr] items-start">
          
          {/* Left: Pipeline Stages Card */}
          <div className="card p-4 sm:p-5 shadow-sm h-auto max-h-[260px] lg:h-[calc(100vh-15rem)] lg:max-h-[750px] lg:min-h-[500px] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b shrink-0" style={{ borderColor: 'var(--color-line)' }}>
              <p className="mono-kicker text-[10px]">Pipeline Stages</p>
              <span className="badge badge-blue text-[10px]">{activeIndex + 1} / {PIPELINE_STAGES.length}</span>
            </div>
            <div className="relative space-y-3.5 flex-1 overflow-y-auto pr-1">
              {PIPELINE_STAGES.map((stage, index) => {
                const active = !isTerminal && index === activeIndex;
                const done = isComplete || index < activeIndex;
                const failed = isError && index === activeIndex;

                return (
                  <motion.div 
                    layout
                    key={stage.key} 
                    className="relative flex gap-3 items-start"
                  >
                    <div className="relative z-10 mt-0.5 flex items-center justify-center w-5 h-5 shrink-0">
                      {done ? (
                        <CheckCircle2 size={16} color="var(--color-ok)" />
                      ) : active ? (
                        <motion.div
                          animate={{ scale: [1, 1.25, 1] }}
                          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                          className="w-3.5 h-3.5 rounded-full flex items-center justify-center"
                          style={{ background: 'var(--color-blue)', boxShadow: '0 0 10px rgba(79,70,229,0.5)' }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        </motion.div>
                      ) : (
                        <span
                          className="block h-2 w-2 rounded-full"
                          style={{ background: 'var(--color-line-light)' }}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-xs font-semibold leading-tight transition-colors duration-200"
                        style={{
                          color: active ? 'var(--color-blue)' : done ? 'var(--color-ink)' : 'var(--color-ink-mute)',
                        }}
                      >
                        {stage.label}
                      </p>
                      <p className="text-[10px] mt-0.5 leading-snug" style={{ color: 'var(--color-ink-mute)' }}>
                        {stage.desc}
                      </p>
                      {active && statusByNode.get(stage.key) && (
                        <p className="mt-1.5 text-[11px] leading-normal font-medium p-1.5 rounded-md" style={{ color: 'var(--color-blue)', background: 'rgba(79,70,229,0.06)' }}>
                          {statusByNode.get(stage.key)}
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Right: Live Stream Block Container */}
          <div className="card p-4 sm:p-5 shadow-sm h-[420px] sm:h-[520px] lg:h-[calc(100vh-15rem)] lg:max-h-[750px] lg:min-h-[500px] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b shrink-0" style={{ borderColor: 'var(--color-line)' }}>
              <div className="flex items-center gap-2">
                <span className="mono-kicker text-[10px]">Deliberation Log</span>
                <span className="status-dot status-dot-running" />
              </div>
              <span className="badge badge-pink text-[10px]">{items.length} events logged</span>
            </div>

            {sessionError && (
              <div
                className="mb-3 rounded-xl p-3 text-xs shrink-0"
                style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: 'var(--color-err)' }}
              >
                <p className="font-semibold mb-1">Session stopped with an error:</p>
                <p>{sessionError}</p>
                {onRetry && (
                  <button type="button" onClick={onRetry} className="control-button control-button-primary mt-2 text-xs">
                    Retry Pipeline
                  </button>
                )}
              </div>
            )}

            <div ref={streamRef} className="flex-1 overflow-y-auto pr-1 space-y-3" aria-live="polite">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-xs py-12" style={{ color: 'var(--color-ink-mute)' }}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                    className="w-8 h-8 mx-auto mb-3"
                  >
                    <Sparkles size={24} color="var(--color-blue)" />
                  </motion.div>
                  <p className="font-semibold text-sm mb-1" style={{ color: 'var(--color-ink)' }}>Initiating Autonomous Agents</p>
                  <p className="text-xs max-w-xs mx-auto">Searching academic repositories across ArXiv, Semantic Scholar, OpenAlex, and Crossref…</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout" initial={false}>
                  {items.map((item) => (
                    <motion.div 
                      key={item.id} 
                      layout 
                      className="will-change-transform"
                    >
                      <EventCard item={item} onRetry={onRetry} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
