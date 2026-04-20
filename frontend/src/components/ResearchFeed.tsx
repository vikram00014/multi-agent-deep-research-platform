import { useEffect, useRef } from 'react';
import {
  Search, FileText, Brain, MessageSquare,
  AlertTriangle, File, CheckCircle2, AlertCircle,
  Plug, Clock, Activity
} from 'lucide-react';
import type { FeedItem } from '../types';

const ICON_MAP: Record<FeedItem['icon'], { icon: typeof Search; color: string }> = {
  search: { icon: Search, color: 'text-orion-info' },
  paper: { icon: FileText, color: 'text-orion-accent-light' },
  brain: { icon: Brain, color: 'text-orion-cyan' },
  debate: { icon: MessageSquare, color: 'text-orion-warning' },
  gap: { icon: AlertTriangle, color: 'text-orion-error' },
  file: { icon: File, color: 'text-orion-accent' },
  check: { icon: CheckCircle2, color: 'text-orion-success' },
  error: { icon: AlertCircle, color: 'text-orion-error' },
  connect: { icon: Plug, color: 'text-orion-success' },
};

const NODE_LABELS: Record<string, string> = {
  planner: 'Planner',
  retrieval: 'Retrieval',
  summarizer: 'Summarizer',
  proposer: 'Proposer',
  critic: 'Critic',
  gap_analysis: 'Gap Analysis',
  paper_architect: 'Paper Architect',
  complete: 'Complete',
};

interface ResearchFeedProps {
  items: FeedItem[];
  isConnected: boolean;
}

export function ResearchFeed({ items, isConnected }: ResearchFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nodeOrder = ['planner', 'retrieval', 'summarizer', 'proposer', 'critic', 'gap_analysis', 'paper_architect', 'complete'];
  const latestNode = [...items].reverse().find(i => i.node)?.node;
  const currentNodeIndex = latestNode ? nodeOrder.indexOf(latestNode) : -1;
  const activeIndex = Math.max(0, currentNodeIndex >= 0 ? currentNodeIndex : 0);
  const activeNode = nodeOrder[activeIndex];
  const activeLabel = NODE_LABELS[activeNode] || 'Starting';
  const totalSteps = nodeOrder.length;
  const progressPercent = Math.max(8, Math.min(100, Math.round(((activeIndex + 1) / totalSteps) * 100)));
  const nextNode = activeIndex + 1 < totalSteps ? nodeOrder[activeIndex + 1] : null;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-orion-text-dim py-20">
        <div className="relative mb-8">
          <div className="h-24 w-24 rounded-full bg-white shadow-lg shadow-orion-text/5 flex items-center justify-center border border-orion-border/30">
            <Search className="h-10 w-10 text-orion-text-dim" />
          </div>
          <div className="absolute -inset-2 rounded-full border border-orion-border/50 animate-pulse-slow" />
        </div>
        <p className="text-lg font-medium text-orion-text-muted mb-1">No research yet</p>
        <p className="text-sm">Enter a topic below to begin deep research</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-3 space-y-0.5">
      {/* Connection indicator */}
      <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full border border-orion-border/40 bg-white/60 backdrop-blur-sm">
        <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-orion-success' : 'bg-orion-error'} animate-pulse-slow`} />
        <span className="text-xs text-orion-text-dim font-medium">
          {isConnected ? 'Connected – receiving live updates' : 'Disconnected'}
        </span>
      </div>

      {/* Node Progress */}
      <div className="mb-5 rounded-xl border border-orion-border/40 bg-white/60 backdrop-blur px-3 py-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-orion-accent" />
            <span className="text-xs font-medium text-orion-text-muted">Pipeline Progress</span>
          </div>
          <span className="text-[11px] font-semibold text-orion-accent-light">
            Step {activeIndex + 1}/{totalSteps}
          </span>
        </div>

        <div className="rounded-lg border border-orion-accent/25 bg-orion-accent/5 px-3 py-2">
          <div className="text-sm font-semibold text-orion-text-muted">
            {activeIndex + 1}. {activeLabel}
          </div>
          {nextNode && (
            <div className="mt-1 text-[11px] text-orion-text-dim">
              Next: {activeIndex + 2}. {NODE_LABELS[nextNode]}
            </div>
          )}
        </div>

        <div className="mt-2 h-2 w-full rounded-full bg-orion-surface-2/60 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orion-accent to-orion-cyan transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="px-2 py-0.5 rounded-md border border-orion-border/40 bg-white text-orion-text-dim">
            Debate: {items.filter(i => i.type === 'debate').length}
          </span>
          <span className="px-2 py-0.5 rounded-md border border-orion-border/40 bg-white text-orion-text-dim">
            Sources found: {items.filter(i => i.type === 'paper_found').length}
          </span>
          <span className="px-2 py-0.5 rounded-md border border-orion-border/40 bg-white text-orion-text-dim">
            Gaps: {items.filter(i => i.type === 'gap').length}
          </span>
        </div>
      </div>

      {/* Feed Items */}
      {items.map((item, idx) => {
        const { icon: IconComp, color } = ICON_MAP[item.icon] || ICON_MAP.search;

        return (
          <div
            key={item.id}
            className="group flex gap-4 py-3 px-3 rounded-xl border border-transparent hover:border-orion-border/30 hover:bg-white/50 hover:shadow-sm transition-all animate-slide-up"
            style={{ animationDelay: `${Math.min(idx, 10) * 35}ms` }}
          >
            {/* Timeline dot + line */}
            <div className="flex flex-col items-center pt-0.5">
              <div className={`p-2 rounded-xl bg-white shadow-sm border border-orion-border/30 ${color}`}>
                <IconComp className="h-4 w-4" />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <p className={`text-sm leading-relaxed ${
                item.type === 'error' ? 'text-orion-error' :
                item.type === 'complete' ? 'text-orion-success font-medium' :
                'text-orion-text-muted'
              }`}>
                {item.message}
              </p>

              {item.node && (
                <div className="mt-1">
                  <span className="inline-flex px-2 py-0.5 rounded-md bg-orion-accent/10 text-orion-accent-light text-[10px] border border-orion-accent/20">
                    {NODE_LABELS[item.node] || item.node}
                  </span>
                </div>
              )}

              {item.type === 'paper_found' && item.data && (
                <div className="mt-2 p-3 rounded-xl bg-white/70 backdrop-blur-md border border-orion-border/40 shadow-sm">
                  <p className="text-sm text-orion-text font-semibold tracking-tight truncate">
                    {item.data.title as string}
                  </p>
                  <p className="text-xs text-orion-text-muted mt-1 font-medium">
                    {item.data.authors as string} · {item.data.year as string} · {item.data.source as string}
                  </p>
                  {typeof item.data.confidence === 'number' && (
                    <p className="text-[11px] text-orion-accent-light mt-1">
                      confidence: {(Number(item.data.confidence) * 100).toFixed(0)}%
                    </p>
                  )}
                </div>
              )}

              {item.type === 'gap' && item.data && (
                <div className="mt-2 p-3 rounded-xl bg-[var(--color-orion-error)]/5 border border-[var(--color-orion-error)]/10 shadow-sm">
                  <p className="text-sm text-orion-error font-medium">{item.data.title as string}</p>
                  {item.data.proposed_direction ? (
                    <p className="text-xs text-orion-text-muted mt-1.5 leading-relaxed bg-[var(--color-orion-error)]/5 p-2 rounded-lg">
                      → {String(item.data.proposed_direction)}
                    </p>
                  ) : null}
                </div>
              )}

              {item.type === 'debate' && typeof item.data?.snippet === 'string' && (
                <div className="mt-2 p-3 rounded-xl bg-orion-warning/10 border border-orion-warning/20 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-orion-warning mb-1">
                    {typeof item.data?.speaker === 'string' ? item.data.speaker : 'debate'}
                  </p>
                  <p className="text-xs text-orion-text-muted leading-relaxed">
                    {item.data.snippet}
                  </p>
                </div>
              )}

              {/* Timestamp */}
              <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Clock className="h-3 w-3 text-orion-text-dim" />
                <span className="text-[10px] text-orion-text-dim">
                  {item.timestamp.toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Loading indicator at bottom */}
      {isConnected && items.length > 0 && !items.some(i => i.type === 'complete' || i.type === 'error') && (
        <div className="flex items-center gap-2 py-3 px-3 rounded-lg border border-orion-border/40 bg-white/55 backdrop-blur-sm animate-pulse-slow">
          <div className="h-3.5 w-3.5 rounded-full border-2 border-orion-accent/30 border-t-orion-accent animate-spin" />
          <span className="text-xs text-orion-text-dim ml-1">Processing research pipeline...</span>
        </div>
      )}
    </div>
  );
}
