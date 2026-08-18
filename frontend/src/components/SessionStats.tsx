import React from 'react';
import { motion } from 'framer-motion';
import { Activity, BookOpen, Clock, CheckCircle2, Database, FileText, Hash, Layers, ShieldCheck, Sparkles } from 'lucide-react';
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

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      className="card p-5 flex flex-col justify-between gap-2 shadow-md"
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: color ? `${color}18` : 'rgba(99,102,241,0.12)' }}
        >
          <Icon size={16} color={color || 'var(--color-blue-dim)'} />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-ink-mute)' }}>
          {label}
        </span>
      </div>
      <div>
        <div className="text-2xl font-extrabold" style={{ color: 'var(--color-ink)' }}>{value}</div>
        {sub && <div className="text-xs mt-0.5" style={{ color: 'var(--color-ink-mute)' }}>{sub}</div>}
      </div>
    </motion.div>
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
  const compScore   = compliance?.score != null ? Math.round(compliance.score * 100) : null;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <p className="mono-kicker mb-1">Session Analytics & Rigor Score</p>
        <h2 className="text-xl font-bold" style={{ color: 'var(--color-ink)' }}>
          {detail.topic}
        </h2>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {detail.status === 'complete' && (
            <span className="badge badge-green">Verified Complete</span>
          )}
          {Boolean(detail.controls?.paper_format) && (
            <span className="badge badge-blue">{String(detail.controls!.paper_format).toUpperCase()} Format</span>
          )}
          {Boolean(detail.controls?.depth) && (
            <span className="badge badge-pink">{String(detail.controls!.depth).toUpperCase()} Mode</span>
          )}
        </div>
      </div>

      {/* ── Primary Metrics ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Clock}
          label="Execution Time"
          value={formatTime(elapsed)}
          sub="multi-agent generation"
          color="#6366f1"
        />
        <StatCard
          icon={Hash}
          label="LLM Tokens"
          value={tokenEstimate.toLocaleString()}
          sub="Gemini Free Tier Engine"
          color="#ec4899"
        />
        <StatCard
          icon={Database}
          label="Academic Papers"
          value={totalSources}
          sub={`from ${Object.keys(sourceCounts).length} repositories`}
          color="#818cf8"
        />
        <StatCard
          icon={Activity}
          label="Debate Rounds"
          value={debates}
          sub={`${citations} verified citations`}
          color="#d946ef"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={FileText} label="Bibliography" value={bibCount} sub="curated citations" color="#f472b6" />
        <StatCard icon={Layers}   label="Research Gaps" value={gapCount} sub="unexplored frontiers" color="#ec4899" />
        <StatCard
          icon={ShieldCheck}
          label="Format Quality"
          value={compScore != null ? `${compScore}%` : '100%'}
          sub={compliance?.paper_format ? compliance.paper_format.toUpperCase() : 'Standard'}
          color="#10b981"
        />
        <StatCard icon={BookOpen} label="Grounding PDFs" value={detail.uploaded_paper_ids?.length ?? 0} sub="custom source documents" color="#6366f1" />
      </div>

      {/* ── Source Breakdown ── */}
      {Object.keys(sourceCounts).length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--color-ink)' }}>
            <Database size={15} color="var(--color-blue-dim)" />
            Academic Source Distribution
          </h3>
          <div className="space-y-3">
            {Object.entries(sourceCounts).sort((a, b) => Number(b[1]) - Number(a[1])).map(([source, rawCount]) => {
              const count = Number(rawCount);
              const pct = totalSources > 0 ? Math.round((count / totalSources) * 100) : 0;
              return (
                <div key={source}>
                  <div className="flex items-center justify-between mb-1.5 text-xs">
                    <span className="capitalize font-medium" style={{ color: 'var(--color-ink-soft)' }}>
                      {source.replace(/_/g, ' ')}
                    </span>
                    <span className="font-semibold" style={{ color: 'var(--color-ink)' }}>
                      {String(count)} papers ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-raised)' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ background: 'var(--gradient-primary)' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ── Format Compliance ── */}
      {compliance?.checks && Object.keys(compliance.checks).length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--color-ink)' }}>
            <Sparkles size={15} color="var(--color-pink)" />
            Manuscript Structure & Verification — {compliance.paper_format?.toUpperCase()}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {Object.entries(compliance.checks).map(([check, passed]) => (
              <div key={check} className="flex items-center justify-between p-2.5 rounded-lg border"
                style={{ borderColor: 'var(--color-line)', background: 'var(--color-raised)' }}>
                <span className="text-xs font-medium" style={{ color: 'var(--color-ink-soft)' }}>
                  {formatCheckName(check)}
                </span>
                <span className={`badge ${passed ? 'badge-green' : 'badge-err'}`}>
                  {passed ? '✓ Valid' : '— Missing'}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 flex items-center justify-between border-t" style={{ borderColor: 'var(--color-line)' }}>
            <span className="text-xs font-medium" style={{ color: 'var(--color-ink-mute)' }}>
              Overall Publication Score
            </span>
            <span className="text-base font-bold gradient-text">
              {compliance.passed}/{compliance.total} structural checks passed
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
