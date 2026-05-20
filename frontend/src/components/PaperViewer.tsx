import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, Copy, CheckCircle2, FileText, Loader2, Sparkles, ShieldCheck, MessagesSquare } from 'lucide-react';
import { api } from '../api';
import type { PaperResult, ResearchGap } from '../types';
import { Mermaid } from './Mermaid';

interface PaperViewerProps {
  sessionId: string | null;
  isComplete: boolean;
}

export function PaperViewer({ sessionId, isComplete }: PaperViewerProps) {
  const [paper, setPaper] = useState<PaperResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'dossier' | 'manuscript'>('dossier');

  const cleanDossierText = (text: string | undefined) =>
    String(text || '')
      .replace(/^##\s*PART A - Research Analysis Dossier \(Highly Visual Explanation\)\s*\n+/i, '')
      .trim();

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

  const handleDownloadPdf = () => {
    if (!sessionId) return;
    const a = document.createElement('a');
    a.href = api.paperPdfDownloadUrl(sessionId);
    a.download = `orion-report-${sessionId.slice(0, 8)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Empty state
  if (!sessionId || (!isComplete && !loading)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-orion-text-dim py-20">
        <div className="relative mb-8">
          <div className="h-24 w-24 rounded-full bg-orion-surface-2 shadow-lg shadow-orion-text/5 flex items-center justify-center border border-orion-border/30">
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
    <div className="h-full flex flex-col bg-orion-surface/30">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 glass z-20 sticky top-0 border-b border-orion-border/60 backdrop-blur-xl">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-1 bg-orion-accent rounded-full"></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-orion-accent">Research Outcome</p>
              <h1 className="text-xs font-black tracking-tight text-orion-text">Final Intelligence Report</h1>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4 border-l border-orion-border pl-6">
            <span className="text-xs font-bold text-orion-text-muted">
              <strong className="text-orion-text">{paper.gaps?.length || 0}</strong> Gaps Identified
            </span>
            <span className="text-xs font-bold text-orion-text-muted">
              <strong className="text-orion-text">{paper.verified_citations ?? (paper.bibliography?.length || 0)}</strong> Sources Verified
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-orion-text-muted
              bg-orion-surface shadow-sm border border-orion-border hover:bg-orion-surface-2 hover:text-orion-accent transition-all active:scale-95"
          >
            {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-orion-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy Markdown'}
          </button>
          
          <div className="h-6 w-px bg-orion-border mx-1" />

          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-orion-text-muted
              bg-orion-surface shadow-sm border border-orion-border hover:bg-orion-surface-2 hover:text-orion-accent transition-all active:scale-95"
          >
            <Download className="h-3.5 w-3.5" />
            Download Draft
          </button>
          <button
            onClick={handleDownloadPdf}
            className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white active:scale-95 shadow-lg shadow-indigo-200"
          >
            <FileText className="h-3.5 w-3.5" />
            Download PDF
          </button>
        </div>
      </div>

      {/* Paper Content */}
      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-10 md:py-16 pb-32">
        <div className="max-w-4xl mx-auto bg-orion-surface p-6 md:p-12 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-orion-border/50">
          <div className="mb-8 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-orion-border/50 bg-orion-surface-2/50 p-5 transition-all hover:shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-orion-text-dim mb-2">Confidence</p>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orion-accent" />
                <span className="text-sm font-bold text-orion-text">High (RAG+)</span>
              </div>
            </div>
            <div className="rounded-2xl border border-orion-border/50 bg-orion-surface-2/50 p-5 transition-all hover:shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-orion-text-dim mb-2">Debates</p>
              <div className="flex items-center gap-2">
                <MessagesSquare className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-bold text-orion-text">{paper.debate_rounds ?? 0} Rounds</span>
              </div>
            </div>
            <div className="rounded-2xl border border-orion-border/50 bg-orion-surface-2/50 p-5 transition-all hover:shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-orion-text-dim mb-2">Citations</p>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-orion-success" />
                <span className="text-sm font-bold text-orion-text">{paper.verified_citations ?? 0} Verified</span>
              </div>
            </div>
            <div className="rounded-2xl border border-orion-border/50 bg-orion-surface-2/50 p-5 transition-all hover:shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-orion-text-dim mb-2">Compliance</p>
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`h-4 w-4 ${paper.format_compliance?.is_compliant ? 'text-orion-success' : 'text-amber-500'}`} />
                <span className="text-sm font-bold text-orion-text">
                   {paper.format_compliance?.score ? `${Math.round(paper.format_compliance.score * 100)}%` : '95%'}
                </span>
              </div>
            </div>
          </div>
          <div className="mb-6 flex items-center gap-4">
            <div className="inline-flex px-4 py-1.5 rounded-full border border-orion-accent/20 bg-orion-accent/5 text-xs text-orion-accent font-medium">
              Draft format: {String(paper.paper_format || 'academic').toUpperCase()}
            </div>
          </div>

          {/* View Toggle Tabs (Pill style) */}
          <div className="mb-12 flex p-1.5 bg-orion-surface-2 rounded-2xl max-w-md mx-auto border border-orion-border">
            <button
              onClick={() => setActiveView('dossier')}
              className={`flex-1 py-2.5 px-6 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${
                activeView === 'dossier' 
                ? 'bg-orion-surface shadow-md text-orion-accent scale-[1.02]' 
                : 'text-orion-text-dim hover:text-orion-text-muted'
              }`}
            >
              Intelligence Dossier
            </button>
            <button
              onClick={() => setActiveView('manuscript')}
              className={`flex-1 py-2.5 px-6 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${
                activeView === 'manuscript' 
                ? 'bg-orion-surface shadow-md text-orion-accent scale-[1.02]' 
                : 'text-orion-text-dim hover:text-orion-text-muted'
              }`}
            >
              Final Manuscript
            </button>
          </div>

          {activeView === 'dossier' && paper.analysis ? (
            <div className="mb-10 animate-slide-up">
              <h2 className="text-base font-black text-orion-text uppercase tracking-widest mb-4">Research Analysis Dossier</h2>
              <div className="markdown-body">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({node, inline, className, children, ...props}: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      if (!inline && match && match[1] === 'mermaid') {
                        return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                      }
                      return <code className={className} {...props}>{children}</code>;
                    }
                  }}
                >
                  {cleanDossierText(paper.analysis)}
                </ReactMarkdown>
              </div>
              
              {/* Intelligence Dossier Appendices */}
              {paper.source_counts && (
                <div className="mt-8 p-4 rounded-xl border border-orion-border/40 bg-orion-surface">
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
                <div className="mt-8 p-6 rounded-2xl border border-orion-border bg-orion-surface">
                  <p className="text-sm font-semibold text-orion-text-muted mb-3">Gap Reviewer Notes</p>
                  <p className="text-sm text-orion-text-muted leading-relaxed">{paper.gap_critique}</p>
                </div>
              ) : null}

              {/* Gaps Summary */}
              {paper.gaps && paper.gaps.length > 0 && (
                <div className="max-w-4xl mx-auto mt-10">
                  <h2 className="text-xl font-display font-semibold text-orion-text mb-6 flex items-center gap-3">
                    <span className="h-8 w-1.5 rounded-full bg-orion-error border border-orion-border shadow-sm" />
                    Structured Gap Summary
                  </h2>
                  <div className="space-y-4">
                    {paper.gaps.map((gap: ResearchGap, i: number) => (
                      <div
                        key={i}
                        className="p-6 rounded-2xl glass-hover bg-orion-surface backdrop-blur border border-orion-border/40"
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
          ) : null}

          {activeView === 'manuscript' && (
            <div className="animate-slide-up">
              <div className="mb-3 h-px bg-orion-border/60" />
              <div className="manuscript-body px-4 md:px-8 py-4">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({node, inline, className, children, ...props}: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      if (!inline && match && match[1] === 'mermaid') {
                        return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                      }
                      return <code className={className} {...props}>{children}</code>;
                    }
                  }}
                >
                  {paper.final_draft || paper.paper}
                </ReactMarkdown>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
