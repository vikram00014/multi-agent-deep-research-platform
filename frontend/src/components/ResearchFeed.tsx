import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion, type Transition } from 'framer-motion';
import type { FeedItem } from '../types';

const PIPELINE_STAGES = [
  { key: 'planner', label: 'Planner', nodes: ['planner'] },
  { key: 'retrieval', label: 'Retrieval', nodes: ['retrieval'] },
  { key: 'summarizer', label: 'Summarizer', nodes: ['summarizer'] },
  { key: 'synthesis', label: 'Proposer / critic', nodes: ['proposer', 'critic'] },
  { key: 'cross_paper', label: 'Cross-paper', nodes: ['cross_paper'] },
  { key: 'gap_analysis', label: 'Gap analysis', nodes: ['gap_analysis'] },
  { key: 'paper_architect', label: 'Paper architect', nodes: ['paper_architect'] },
  { key: 'complete', label: 'Complete', nodes: ['complete'] },
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

function eventKickerClass(type: FeedItem['type']) {
  if (type === 'paper_found') return 'text-accent';
  if (type === 'gap') return 'text-warn';
  if (type === 'debate') return 'text-ok';
  if (type === 'error') return 'text-err';
  if (type === 'complete') return 'text-ok';
  return 'text-ink-mute';
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
    const speaker = String(item.data?.speaker || 'debate');
    return (
      <div className="rounded-card border border-line bg-surface px-4 py-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div>
            <p className="mono-kicker text-ok">{speaker === 'critic' ? 'critic' : 'proposer'}</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{String(item.data?.snippet || item.message || 'Debate update')}</p>
          </div>
          <div className="hidden w-px bg-line md:block" />
          <div>
            <p className="mono-kicker">{`round ${String(item.data?.round || 1)}`}</p>
            <p className="mt-2 text-sm leading-6 text-ink-mute">{item.message || 'Synthesis debate progressed.'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-card border bg-surface px-4 py-3 ${isError ? 'border-err' : 'border-line'} ${isGap ? 'border-l-2 border-l-warn' : ''}`}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className={`mono-kicker ${eventKickerClass(item.type)}`}>{item.type.replaceAll('_', ' ')}</p>
        <time className="font-mono text-[12px] text-ink-mute">
          {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </time>
      </div>
      <p className="text-sm leading-6 text-ink-soft">{item.message || 'Working...'}</p>
      {isPaper ? (
        <div className="mt-3 space-y-1">
          <p className="truncate text-sm font-medium text-ink">{String(item.data?.title || 'Untitled paper')}</p>
          <p className="truncate text-xs text-ink-mute">
            {compactAuthors(item.data?.authors)} / {String(item.data?.year || 'n.d.')}
          </p>
          <span className="inline-flex rounded-card border border-line px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute">
            {String(item.data?.source || 'source')}
          </span>
        </div>
      ) : null}
      {isGap && item.data?.proposed_direction ? (
        <p className="mt-3 border-l-2 border-warn pl-3 text-sm leading-6 text-ink-soft">
          {String(item.data.proposed_direction)}
        </p>
      ) : null}
      {isError && onRetry ? (
        <button type="button" onClick={onRetry} className="control-button mt-3">
          Retry
        </button>
      ) : null}
    </div>
  );
}

const feedEnterTransition: Transition = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1],
};

export function ResearchFeed({
  items,
  isConnected,
  isPollingFallback = false,
  warning = null,
  sessionError = null,
  onRetry,
}: ResearchFeedProps) {
  const reduceMotion = useReducedMotion();
  const streamRef = useRef<HTMLDivElement | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const isComplete = items.some((item) => item.type === 'complete');
  const isError = items.some((item) => item.type === 'error') || Boolean(sessionError);
  const isTerminal = isComplete || isError;

  const latestNode = useMemo(() => normalizedNode([...items].reverse().find((item) => item.node)?.node), [items]);
  const activeIndex = Math.max(0, PIPELINE_STAGES.findIndex((stage) => stage.key === latestNode));
  const statusByNode = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((item) => {
      if (item.type === 'status' && item.node) map.set(normalizedNode(item.node), item.message);
    });
    return map;
  }, [items]);
  const debateRounds = useMemo(() => {
    const rounds = new Set<number>();
    items.forEach((item) => {
      if (item.type === 'debate') {
        const round = Number(item.data?.round || 0);
        if (round > 0) rounds.add(round);
      }
    });
    return [...rounds].sort((a, b) => a - b);
  }, [items]);

  useEffect(() => {
    if (items.length === 0) {
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

  const itemMotion = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: feedEnterTransition };

  return (
    <div className="h-full overflow-y-auto px-4 py-8">
      <div className="mx-auto max-w-[860px]">
        <div className="mb-8 flex items-start justify-between gap-4 border-b border-line pb-6">
          <div>
            <p className="mono-kicker mb-2">Live research</p>
            <h1 className="text-2xl font-semibold text-ink">
              {isComplete ? 'Paper ready' : isError ? 'Research needs attention' : PIPELINE_STAGES[activeIndex]?.label || 'Working'}
            </h1>
            <p className="mt-2 text-sm text-ink-mute">
              {items.length} events / {formatElapsed(elapsedSec)}
            </p>
          </div>
          <div className="rounded-card border border-line px-3 py-2 text-right">
            <p className="mono-kicker">{isComplete ? 'done' : isConnected ? 'live' : isPollingFallback ? 'polling' : 'connecting'}</p>
            <p className="mt-1 text-xs text-ink-mute">{warning || (isConnected ? 'WebSocket active' : 'Waiting for updates')}</p>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
          <div aria-label="Research pipeline progress">
            <div className="relative space-y-1">
              <div className="absolute left-[7px] top-2 h-[calc(100%-1rem)] border-l border-line" />
              {PIPELINE_STAGES.map((stage, index) => {
                const active = !isTerminal && index === activeIndex;
                const done = isComplete || index < activeIndex;
                const failed = isError && index === activeIndex;
                const dot = failed ? 'bg-err' : done ? 'bg-ok' : active ? 'bg-accent' : 'bg-line';
                return (
                  <div key={stage.key} className="relative flex gap-3 py-2">
                    <div className="relative z-10 mt-1">
                      <span className={`block h-2 w-2 rounded-full transition-colors duration-[240ms] ${dot}`} />
                      {active ? <span className="absolute -left-2 -top-2 h-6 w-6 rounded-full border border-accent/60 motion-safe:animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${active ? 'text-ink' : done ? 'text-ink-soft' : 'text-ink-mute'}`}>{stage.label}</p>
                      {active && statusByNode.get(stage.key) ? (
                        <p className="mt-1 text-xs leading-5 text-ink-mute">{statusByNode.get(stage.key)}</p>
                      ) : null}
                      {stage.key === 'synthesis' && debateRounds.length > 0 ? (
                        <div className="mt-2 space-y-1 border-l border-line pl-3">
                          {debateRounds.map((round) => (
                            <p key={round} className="font-mono text-[12px] uppercase tracking-[0.12em] text-ink-mute">
                              round {round}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            {sessionError ? (
              <div className="mb-4 rounded-card border border-err bg-err/10 px-4 py-3 text-sm text-err">
                <p>{sessionError}</p>
                {onRetry ? (
                  <button type="button" onClick={onRetry} className="control-button mt-3">
                    Retry
                  </button>
                ) : null}
              </div>
            ) : null}

            <div ref={streamRef} className="max-h-[calc(100vh-13rem)] overflow-y-auto pr-1" aria-live="polite">
              {items.length === 0 ? (
                <div className="rounded-card border border-line bg-surface px-4 py-8 text-center text-sm text-ink-mute">
                  Waiting for the first agent update.
                </div>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence initial={false}>
                    {items.map((item) => (
                      <motion.div key={item.id} {...itemMotion}>
                        <EventCard item={item} onRetry={onRetry} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
