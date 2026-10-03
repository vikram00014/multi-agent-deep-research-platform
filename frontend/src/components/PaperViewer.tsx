import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, Download, FileText, Sparkles, BookOpen, ArrowUp } from 'lucide-react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { api } from '../api';
import type { PaperResult } from '../types';

interface PaperViewerProps {
  sessionId: string | null;
  isComplete: boolean;
  paper?: PaperResult | null;
}

function extractHeadings(markdown: string) {
  return markdown
    .split('\n')
    .map((line) => {
      const match = line.match(/^(#{1,3})\s+(.+)$/);
      if (!match) return null;
      return {
        level: match[1].length,
        text: match[2].trim().replace(/\*\*/g, ''),
        id: match[2].trim().toLowerCase().replace(/[^\w]+/g, '-'),
      };
    })
    .filter((h): h is { level: number; text: string; id: string } => Boolean(h))
    .slice(0, 24);
}

export function PaperViewer({ sessionId, isComplete, paper: paperProp }: PaperViewerProps) {
  const reduceMotion = useReducedMotion();
  const [paper, setPaper] = useState<PaperResult | null>(paperProp ?? null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeHeadingId, setActiveHeadingId] = useState<string>('');

  useEffect(() => {
    if (paperProp) {
      setPaper(paperProp);
      return;
    }
    if (!sessionId || !isComplete) return;
    setLoading(true);
    setError(null);
    api.getPaper(sessionId)
      .then(setPaper)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load paper'))
      .finally(() => setLoading(false));
  }, [sessionId, isComplete, paperProp]);

  const manuscript = paper?.final_draft || paper?.paper || '';
  const headings = useMemo(() => extractHeadings(manuscript), [manuscript]);

  const handleCopy = async () => {
    if (!manuscript) return;
    await navigator.clipboard.writeText(manuscript);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadPdf = async () => {
    if (!sessionId) return;
    setDownloading(true);
    try {
      const blob = await api.downloadPaperPdf(sessionId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'delve-research-paper.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const scrollToHeading = (id: string) => {
    setActiveHeadingId(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const scrollToTop = () => {
    const container = document.getElementById('paper-scroll-container');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const markdownComponents: Components = {
    h1({ children, ...props }) {
      const text = String(children).replace(/<[^>]*>/g, '');
      const id = text.trim().toLowerCase().replace(/[^\w]+/g, '-');
      return <h1 id={id} {...props}>{children}</h1>;
    },
    h2({ children, ...props }) {
      const text = String(children).replace(/<[^>]*>/g, '');
      const id = text.trim().toLowerCase().replace(/[^\w]+/g, '-');
      return <h2 id={id} {...props}>{children}</h2>;
    },
    h3({ children, ...props }) {
      const text = String(children).replace(/<[^>]*>/g, '');
      const id = text.trim().toLowerCase().replace(/[^\w]+/g, '-');
      return <h3 id={id} {...props}>{children}</h3>;
    },
    code({ className, children, ...props }) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
  };

  if (!sessionId || (!isComplete && !loading)) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <FileText className="mx-auto mb-4 h-8 w-8 opacity-40" style={{ color: 'var(--color-ink-mute)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--color-ink-soft)' }}>
            The research manuscript will render here when generation completes.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="text-center space-y-3">
          <div className="loading-dots mx-auto"><span/><span/><span/></div>
          <p className="text-xs" style={{ color: 'var(--color-ink-mute)' }}>Rendering manuscript...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="rounded-xl border border-err bg-err/10 px-5 py-4 text-xs text-err max-w-md">
          <p className="font-semibold mb-1">Failed to load paper</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!paper || !manuscript.trim()) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-xs" style={{ color: 'var(--color-ink-mute)' }}>
        No manuscript text was returned for this session.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Top Bar: Metadata & Actions ── */}
      <div 
        className="shrink-0 px-4 sm:px-8 py-3.5 bg-surface/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b"
        style={{ borderColor: 'var(--color-line)' }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="badge badge-blue">
            {String(paper.paper_format || 'IEEE').toUpperCase()} Standard
          </span>
          <span className="badge badge-pink">
            {paper.verified_citations ?? paper.bibliography?.length ?? 0} Citations Verified
          </span>
          <span className="badge badge-green">
            Peer-Debated ({paper.debate_rounds ?? 2} Rounds)
          </span>
        </div>

        <div className="flex shrink-0 gap-2 items-center">
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button" 
            onClick={handleCopy} 
            className="control-button text-xs font-semibold"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Markdown'}</span>
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button" 
            onClick={handleDownloadPdf} 
            className="control-button control-button-primary text-xs font-semibold"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{downloading ? 'Exporting PDF…' : 'Download PDF'}</span>
          </motion.button>
        </div>
      </div>

      {/* ── Main 1-Block Scrollable Workspace ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Manuscript Reader Scrollable Container */}
        <div id="paper-scroll-container" className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-12 py-6 sm:py-8">
          <div className="mx-auto max-w-[880px]">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="card p-6 sm:p-10 md:p-14 shadow-lg"
              style={{ background: 'var(--color-surface)' }}
            >
              <article className="paper-body mx-auto w-full">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {manuscript}
                </ReactMarkdown>
              </article>
            </motion.div>
          </div>
        </div>

        {/* Table of Contents Right Panel (Docked at the top right) */}
        {headings.length > 0 && (
          <aside
            className="w-72 shrink-0 border-l overflow-hidden hidden xl:flex flex-col bg-surface/40"
            style={{ borderColor: 'var(--color-line)' }}
          >
            <div className="flex items-center justify-between gap-1.5 p-4 border-b shrink-0" style={{ borderColor: 'var(--color-line)' }}>
              <div className="flex items-center gap-1.5">
                <BookOpen size={13} color="var(--color-blue)" />
                <p className="mono-kicker text-[10px]">Table of Contents</p>
              </div>
              <button
                type="button"
                onClick={scrollToTop}
                className="text-[11px] font-semibold hover:underline flex items-center gap-0.5"
                style={{ color: 'var(--color-blue)' }}
              >
                <ArrowUp size={10} /> Top
              </button>
            </div>

            <nav className="p-3 space-y-1 flex-1 overflow-y-auto" aria-label="Table of Contents">
              {headings.map((h) => {
                const isSelected = activeHeadingId === h.id;
                return (
                  <button
                    key={h.id}
                    onClick={() => scrollToHeading(h.id)}
                    className="block text-left text-xs leading-snug transition-all rounded-lg px-2.5 py-1.5 w-full truncate"
                    style={{
                      paddingLeft: h.level === 2 ? '1rem' : h.level === 3 ? '1.5rem' : '0.5rem',
                      color: isSelected ? 'var(--color-blue)' : 'var(--color-ink-soft)',
                      background: isSelected ? 'rgba(79,70,229,0.09)' : 'transparent',
                      fontWeight: h.level === 1 ? 700 : h.level === 2 ? 600 : 400,
                    }}
                  >
                    {h.text}
                  </button>
                );
              })}
            </nav>
          </aside>
        )}
      </div>
    </div>
  );
}
