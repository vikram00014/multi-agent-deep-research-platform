import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, Download, FileText } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { api } from '../api';
import type { PaperResult } from '../types';
import { Mermaid } from './Mermaid';

interface PaperViewerProps {
  sessionId: string | null;
  isComplete: boolean;
}

function extractHeadings(markdown: string) {
  return markdown
    .split('\n')
    .map((line) => line.match(/^#{1,3}\s+(.+)$/)?.[1]?.trim())
    .filter((line): line is string => Boolean(line))
    .slice(0, 12);
}

export function PaperViewer({ sessionId, isComplete }: PaperViewerProps) {
  const reduceMotion = useReducedMotion();
  const [paper, setPaper] = useState<PaperResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !isComplete) return;
    setLoading(true);
    setError(null);
    api.getPaper(sessionId)
      .then(setPaper)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load paper'))
      .finally(() => setLoading(false));
  }, [sessionId, isComplete]);

  const manuscript = paper?.final_draft || paper?.paper || '';
  const headings = useMemo(() => extractHeadings(manuscript), [manuscript]);

  const markdownComponents: Components = {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      if (match?.[1] === 'mermaid') {
        return <Mermaid chart={String(children).replace(/\n$/, '')} />;
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
  };

  const handleCopy = async () => {
    if (!manuscript) return;
    await navigator.clipboard.writeText(manuscript);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadPdf = () => {
    if (!sessionId) return;
    setDownloading(true);
    const anchor = document.createElement('a');
    anchor.href = api.paperPdfDownloadUrl(sessionId);
    anchor.download = `delve-paper-${sessionId.slice(0, 8)}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => setDownloading(false), 1200);
  };

  if (!sessionId || (!isComplete && !loading)) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <FileText className="mx-auto mb-4 h-8 w-8 text-ink-mute" />
          <p className="text-sm font-medium text-ink-soft">The paper will appear here when the run completes.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-ink-mute">
        Loading paper...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="rounded-card border border-err bg-err/10 px-4 py-3 text-sm text-err">
          {error}
        </div>
      </div>
    );
  }

  if (!paper || !manuscript.trim()) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-ink-mute">
        No manuscript text was returned for this session.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-8">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-8 flex items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <p className="mono-kicker mb-2">Final paper</p>
            <div className="flex flex-wrap gap-2 text-xs text-ink-mute">
              <span className="rounded-card border border-line px-2 py-1 font-mono uppercase tracking-[0.12em]">
                {String(paper.paper_format || 'academic')}
              </span>
              <span className="rounded-card border border-line px-2 py-1">
                {paper.verified_citations ?? paper.bibliography?.length ?? 0} verified sources
              </span>
              <span className="rounded-card border border-line px-2 py-1">
                {paper.debate_rounds ?? 0} debate rounds
              </span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={handleCopy} className="control-button">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" onClick={handleDownloadPdf} className="control-button control-button-primary">
              <Download className="h-3.5 w-3.5" />
              {downloading ? 'Preparing' : 'PDF'}
            </button>
          </div>
        </div>

        <div className="grid gap-10 xl:grid-cols-[1fr_220px]">
          <motion.article
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="paper-body mx-auto w-full"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {manuscript}
            </ReactMarkdown>
          </motion.article>

          <aside className="hidden xl:block">
            <div className="sticky top-8 border-l border-line pl-4">
              <p className="mono-kicker mb-3">Contents</p>
              <div className="space-y-2">
                {headings.length > 0 ? headings.map((heading) => (
                  <p key={heading} className="line-clamp-2 text-xs leading-5 text-ink-mute">
                    {heading}
                  </p>
                )) : (
                  <p className="text-xs text-ink-mute">No headings detected.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
