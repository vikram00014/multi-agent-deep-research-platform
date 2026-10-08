import React from 'react';
import {
  Activity,
  BookOpen,
  Clock,
  Database,
  FileText,
  Hash,
  Layers,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import type { SessionDetail, PaperResult } from '../types';

interface SessionStatsProps {
  detail: SessionDetail;
  paper?: PaperResult | null;
}

function formatCheckName(name: string): string {
  const customMap: Record<string, string> = {
    has_abstract: 'Structured Abstract',
    has_introduction: 'Introduction & Context',
    has_methodology: 'Methodology & Approach',
    has_results: 'Results & Findings',
    has_discussion: 'Discussion & Implications',
    has_conclusion: 'Conclusion & Summary',
    has_bibliography: 'References & Bibliography',
    has_citation_numbers: 'Citation Numbering',
    has_ieee_headings: 'IEEE Section Hierarchy',
    has_apa_format: 'APA Style Compliance',
  };
  if (customMap[name]) return customMap[name];
  return name
    .replace(/^has_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSourceName(source: string): string {
  const map: Record<string, string> = {
    openalex: 'OpenAlex',
    crossref: 'Crossref',
    arxiv: 'arXiv',
    tavily: 'Tavily',
    web_tavily: 'Tavily',
    semantic_scholar: 'Semantic Scholar',
    semanticscholar: 'Semantic Scholar',
    github: 'GitHub',
    custom_pdf: 'Custom PDF',
    vector_store: 'Custom Document Store',
  };
  const key = source.trim().toLowerCase();
  if (map[key]) return map[key];
  return source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string;
}) {
  return (
    <div className="card p-4 flex flex-col justify-between gap-2.5">
      <div className="flex items-center gap-2 text-ink-mute">
        <Icon size={15} className="text-ink-soft shrink-0" />
        <span className="mono-kicker text-xs truncate">
          {label}
        </span>
      </div>
      <div>
        <div className="text-2xl sm:text-3xl font-bold font-mono text-ink tracking-tight">{value}</div>
        {sub && <div className="text-xs text-ink-mute mt-1">{sub}</div>}
      </div>
    </div>
  );
}

export function SessionStats({ detail, paper }: SessionStatsProps) {
  const tokenEstimate = detail.token_estimate ?? 0;
  const elapsed       = detail.elapsed_seconds ?? 0;

  const sourceCounts  = detail.source_counts  ?? paper?.source_counts  ?? {};
  const totalSources  = Object.values(sourceCounts).reduce((a: number, b) => a + Number(b), 0);

  const debates     = paper?.debate_rounds    ?? 0;
  const citations   = paper?.verified_citations ?? 0;
  const gapCount    = paper?.gaps?.length      ?? 0;
  const bibCount    = paper?.bibliography?.length ?? 0;
  const compliance  = paper?.format_compliance;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="border-b border-line pb-4">
        <span className="mono-kicker text-xs">Session Analytics & Provenance</span>
        <h2 className="text-xl sm:text-2xl font-bold text-ink mt-1">
          {detail.topic}
        </h2>
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          {detail.status === 'complete' && (
            <span className="badge badge-green">Research Complete</span>
          )}
          {Boolean(detail.controls?.paper_format) && (
            <span className="badge badge-blue">{String(detail.controls!.paper_format).toUpperCase()} Format</span>
          )}
          {Boolean(detail.controls?.depth) && (
            <span className="badge">{String(detail.controls!.depth).toUpperCase()} Mode</span>
          )}
        </div>
      </div>

      {/* ── Primary Metrics ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <StatCard
          icon={Clock}
          label="Execution Time"
          value={formatTime(elapsed)}
          sub="multi-agent generation"
        />
        <StatCard
          icon={Hash}
          label="Content Analyzed"
          value={tokenEstimate.toLocaleString()}
          sub="words and passages"
        />
        <StatCard
          icon={Database}
          label="Papers Retrieved"
          value={totalSources}
          sub={`from ${Object.keys(sourceCounts).length} repositories`}
        />
        <StatCard
          icon={Activity}
          label="Debate Rounds"
          value={debates}
          sub={`${debates === 1 ? '1 round' : `${debates} rounds`} peer critique`}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <StatCard
          icon={ShieldCheck}
          label="Citations Verified"
          value={bibCount > 0 ? `${citations} / ${bibCount}` : citations}
          sub={bibCount > 0 && citations === bibCount ? '100% metadata verified' : `${Math.max(0, bibCount - citations)} web sources`}
        />
        <StatCard
          icon={FileText}
          label="Bibliography"
          value={bibCount}
          sub="cited in manuscript"
        />
        <StatCard
          icon={Layers}
          label="Research Gaps"
          value={gapCount}
          sub="frontier problems"
        />
        <StatCard
          icon={BookOpen}
          label="Reference Papers"
          value={detail.uploaded_paper_ids?.length ?? 0}
          sub="custom uploaded files"
        />
      </div>

      {/* ── Source Breakdown ── */}
      {Object.keys(sourceCounts).length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Database size={15} className="text-ink-mute" />
            <h3 className="text-sm font-semibold text-ink">
              Academic Source Channel Distribution
            </h3>
          </div>
          <div className="space-y-3">
            {Object.entries(sourceCounts).sort((a, b) => Number(b[1]) - Number(a[1])).map(([source, rawCount]) => {
              const count = Number(rawCount);
              const pct = totalSources > 0 ? Math.round((count / totalSources) * 100) : 0;
              return (
                <div key={source}>
                  <div className="flex items-center justify-between mb-1.5 text-xs">
                    <span className="font-medium text-ink-soft">
                      {formatSourceName(source)}
                    </span>
                    <span className="font-mono text-ink text-[11px] font-semibold">
                      {String(count)} {count === 1 ? 'paper' : 'papers'} · {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden bg-surface-subtle border border-line">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Format Compliance ── */}
      {compliance?.checks && Object.keys(compliance.checks).length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={15} className="text-ok" />
            <h3 className="text-sm font-semibold text-ink">
              Manuscript Structure & Standards Compliance ({compliance.paper_format?.toUpperCase()})
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(compliance.checks).map(([check, passed]) => (
              <div
                key={check}
                className="flex items-center justify-between p-2.5 rounded border border-line bg-surface-subtle"
              >
                <span className="text-xs text-ink-soft font-medium">
                  {formatCheckName(check)}
                </span>
                <span className={`badge ${passed ? 'badge-green' : 'badge-err'}`}>
                  {passed ? '✓ Valid' : '— Missing'}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 flex items-center justify-between border-t border-line">
            <span className="text-xs text-ink-mute">
              Section & Formatting Verification
            </span>
            <span className="font-mono text-sm font-semibold text-ink">
              {compliance.passed} / {compliance.total} structural checks verified
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
