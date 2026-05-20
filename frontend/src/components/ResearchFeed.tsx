import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  File,
  FileText,
  MessageSquare,
  Plug,
  Search,
  Sparkles,
} from 'lucide-react';
import type { FeedItem } from '../types';

const PIPELINE_NODES = [
  { key: 'planner', label: 'Planning', avgSec: 20 },
  { key: 'retrieval', label: 'Retrieval', avgSec: 30 },
  { key: 'summarizer', label: 'Summarizing', avgSec: 60 },
  { key: 'proposer', label: 'Drafting', avgSec: 30 },
  { key: 'critic', label: 'Peer Review', avgSec: 25 },
  { key: 'cross_paper', label: 'Cross-Analysis', avgSec: 25 },
  { key: 'gap_analysis', label: 'Gap Analysis', avgSec: 30 },
  { key: 'paper_architect', label: 'Paper Architect', avgSec: 45 },
  { key: 'complete', label: 'Complete', avgSec: 0 },
] as const;

const ICON_MAP: Record<FeedItem['icon'], { icon: typeof Search; color: string; bg: string; border: string }> = {
  search: { icon: Search, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-100' },
  paper: { icon: FileText, color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-100' },
  brain: { icon: Brain, color: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-100' },
  debate: { icon: MessageSquare, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-100' },
  gap: { icon: AlertTriangle, color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-100' },
  file: { icon: File, color: 'text-orion-accent', bg: 'bg-orion-accent/10', border: 'border-orion-accent/20' },
  check: { icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-100 dark:border-emerald-800/40' },
  error: { icon: AlertCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30', border: 'border-red-100 dark:border-red-800/40' },
  connect: { icon: Plug, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-100 dark:border-emerald-800/40' },
};

function ProgressRing({ progress, size = 180, stroke = 8 }: { progress: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (progress / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        className="transition-all duration-1000 ease-out"
        style={{ stroke: 'url(#progressGrad)' }}
      />
      <defs>
        <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="55%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function EventCard({ item, compact = false }: { item: FeedItem; compact?: boolean }) {
  const { icon: IconComp, color, bg, border } = ICON_MAP[item.icon] || ICON_MAP.search;
  return (
    <div
      className={`rounded-2xl border transition-all duration-300 group ${
        item.type === 'error'
          ? 'border-red-100 bg-red-50/30'
          : item.type === 'complete'
            ? 'border-emerald-100 bg-emerald-50/30'
            : 'border-orion-border/50 bg-orion-surface shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-md'
      } ${compact ? 'p-3' : 'p-5'}`}
    >
      <div className="flex items-start gap-4">
        <div className={`shrink-0 rounded-xl border-2 p-2 shadow-sm transition-transform group-hover:scale-110 ${bg} ${border}`}>
          <IconComp className={`h-4 w-4 ${color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-1">
             <p
              className={`font-bold tracking-tight ${
                compact ? 'text-xs' : 'text-sm'
              } ${
                item.type === 'error'
                  ? 'text-red-700'
                  : item.type === 'complete'
                    ? 'text-emerald-700'
                    : 'text-orion-text'
              }`}
            >
              {item.message || 'Research event'}
            </p>
             <span className="text-[10px] font-bold text-orion-text-dim tabular-nums">
              {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          {item.type === 'paper_found' && item.data && !compact ? (
            <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/50 p-4 shadow-inner">
              <p className="text-sm font-bold text-orion-text leading-tight mb-1">{String(item.data.title || '')}</p>
              <p className="text-xs font-medium text-orion-text-muted">
                {String(item.data.authors || 'Unknown')} · {String(item.data.year || 'n.d.')} · <span className="text-violet-600 font-bold">{String(item.data.source || 'source').toUpperCase()}</span>
              </p>
            </div>
          ) : null}

          {!compact && item.type === 'gap' && item.data ? (
            <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50/50 p-4 shadow-inner">
              <p className="text-sm font-bold text-rose-900 leading-tight mb-1">{String(item.data.title || 'Research gap')}</p>
              {item.data.proposed_direction ? (
                <p className="mt-1 text-xs leading-relaxed text-rose-700 italic">{String(item.data.proposed_direction)}</p>
              ) : null}
            </div>
          ) : null}

          {item.node && !compact ? (
            <div className="mt-3 flex items-center gap-2">
               <span className="rounded-lg border border-orion-accent/20 bg-orion-accent/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orion-accent">
                {PIPELINE_NODES.find((n) => n.key === item.node)?.label || item.node}
              </span>
              <div className="h-px flex-1 bg-orion-border"></div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface ResearchFeedProps {
  items: FeedItem[];
  isConnected: boolean;
  isPollingFallback?: boolean;
  warning?: string | null;
}

export function ResearchFeed({ items, isConnected, isPollingFallback = false, warning = null }: ResearchFeedProps) {
  const [displayedIdx, setDisplayedIdx] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const pipelineScrollRef = useRef<HTMLDivElement | null>(null);
  const pipelineStageRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (items.length === 0) {
      setElapsedSec(0);
      return;
    }

    const startMs = items[0]?.timestamp instanceof Date ? items[0].timestamp.getTime() : Date.now();
    const endMs = items[items.length - 1]?.timestamp instanceof Date ? items[items.length - 1].timestamp.getTime() : startMs;
    const hasTerminalEvent = items.some((i) => i.type === 'complete' || i.type === 'error');

    if (hasTerminalEvent) {
      setElapsedSec(Math.max(0, Math.floor((endMs - startMs) / 1000)));
    } else {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    }
  }, [items]);

  useEffect(() => {
    const isRunning = items.length > 0 && !items.some((i) => i.type === 'complete' || i.type === 'error');
    if (!isRunning) return;
    const interval = setInterval(() => {
      const startMs = items[0]?.timestamp instanceof Date ? items[0].timestamp.getTime() : Date.now();
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [items]);

  useEffect(() => {
    if (items.length > 0) setDisplayedIdx(items.length - 1);
  }, [items.length]);

  const latestNode = useMemo(() => [...items].reverse().find((i) => i.node)?.node || '', [items]);
  const activeNodeIdx = PIPELINE_NODES.findIndex((n) => n.key === latestNode);
  const resolvedIdx = activeNodeIdx >= 0 ? activeNodeIdx : 0;
  const isComplete = items.some((i) => i.type === 'complete');
  const isError = items.some((i) => i.type === 'error');
  const isDone = isComplete || isError;
  const progressPercent = isDone ? 100 : Math.max(5, Math.round(((resolvedIdx + 0.5) / PIPELINE_NODES.length) * 100));
  const completedNodes = isDone ? PIPELINE_NODES.length : resolvedIdx;
  const currentItem = items[displayedIdx];
  const hasStructuredDetail = Boolean(
    currentItem && (
      (currentItem.type === 'paper_found' && currentItem.data) ||
      (currentItem.type === 'gap' && currentItem.data)
    )
  );
  const showDetailPane = Boolean(currentItem && hasStructuredDetail);
  const activeStageScrollIdx = isDone ? PIPELINE_NODES.length - 1 : resolvedIdx;

  useEffect(() => {
    const container = pipelineScrollRef.current;
    const target = pipelineStageRefs.current[activeStageScrollIdx];

    if (!container || !target) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const centeredTop =
      container.scrollTop +
      (targetRect.top - containerRect.top) -
      container.clientHeight / 2 +
      targetRect.height / 2;

    container.scrollTo({
      top: Math.max(0, centeredTop),
      behavior: items.length > 1 ? 'smooth' : 'auto',
    });
  }, [activeStageScrollIdx, items.length]);

  const elapsedText = useMemo(() => {
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
  }, [elapsedSec]);

  const statusTitle = isComplete ? 'Analysis Ready' : isError ? 'System Error' : 'Active Pipeline';
  const statusSubtitle = isComplete
    ? 'All stages finished and the paper package is ready to inspect.'
    : isError
      ? 'The pipeline stopped before completion.'
      : `Currently moving through ${PIPELINE_NODES[resolvedIdx]?.label || 'the workflow'}.`;

  const stats = [
    { label: 'Sources', count: items.filter((i) => i.type === 'paper_found').length, color: 'text-violet-700', bg: 'bg-violet-50' },
    { label: 'Debates', count: items.filter((i) => i.type === 'debate').length, color: 'text-amber-700', bg: 'bg-amber-50' },
    { label: 'Gaps', count: items.filter((i) => i.type === 'gap').length, color: 'text-rose-700', bg: 'bg-rose-50' },
    { label: 'Events', count: items.length, color: 'text-blue-700', bg: 'bg-blue-50' },
  ];

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-orion-surface-2/30 p-6">
        <div className="w-full max-w-xl rounded-2xl border border-orion-border bg-orion-surface p-8 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-orion-accent/20 bg-orion-accent/10">
            <Sparkles className="h-9 w-9 text-orion-accent" />
          </div>
          <p className="text-xl font-bold text-orion-text">Ready to Research</p>
          <p className="mt-2 text-base text-orion-text-muted">Enter a topic to begin deep multi-agent analysis.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden p-4">
      <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(320px,380px)_1fr]">
        <section className="flex min-h-0 flex-col overflow-hidden card-premium p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-orion-accent">System Monitoring</p>
              <h2 className="text-xl font-bold text-orion-text">{statusTitle}</h2>
            </div>
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-all ${
                isConnected || isComplete
                ? 'border-emerald-100 bg-emerald-50/50 text-emerald-700'
                : isPollingFallback
                  ? 'border-amber-100 bg-amber-50/50 text-amber-700'
                  : 'border-rose-100 bg-rose-50/50 text-rose-700 animate-pulse'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${
                isConnected || isComplete
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  : isPollingFallback
                    ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.45)]'
                    : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
              }`} />
              {isComplete ? 'Complete' : isConnected ? 'Live' : isPollingFallback ? 'Polling' : 'Reconnecting'}
            </span>
          </div>

          <div className="relative mb-4 overflow-hidden rounded-[22px] border border-orion-border/50 bg-[linear-gradient(135deg,rgba(99,102,241,0.12),rgba(255,255,255,0.72),rgba(6,182,212,0.10))] p-3.5 shadow-[0_10px_22px_rgba(99,102,241,0.08)]">
            <div className="absolute inset-y-0 right-0 w-40 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.18),transparent_68%)] pointer-events-none" />
            <div className="relative flex items-center gap-3.5">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="rounded-full border border-orion-accent/20 bg-orion-surface/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-orion-accent">
                    {PIPELINE_NODES[resolvedIdx]?.label || 'Processing'}
                  </span>
                  <span className="rounded-full border border-orion-border/60 bg-orion-surface/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-orion-text-dim">
                    {completedNodes}/{PIPELINE_NODES.length} stages
                  </span>
                </div>
                <p className="text-[15px] font-black tracking-tight text-orion-text">{statusTitle}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-orion-text-muted">{statusSubtitle}</p>
                <div className="mt-2.5">
                  <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-orion-text-dim">
                    <span>Pipeline Progress</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/70 ring-1 ring-orion-border/60">
                    <div
                      className={`h-full rounded-full bg-[linear-gradient(90deg,#2563eb_0%,#6366f1_50%,#14b8a6_100%)] shadow-[0_0_18px_rgba(99,102,241,0.35)] transition-all duration-700 ${
                        isDone ? '' : 'animate-pulse-slow'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="relative shrink-0">
                <div className={`absolute inset-0 rounded-full blur-2xl ${isDone ? 'bg-emerald-400/20' : 'bg-indigo-400/20 animate-pulse-slow'}`} />
                <div className="relative rounded-full border border-white/70 bg-white/70 p-2.5 shadow-lg">
                  <ProgressRing progress={progressPercent} size={94} stroke={7} />
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-orion-text tracking-tighter">{progressPercent}%</span>
                  <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-orion-text-dim">
                    {isDone ? 'Locked' : 'Live'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            ref={pipelineScrollRef}
            className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-orion-border/50 bg-orion-surface-2/30 p-4"
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-orion-text-dim">Pipeline Flow</p>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orion-accent bg-orion-accent/10 px-2 py-0.5 rounded-md">
                <Clock className="h-3 w-3" />
                {elapsedText}
              </span>
            </div>
            <div className="relative space-y-2.5 before:absolute before:left-[15px] before:top-3 before:bottom-3 before:w-px before:bg-[linear-gradient(180deg,rgba(99,102,241,0.25),rgba(148,163,184,0.18))]">
              {PIPELINE_NODES.map((node, i) => {
                const done = isDone || i < resolvedIdx;
                const active = i === resolvedIdx && !isDone;
                const pending = !done && !active;
                return (
                  <div
                    key={node.key}
                    ref={(el) => {
                      pipelineStageRefs.current[i] = el;
                    }}
                    className="relative flex items-center gap-3 group"
                  >
                    <div
                      className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-all duration-300 ${
                        done
                          ? 'border-orion-accent bg-orion-accent text-white shadow-[0_0_14px_rgba(79,70,229,0.35)]'
                          : active
                            ? 'border-orion-accent-light bg-orion-surface text-orion-accent scale-110 shadow-md ring-4 ring-orion-accent/10'
                            : 'border-orion-border bg-orion-surface text-orion-text-dim'
                      }`}
                    >
                      {done ? '✓' : i + 1}
                    </div>
                    <div
                      className={`min-w-0 flex-1 rounded-2xl border px-3 py-3 transition-all duration-300 ${
                        done
                          ? 'border-orion-accent/15 bg-orion-surface shadow-sm'
                          : active
                            ? 'border-orion-accent/30 bg-orion-surface shadow-[0_10px_22px_rgba(99,102,241,0.12)]'
                            : 'border-orion-border/50 bg-orion-surface/65'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`text-sm font-black tracking-tight transition-colors ${
                            done ? 'text-orion-text' : active ? 'text-orion-accent' : 'text-orion-text-muted'
                          }`}>
                            {node.label}
                          </p>
                          <p className="mt-1 text-[11px] font-medium text-orion-text-dim">
                            {done
                              ? 'Completed'
                              : active
                                ? 'Running now'
                                : `Queued · ~${node.avgSec}s`}
                          </p>
                        </div>
                        {active ? (
                          <div className="flex gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-orion-accent-light animate-bounce [animation-delay:-0.3s]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-orion-accent-light animate-bounce [animation-delay:-0.15s]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-orion-accent-light animate-bounce" />
                          </div>
                        ) : done ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                            Done
                          </span>
                        ) : pending ? (
                          <span className="rounded-full bg-orion-surface-2 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-orion-text-dim">
                            Pending
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden card-premium p-0 bg-orion-surface-2/20">
          <div className="shrink-0 flex items-center justify-between gap-3 border-b border-orion-border/50 px-6 py-4 bg-orion-surface/50 backdrop-blur-md">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-orion-accent">Live Activity</p>
              <h3 className="text-sm font-black text-orion-text uppercase tracking-tight">Research Command Center</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-orion-text-dim bg-orion-surface-3/80 px-2 py-1 rounded-lg">
                {items.length} EVENTS
              </span>
            </div>
          </div>

          <div className="shrink-0 border-b border-orion-border/50 bg-orion-surface/30 px-4 py-3 md:px-6">
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-xl border border-orion-border/50 bg-orion-surface px-3 py-2 shadow-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[8px] font-black uppercase tracking-[0.14em] text-orion-text-dim">{s.label}</p>
                    <span className={`h-2 w-2 rounded-full ${s.bg}`} />
                  </div>
                  <p className={`text-lg font-black tracking-tight ${s.color}`}>{s.count}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden bg-orion-surface/30">
            {showDetailPane ? (
              <div className="flex h-full min-h-0 overflow-hidden">
                <div className="w-72 border-r border-orion-border/50 flex flex-col bg-orion-surface/30">
                  <div className="p-3 border-b border-orion-border/50 bg-orion-surface-2/40">
                    <p className="text-[9px] font-black uppercase tracking-widest text-orion-text-dim">Event Stream</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                    {[...items].reverse().map((item, rIdx) => {
                      const idx = items.length - 1 - rIdx;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setDisplayedIdx(idx)}
                          className={`w-full text-left p-3 rounded-xl transition-all duration-300 border ${
                            idx === displayedIdx
                              ? 'bg-orion-surface border-orion-accent/30 shadow-sm ring-1 ring-orion-accent/10 translate-x-1'
                              : 'bg-transparent border-transparent hover:bg-orion-surface/50 hover:border-orion-border text-orion-text-muted'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-orion-text-dim">
                              {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {idx === displayedIdx && <div className="h-1.5 w-1.5 rounded-full bg-orion-accent animate-pulse" />}
                          </div>
                          <p className={`text-[11px] font-bold truncate ${idx === displayedIdx ? 'text-orion-accent' : 'text-orion-text-muted'}`}>
                            {item.message}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 bg-orion-surface/40 animate-premium-fade">
                  <div className="max-w-2xl mx-auto space-y-6">
                    <div className="flex items-center gap-4 mb-8">
                      <div className={`p-4 rounded-3xl shadow-lg border-2 ${ICON_MAP[currentItem.icon]?.bg} ${ICON_MAP[currentItem.icon]?.border}`}>
                        {(() => {
                          const Icon = ICON_MAP[currentItem.icon]?.icon || Search;
                          return <Icon className={`h-8 w-8 ${ICON_MAP[currentItem.icon]?.color}`} />;
                        })()}
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-orion-accent mb-1">Intelligence Event</p>
                        <h4 className="text-2xl font-black text-orion-text tracking-tight leading-tight">{currentItem.message}</h4>
                        <p className="text-xs font-bold text-orion-text-dim mt-1 flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {currentItem.timestamp.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                      <div className="card-premium !p-8 border-indigo-100/50 shadow-indigo-500/5 bg-orion-surface">
                        {currentItem.type === 'paper_found' && currentItem.data ? (
                          <div className="space-y-6">
                            <div className="pb-4 border-b border-orion-border/50">
                              <h5 className="text-lg font-black text-orion-text leading-tight mb-2">{String(currentItem.data.title || 'Untitled source')}</h5>
                              <p className="text-sm font-medium text-orion-text-muted">
                                {String(currentItem.data.authors || 'Unknown')} · {String(currentItem.data.year || 'n.d.')}
                              </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="p-3 rounded-xl bg-orion-surface-2 border border-orion-border/50">
                                <p className="text-[10px] font-bold text-orion-text-dim uppercase tracking-widest mb-1">Source</p>
                                <p className="text-xs font-black text-orion-accent uppercase">{String(currentItem.data.source || 'Unknown')}</p>
                              </div>
                              <div className="p-3 rounded-xl bg-orion-surface-2 border border-orion-border/50">
                                <p className="text-[10px] font-bold text-orion-text-dim uppercase tracking-widest mb-1">Status</p>
                                <p className="text-xs font-black text-orion-success uppercase">Verified</p>
                              </div>
                            </div>
                            {typeof currentItem.data.url === 'string' && currentItem.data.url && (
                              <a
                                href={currentItem.data.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 text-xs font-bold text-orion-accent hover:text-orion-accent-light underline underline-offset-4"
                              >
                                Open Full Document <Search className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        ) : currentItem.type === 'gap' && currentItem.data ? (
                          <div className="space-y-6">
                            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 mb-4">
                              <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="h-4 w-4 text-rose-600" />
                                <span className="text-xs font-black text-rose-700 uppercase tracking-widest">Identified Research Gap</span>
                              </div>
                              <h5 className="text-lg font-black text-rose-950 leading-tight">{String(currentItem.data.title || 'Research gap')}</h5>
                            </div>
                            <div className="space-y-4">
                              <div>
                                <p className="text-[10px] font-black text-orion-text-dim uppercase tracking-widest mb-2">Evidence & Context</p>
                                <p className="text-sm text-orion-text leading-relaxed font-medium">{String(currentItem.data.evidence || 'No context provided.')}</p>
                              </div>
                              <div className="p-5 rounded-2xl bg-orion-surface-3 text-orion-text border border-orion-border shadow-xl">
                                <p className="text-[10px] font-black text-orion-accent uppercase tracking-widest mb-2">Strategic Direction</p>
                                <p className="text-sm font-medium leading-relaxed italic">"{String(currentItem.data.proposed_direction || '')}"</p>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full overflow-y-auto p-4 md:p-6 custom-scrollbar">
                <div className="max-w-4xl mx-auto">
                  <div className="mb-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-orion-text-dim">Event Stream</p>
                  </div>
                  <div className="space-y-3">
                    {[...items].reverse().map((item, rIdx) => {
                      const idx = items.length - 1 - rIdx;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setDisplayedIdx(idx)}
                          className={`w-full text-left rounded-2xl transition-all duration-300 ${
                            idx === displayedIdx ? 'ring-1 ring-orion-accent/20' : ''
                          }`}
                        >
                          <EventCard item={item} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
