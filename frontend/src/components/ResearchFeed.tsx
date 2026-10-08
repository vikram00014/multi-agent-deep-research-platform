import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  BookOpen,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Sparkles,
  Loader2
} from 'lucide-react';
import type { FeedItem } from '../types';

const PIPELINE_STAGES = [
  { key: 'planner', label: 'Research Planning', desc: 'Formulates questions, search terms & retrieval parameters', nodes: ['planner'] },
  { key: 'retrieval', label: 'Academic Retrieval', desc: 'Queries 6 academic repositories & citation indexes', nodes: ['retrieval'] },
  { key: 'summarizer', label: 'Paper Summarization', desc: 'Extracts methodology, datasets & findings', nodes: ['summarizer'] },
  { key: 'synthesis', label: 'Synthesis & Peer Review', desc: 'Proposer & Critic debate empirical literature rigor', nodes: ['proposer', 'critic'] },
  { key: 'cross_paper', label: 'Cross-Paper Analysis', desc: 'Maps cross-citation themes & contradictions', nodes: ['cross_paper'] },
  { key: 'gap_analysis', label: 'Gap Discovery', desc: 'Identifies evidence-backed research frontiers', nodes: ['gap_analysis'] },
  { key: 'paper_architect', label: 'Manuscript Assembly', desc: 'Structures research into IEEE/APA manuscript sections', nodes: ['paper_architect'] },
  { key: 'complete', label: 'Paper Ready', desc: 'Synthesis complete and validated for export', nodes: ['complete'] },
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
      <div
        className="card p-3.5 text-xs"
        style={{
          borderLeft: isCritic ? '3px solid #dc2626' : '3px solid #2563eb',
        }}
      >
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <div className="flex items-center gap-2">
            <span className={`badge ${isCritic ? 'badge-err' : 'badge-blue'}`}>
              <MessageSquare size={10} />
              {isCritic ? 'Peer Review Critique' : 'Literature Draft'}
            </span>
            <span className="text-[11px] font-mono text-ink-mute">
              Round {String(item.data?.round || 1)}
            </span>
          </div>
          <time className="text-[10px] font-mono text-ink-mute">
            {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </time>
        </div>
        <p className="text-xs leading-relaxed text-ink-soft">
          {String(item.data?.snippet || item.message || 'Synthesis debate progressed.')}
        </p>
      </div>
    );
  }

  return (
    <div
      className="card p-3.5 text-xs"
      style={{
        borderLeft: isError
          ? '3px solid #dc2626'
          : isGap
          ? '3px solid #d97706'
          : isPaper
          ? '3px solid #2563eb'
          : '1px solid var(--color-line)',
      }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {item.type === 'complete' && <CheckCircle2 size={13} className="text-ok" />}
          {isError && <AlertCircle size={13} className="text-err" />}
          {isPaper && <BookOpen size={13} className="text-accent" />}
          {isGap && <Sparkles size={13} className="text-warn" />}
          <span className="mono-kicker text-[10px]">
            {eventTypeLabel(item.type)}
          </span>
        </div>
        <time className="text-[10px] font-mono text-ink-mute">
          {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </time>
      </div>

      <p className="text-xs leading-relaxed text-ink-soft">
        {item.message || 'Processing research step...'}
      </p>

      {isPaper && item.data && (
        <div className="mt-2.5 p-2.5 rounded border border-line bg-surface-subtle">
          <p className="text-xs font-semibold text-ink leading-snug">
            {String(item.data?.title || 'Untitled paper')}
          </p>
          <p className="text-[11px] text-ink-mute mt-0.5">
            {compactAuthors(item.data?.authors)} {item.data?.year ? `(${item.data.year})` : ''}
          </p>
          {Boolean(item.data?.source) && (
            <div className="mt-1.5">
              <span className="badge badge-blue text-[10px]">
                {String(item.data.source).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      )}

      {isGap && Boolean(item.data?.proposed_direction) && (
        <div className="mt-2.5 p-2.5 rounded border border-amber-200 bg-warn-subtle">
          <span className="text-[11px] font-semibold block mb-0.5 text-warn">
            Research Frontier / Opportunity:
          </span>
          <p className="text-xs text-ink-soft leading-relaxed">
            {String(item.data?.proposed_direction)}
          </p>
        </div>
      )}

      {isError && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="control-button control-button-primary mt-2 text-xs"
        >
          Retry Pipeline Step
        </button>
      )}
    </div>
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
      <div className="mx-auto max-w-[1000px]">
        {/* Header deliberation summary */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="mono-kicker text-xs">Autonomous Deliberation</span>
              {!isComplete && !isError && <span className="status-dot status-dot-running" />}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-ink">
              {isComplete ? 'Research Generation Complete' : isError ? 'Pipeline Stopped' : PIPELINE_STAGES[activeIndex]?.label || 'Researching'}
            </h1>
            <p className="mt-1 text-sm text-ink-mute">
              {items.length} events logged · Elapsed:{' '}
              <span className="font-mono text-ink-soft font-semibold">{formatElapsed(elapsedSec)}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="badge">
              {isComplete ? 'Finished' : (isConnected || isPollingFallback) ? 'Live' : 'Connecting'}
            </span>
          </div>
        </div>

        {/* Two-column layout: Stage roadmap + Telemetry feed */}
        <div className="grid gap-4 lg:gap-6 lg:grid-cols-[300px_1fr] items-start">
          {/* Left: Pipeline Stages */}
          <div className="card p-4 h-auto max-h-[300px] lg:h-[calc(100vh-14rem)] lg:max-h-[720px] lg:min-h-[480px] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-line shrink-0">
              <span className="mono-kicker text-[10px]">Pipeline Stages</span>
              <span className="font-mono text-xs font-medium text-ink-soft">
                {activeIndex + 1} / {PIPELINE_STAGES.length}
              </span>
            </div>

            <div className="relative space-y-3 flex-1 overflow-y-auto pr-1">
              {PIPELINE_STAGES.map((stage, index) => {
                const active = !isTerminal && index === activeIndex;
                const done = isComplete || index < activeIndex;

                return (
                  <div key={stage.key} className="flex gap-2.5 items-start">
                    <div className="mt-0.5 flex items-center justify-center w-4 h-4 shrink-0">
                      {done ? (
                        <CheckCircle2 size={14} className="text-ok" />
                      ) : active ? (
                        <Loader2 size={13} className="text-accent animate-spin" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs leading-tight font-semibold ${
                        active ? 'text-accent' : done ? 'text-ink' : 'text-ink-mute'
                      }`}>
                        {stage.label}
                      </p>
                      <p className="text-[11px] text-ink-mute leading-snug mt-0.5">
                        {stage.desc}
                      </p>
                      {active && statusByNode.get(stage.key) && (
                        <p className="mt-1 text-[11px] p-1.5 rounded bg-surface-subtle text-ink font-medium leading-normal border border-line">
                          {statusByNode.get(stage.key)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Deliberation Log Stream */}
          <div className="card p-4 h-[440px] sm:h-[540px] lg:h-[calc(100vh-14rem)] lg:max-h-[720px] lg:min-h-[480px] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-line shrink-0">
              <div className="flex items-center gap-2">
                <span className="mono-kicker text-[10px]">Agent Deliberation Feed</span>
              </div>
              <span className="font-mono text-[11px] text-ink-mute">
                {items.length} events
              </span>
            </div>

            {sessionError && (
              <div className="mb-3 rounded p-3 text-xs bg-err-subtle text-err border border-red-200 shrink-0">
                <p className="font-semibold mb-1">Session stopped with an error:</p>
                <p>{sessionError}</p>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="control-button control-button-primary mt-2 text-xs"
                  >
                    Retry Pipeline
                  </button>
                )}
              </div>
            )}

            <div ref={streamRef} className="flex-1 overflow-y-auto pr-1 space-y-2.5" aria-live="polite">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-xs py-12 text-ink-mute">
                  <Loader2 size={20} className="animate-spin text-ink-soft mb-2" />
                  <p className="font-semibold text-ink text-sm">Initiating Autonomous Pipeline</p>
                  <p className="text-xs max-w-xs mt-1">Connecting to academic indexes and constructing retrieval queries…</p>
                </div>
              ) : (
                items.map((item) => (
                  <EventCard key={item.id} item={item} onRetry={onRetry} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
