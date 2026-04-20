import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, Copy, CheckCircle2, FileText, Loader2, Sparkles, ShieldCheck, MessagesSquare } from 'lucide-react';
import { api } from '../api';
import type { PaperResult, ResearchGap } from '../types';

interface PaperViewerProps {
  sessionId: string | null;
  isComplete: boolean;
}

export function PaperViewer({ sessionId, isComplete }: PaperViewerProps) {
  const [paper, setPaper] = useState<PaperResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId && isComplete) {
      setLoading(true);
      setError(null);
      api.getPaper(sessionId)
        .then(setPaper)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [sessionId, isComplete]);

  const handleCopy = () => {
    const text = paper?.final_draft || paper?.paper;
    if (text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const text = paper?.final_draft || paper?.paper;
    if (!text) return;
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orion-final-draft-${sessionId?.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAnalysis = () => {
    const text = paper?.analysis;
    if (!text) return;
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orion-analysis-${sessionId?.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  // Empty state
  if (!sessionId || (!isComplete && !loading)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-orion-text-dim py-20">
        <div className="relative mb-8">
          <div className="h-24 w-24 rounded-full bg-white shadow-lg shadow-orion-text/5 flex items-center justify-center border border-orion-border/30">
            <FileText className="h-10 w-10 text-orion-text-dim" />
          </div>
        </div>
        <p className="text-lg font-medium text-orion-text-muted mb-1">Paper will appear here</p>
        <p className="text-sm">Start a research session to generate a paper</p>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <Loader2 className="h-10 w-10 text-orion-accent animate-spin mb-4" />
        <p className="text-orion-text-muted">Loading paper...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 px-4">
        <p className="text-orion-error mb-2">Failed to load paper</p>
        <p className="text-sm text-orion-text-dim text-center">{error}</p>
      </div>
    );
  }

  if (!paper) return null;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 glass z-10 sticky top-0 border-b border-orion-border/30">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-orion-text-muted tracking-wide uppercase font-display">
            {paper.gaps?.length || 0} gaps · {paper.bibliography?.length || 0} references
          </span>
          {paper.claim_to_evidence_map && (
            <span className="text-xs text-orion-text-dim">
              {paper.claim_to_evidence_map.length} claim-evidence links
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-orion-text-muted
              bg-white/60 backdrop-blur shadow-sm border border-orion-border/50 hover:bg-white hover:text-orion-text transition-all"
          >
            {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-orion-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-orion-text-muted
              bg-white/60 backdrop-blur shadow-sm border border-orion-border/50 hover:bg-white hover:text-orion-text transition-all"
          >
            <Download className="h-4 w-4" />
            Final Draft
          </button>
          {paper.analysis ? (
            <button
              onClick={handleDownloadAnalysis}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-orion-text-muted
                bg-white/60 backdrop-blur shadow-sm border border-orion-border/50 hover:bg-white hover:text-orion-text transition-all"
            >
              <Download className="h-4 w-4" />
              Analysis
            </button>
          ) : null}
          <button
            onClick={handlePrintPdf}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
              bg-orion-accent text-white hover:bg-orion-accent-light shadow-md transition-all active:scale-[0.98]"
          >
            <Download className="h-4 w-4" />
            PDF
          </button>
        </div>
      </div>

      {/* Paper Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8 md:py-12 pb-32">
        <div className="max-w-4xl mx-auto glass-solid p-8 md:p-14 rounded-[2rem] shadow-xl shadow-orion-text/5 border border-white">
          <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-orion-border/40 bg-white/70 p-3">
              <p className="text-[11px] uppercase tracking-wide text-orion-text-dim">System Strength</p>
              <p className="mt-1 text-sm text-orion-text-muted flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orion-accent" />
                Multi-stage RAG + critique loop
              </p>
            </div>
            <div className="rounded-xl border border-orion-border/40 bg-white/70 p-3">
              <p className="text-[11px] uppercase tracking-wide text-orion-text-dim">Debate Rounds</p>
              <p className="mt-1 text-sm text-orion-text-muted flex items-center gap-2">
                <MessagesSquare className="h-4 w-4 text-orion-warning" />
                {paper.debate_rounds ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-orion-border/40 bg-white/70 p-3">
              <p className="text-[11px] uppercase tracking-wide text-orion-text-dim">Verified Citations</p>
              <p className="mt-1 text-sm text-orion-text-muted flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-orion-success" />
                {paper.verified_citations ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-orion-border/40 bg-white/70 p-3 md:col-span-3">
              <p className="text-[11px] uppercase tracking-wide text-orion-text-dim">Format Compliance</p>
              <p className="mt-1 text-sm text-orion-text-muted">
                {typeof paper.format_compliance?.score === 'number'
                  ? `${Math.round((paper.format_compliance.score || 0) * 100)}%`
                  : 'N/A'}
                {' · '}
                {paper.format_compliance?.is_compliant ? 'Compliant' : 'Needs review'}
              </p>
            </div>
          </div>
          <div className="mb-5 inline-flex px-3 py-1 rounded-lg border border-orion-border/40 bg-white/70 text-xs text-orion-text-dim">
            Draft format: {String(paper.paper_format || 'academic').toUpperCase()}
          </div>

          {paper.analysis ? (
            <div className="mb-10">
              <h2 className="text-xl font-display font-semibold text-orion-text mb-3">Research Analysis Dossier</h2>
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {paper.analysis}
                </ReactMarkdown>
              </div>
            </div>
          ) : null}

          <div className="mb-3 h-px bg-orion-border/60" />
          <h2 className="text-xl font-display font-semibold text-orion-text mb-3">Final Draft Paper</h2>
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {paper.final_draft || paper.paper}
            </ReactMarkdown>
          </div>

          {paper.source_counts && (
            <div className="mt-8 p-4 rounded-xl border border-orion-border/40 bg-white/60">
              <p className="text-sm font-medium text-orion-text-muted mb-2">Source Mix</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(paper.source_counts).map(([k, v]) => (
                  <span key={k} className="text-xs px-2 py-1 rounded-md bg-orion-accent/10 text-orion-accent-light border border-orion-accent/20">
                    {k}: {String(v)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {paper.gap_critique ? (
            <div className="mt-6 p-4 rounded-xl border border-orion-border/40 bg-white/60">
              <p className="text-sm font-medium text-orion-text-muted mb-2">Gap Reviewer Notes</p>
              <p className="text-xs text-orion-text-dim leading-relaxed">{paper.gap_critique}</p>
            </div>
          ) : null}

        {/* Gaps Summary */}
        {paper.gaps && paper.gaps.length > 0 && (
          <div className="max-w-4xl mx-auto mt-10">
            <h2 className="text-xl font-display font-semibold text-orion-text mb-6 flex items-center gap-3">
              <span className="h-8 w-1.5 rounded-full bg-orion-error border border-white shadow-sm" />
              Structured Gap Summary
            </h2>
            <div className="space-y-4">
              {paper.gaps.map((gap: ResearchGap, i: number) => (
                <div
                  key={i}
                  className="p-6 rounded-2xl bg-white/80 backdrop-blur shadow-sm border border-orion-border/40 hover:bg-white hover:shadow-md transition-all"
                >
                  <p className="font-medium text-orion-text mb-1">{gap.title}</p>
                  <p className="text-sm text-orion-text-muted mb-2">{gap.evidence}</p>
                  {gap.why_gap ? (
                    <p className="text-xs text-orion-text-dim mb-2">
                      <strong>Why this is a gap:</strong> {gap.why_gap}
                    </p>
                  ) : null}
                  {gap.what_missing ? (
                    <p className="text-xs text-orion-text-dim mb-2">
                      <strong>What is missing:</strong> {gap.what_missing}
                    </p>
                  ) : null}
                  {Array.isArray(gap.supports) && gap.supports.length > 0 ? (
                    <p className="text-xs text-orion-text-dim mb-2">
                      <strong>Supports:</strong> {gap.supports.slice(0, 3).join(', ')}
                    </p>
                  ) : null}
                  {Array.isArray(gap.fails) && gap.fails.length > 0 ? (
                    <p className="text-xs text-orion-text-dim mb-2">
                      <strong>Fails to address:</strong> {gap.fails.slice(0, 3).join(', ')}
                    </p>
                  ) : null}
                  <p className="text-sm text-orion-accent-light">
                    <strong>Direction:</strong> {gap.proposed_direction}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
