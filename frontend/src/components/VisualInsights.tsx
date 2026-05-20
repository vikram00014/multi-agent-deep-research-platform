import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  GitCompareArrows,
  Loader2,
  Network,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../api';
import type { FeedItem, PaperResult, SessionDetail } from '../types';

interface VisualInsightsProps {
  sessionId: string | null;
  isReady: boolean;
  sessionDetail: SessionDetail | null;
  feedItems: FeedItem[];
}

function VerticalBarChart({
  items,
  colorClass,
}: {
  items: Array<{ label: string; value: number }>;
  colorClass: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => {
        const height = Math.max(16, Math.round((item.value / max) * 96));
        return (
          <div key={item.label} className="rounded-2xl border border-orion-border/50 bg-orion-surface/80 px-3 py-3">
            <div className="flex h-28 items-end justify-center">
              <div
                className={`w-10 rounded-t-2xl shadow-sm transition-all duration-500 ${colorClass}`}
                style={{ height }}
              />
            </div>
            <p className="mt-3 text-center text-lg font-black tracking-tight text-orion-text">{item.value}</p>
            <p className="mt-1 text-center text-[10px] font-black uppercase tracking-[0.16em] text-orion-text-dim">
              {item.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function VisualInsights({ sessionId, isReady, sessionDetail, feedItems }: VisualInsightsProps) {
  const [paper, setPaper] = useState<PaperResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !isReady) {
      setPaper(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    api.getPaper(sessionId)
      .then(setPaper)
      .catch((err) => setError(err.message || 'Failed to load insights'))
      .finally(() => setLoading(false));
  }, [sessionId, isReady]);

  const sourceMix = useMemo(() => {
    const counts = paper?.source_counts || {};
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value: Number(value || 0) }))
      .sort((a, b) => b.value - a.value);
  }, [paper?.source_counts]);

  const verification = useMemo(() => {
    const total = paper?.bibliography?.length || 0;
    const verified = paper?.verified_citations || 0;
    return {
      verified,
      unverified: Math.max(0, total - verified),
      total,
    };
  }, [paper?.bibliography, paper?.verified_citations]);

  const nodeActivity = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of feedItems) {
      const key = item.node || (typeof item.data?.node === 'string' ? item.data.node : '') || item.type;
      const label = String(key || 'status');
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label: label.replace(/_/g, ' '), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [feedItems]);

  const confidenceBands = useMemo(() => {
    const values = Object.values(paper?.citation_quality || {}).map((entry) => Number(entry?.confidence || 0));
    const buckets = { High: 0, Medium: 0, Low: 0 };
    for (const value of values) {
      if (value >= 0.8) buckets.High += 1;
      else if (value >= 0.6) buckets.Medium += 1;
      else buckets.Low += 1;
    }
    return [
      { label: 'High', value: buckets.High },
      { label: 'Medium', value: buckets.Medium },
      { label: 'Low', value: buckets.Low },
    ];
  }, [paper?.citation_quality]);

  const comparativeBlocks = useMemo(() => {
    const cross = paper?.cross_paper_analysis || {};
    return [
      {
        title: 'Method Patterns',
        items: Array.isArray(cross.methodology_patterns) ? cross.methodology_patterns : [],
      },
      {
        title: 'Comparative Axes',
        items: Array.isArray(cross.comparative_axes) ? cross.comparative_axes : [],
      },
      {
        title: 'Missing Dimensions',
        items: Array.isArray(cross.missing_dimensions) ? cross.missing_dimensions : [],
      },
      {
        title: 'Recommended Experiments',
        items: Array.isArray(cross.recommended_experiments) ? cross.recommended_experiments : [],
      },
    ].filter((block) => block.items.length > 0);
  }, [paper?.cross_paper_analysis]);

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-xl rounded-3xl border border-orion-border bg-orion-surface px-8 py-14 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-orion-accent/20 bg-orion-accent/10">
            <BarChart3 className="h-9 w-9 text-orion-accent" />
          </div>
          <p className="text-xl font-black tracking-tight text-orion-text">Visual Insights</p>
          <p className="mt-2 text-sm font-medium text-orion-text-dim">
            Start a research session and this page will turn the evidence into charts, comparisons, and useful signals.
          </p>
        </div>
      </div>
    );
  }

  if (!isReady || loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-9 w-9 animate-spin text-orion-accent" />
          <p className="text-sm font-semibold text-orion-text-muted">Preparing visual insights...</p>
        </div>
      </div>
    );
  }

  if (error || !paper) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-lg rounded-3xl border border-orion-border bg-orion-surface px-8 py-12 text-center shadow-sm">
          <AlertTriangle className="mx-auto mb-4 h-8 w-8 text-amber-500" />
          <p className="text-base font-bold text-orion-text">Insights are not ready yet</p>
          <p className="mt-2 text-sm text-orion-text-dim">{error || 'This session has not produced a completed paper package yet.'}</p>
        </div>
      </div>
    );
  }

  const elapsedMinutes = sessionDetail?.elapsed_seconds ? Math.max(1, Math.round(sessionDetail.elapsed_seconds / 60)) : 0;

  return (
    <div className="h-full overflow-y-auto p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orion-accent">Session Insights</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-orion-text">Visual Research Briefing</h2>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-orion-text-dim">
              A quicker read of the session: where the evidence came from, how strong it looks, where the activity clustered,
              and what the cross-paper comparison is really saying.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:w-[360px]">
            <div className="rounded-2xl border border-orion-border/50 bg-orion-surface px-4 py-3 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-orion-text-dim">Sources</p>
              <p className="mt-1 text-2xl font-black tracking-tight text-orion-text">{paper.bibliography?.length || 0}</p>
            </div>
            <div className="rounded-2xl border border-orion-border/50 bg-orion-surface px-4 py-3 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-orion-text-dim">Verified</p>
              <p className="mt-1 text-2xl font-black tracking-tight text-emerald-600">{verification.verified}</p>
            </div>
            <div className="rounded-2xl border border-orion-border/50 bg-orion-surface px-4 py-3 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-orion-text-dim">Debates</p>
              <p className="mt-1 text-2xl font-black tracking-tight text-amber-600">{paper.debate_rounds ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-orion-border/50 bg-orion-surface px-4 py-3 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-orion-text-dim">Elapsed</p>
              <p className="mt-1 text-2xl font-black tracking-tight text-cyan-600">{elapsedMinutes ? `${elapsedMinutes}m` : 'n/a'}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-orion-border/50 bg-orion-surface p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-violet-50 p-3 text-violet-700">
                <Network className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-black tracking-tight text-orion-text">Source Coverage</p>
                <p className="text-xs font-medium text-orion-text-dim">How the evidence is distributed across source families.</p>
              </div>
            </div>
            {sourceMix.length === 0 ? (
              <p className="text-sm text-orion-text-dim">No source distribution available yet.</p>
            ) : (
              <VerticalBarChart items={sourceMix} colorClass="bg-gradient-to-t from-violet-500 to-indigo-500" />
            )}
          </section>

          <section className="rounded-3xl border border-orion-border/50 bg-orion-surface p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-black tracking-tight text-orion-text">Verification Snapshot</p>
                <p className="text-xs font-medium text-orion-text-dim">Citation reliability and confidence bands from the completed dossier.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-orion-border/50 bg-orion-surface-2/50 p-4">
                <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-[0.14em] text-orion-text-dim">
                  <span>Verified coverage</span>
                  <span>{verification.total ? Math.round((verification.verified / verification.total) * 100) : 0}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-orion-surface-3">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-700"
                    style={{ width: `${verification.total ? (verification.verified / verification.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm font-semibold">
                  <div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">{verification.verified} verified</div>
                  <div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-700">{verification.unverified} pending</div>
                </div>
              </div>
              <VerticalBarChart items={confidenceBands} colorClass="bg-gradient-to-t from-cyan-500 to-sky-500" />
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-3xl border border-orion-border/50 bg-orion-surface p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-black tracking-tight text-orion-text">Pipeline Activity Density</p>
                <p className="text-xs font-medium text-orion-text-dim">Where the orchestration spent the most visible activity.</p>
              </div>
            </div>
            {nodeActivity.length === 0 ? (
              <p className="text-sm text-orion-text-dim">No activity map available.</p>
            ) : (
              <div className="space-y-3">
                {nodeActivity.map((item) => {
                  const max = Math.max(1, ...nodeActivity.map((entry) => entry.value));
                  const width = Math.max(12, Math.round((item.value / max) * 100));
                  return (
                    <div key={item.label} className="rounded-2xl border border-orion-border/50 bg-orion-surface-2/40 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="font-bold capitalize text-orion-text">{item.label}</span>
                        <span className="font-semibold text-orion-text-dim">{item.value} events</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-orion-surface-3">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-700"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-orion-border/50 bg-orion-surface p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-fuchsia-50 p-3 text-fuchsia-700">
                <GitCompareArrows className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-black tracking-tight text-orion-text">Cross-Paper Signals</p>
                <p className="text-xs font-medium text-orion-text-dim">The most actionable comparative findings from the synthesis engine.</p>
              </div>
            </div>
            {comparativeBlocks.length === 0 ? (
              <p className="text-sm text-orion-text-dim">Cross-paper signals are not available for this session yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {comparativeBlocks.map((block) => (
                  <div key={block.title} className="rounded-2xl border border-orion-border/50 bg-orion-surface-2/40 p-4">
                    <p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-orion-accent">{block.title}</p>
                    <ul className="space-y-2">
                      {block.items.slice(0, 4).map((item, index) => (
                        <li key={`${block.title}-${index}`} className="text-sm font-medium leading-relaxed text-orion-text-muted">
                          {String(item)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="rounded-3xl border border-orion-border/50 bg-orion-surface p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-rose-50 p-3 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black tracking-tight text-orion-text">Research Gaps Worth Acting On</p>
              <p className="text-xs font-medium text-orion-text-dim">The clearest unresolved spaces surfaced by the session.</p>
            </div>
          </div>
          {paper.gaps?.length ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {paper.gaps.slice(0, 6).map((gap, index) => (
                <div key={`${gap.title}-${index}`} className="rounded-2xl border border-orion-border/50 bg-orion-surface-2/40 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <p className="text-sm font-black leading-snug text-orion-text">{gap.title}</p>
                    <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-rose-700">
                      Gap {index + 1}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-orion-text-muted">{gap.evidence}</p>
                  <div className="mt-4 rounded-xl bg-orion-accent/8 px-3 py-3 text-sm font-medium leading-relaxed text-orion-text">
                    <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-orion-accent">Direction</span>
                    <span className="mt-1 block">{gap.proposed_direction}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-orion-text-dim">No structured gap set is available for this session.</p>
          )}
        </section>

        <section className="rounded-3xl border border-orion-border/50 bg-orion-surface p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black tracking-tight text-orion-text">Format + Output Quality Signals</p>
              <p className="text-xs font-medium text-orion-text-dim">A quick confidence pass on the final package, straight from the session result.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-orion-border/50 bg-orion-surface-2/40 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-orion-text-dim">Format Compliance</p>
              <p className="mt-2 text-3xl font-black tracking-tight text-orion-text">
                {paper.format_compliance?.score ? `${Math.round(paper.format_compliance.score * 100)}%` : 'n/a'}
              </p>
            </div>
            <div className="rounded-2xl border border-orion-border/50 bg-orion-surface-2/40 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-orion-text-dim">Claim-Evidence Links</p>
              <p className="mt-2 text-3xl font-black tracking-tight text-orion-text">{paper.claim_to_evidence_map?.length || 0}</p>
            </div>
            <div className="rounded-2xl border border-orion-border/50 bg-orion-surface-2/40 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-orion-text-dim">Feed Events</p>
              <p className="mt-2 text-3xl font-black tracking-tight text-orion-text">{feedItems.length}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
