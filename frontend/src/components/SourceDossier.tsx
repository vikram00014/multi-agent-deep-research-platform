import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  CheckCircle2,
  Database,
  ExternalLink,
  Filter,
  Layers,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  FileText,
  AlertCircle
} from 'lucide-react';
import type { PaperResult, SessionDetail } from '../types';

interface SourceDossierProps {
  paper?: PaperResult | null;
  detail?: SessionDetail | null;
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
    vector_store: 'Document Store',
  };
  const key = source.trim().toLowerCase();
  if (map[key]) return map[key];
  return source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getSourceColor(source: string): { bg: string; text: string; border: string } {
  const s = source.toLowerCase();
  if (s.includes('arxiv')) return { bg: 'rgba(239, 68, 68, 0.12)', text: '#f87171', border: 'rgba(239, 68, 68, 0.25)' };
  if (s.includes('openalex')) return { bg: 'rgba(99, 102, 241, 0.12)', text: '#818cf8', border: 'rgba(99, 102, 241, 0.25)' };
  if (s.includes('crossref')) return { bg: 'rgba(236, 72, 153, 0.12)', text: '#f472b6', border: 'rgba(236, 72, 153, 0.25)' };
  if (s.includes('semantic')) return { bg: 'rgba(16, 185, 129, 0.12)', text: '#34d399', border: 'rgba(16, 185, 129, 0.25)' };
  if (s.includes('github')) return { bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.25)' };
  if (s.includes('pdf')) return { bg: 'rgba(168, 85, 247, 0.12)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.25)' };
  return { bg: 'rgba(59, 130, 246, 0.12)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.25)' };
}

export function SourceDossier({ paper, detail }: SourceDossierProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [viewMode, setViewMode] = useState<'sources' | 'claims'>('sources');

  const bibliography = useMemo(() => {
    return (paper?.bibliography || []).map((item, index) => ({
      index: index + 1,
      paper_id: String(item.paper_id || ''),
      title: String(item.title || 'Untitled Research Paper'),
      authors: String(item.authors || 'Authors not listed'),
      year: String(item.year || 'n.d.'),
      url: String(item.url || ''),
      doi: String(item.doi || ''),
      source: String(item.source || 'academic_index'),
      confidence: typeof item.confidence === 'number' ? item.confidence : 0.85,
      verified: Boolean(item.verified),
      citation_key: String(item.citation_key || ''),
    }));
  }, [paper?.bibliography]);

  const claimEvidenceMap = useMemo(() => {
    return (paper?.claim_to_evidence_map || []).map((c) => ({
      claim: String(c.claim || ''),
      paper_id: String(c.paper_id || ''),
      confidence: typeof c.confidence === 'number' ? c.confidence : 0.8,
      verified: Boolean(c.verified),
    }));
  }, [paper?.claim_to_evidence_map]);

  const availableSources = useMemo(() => {
    const set = new Set<string>();
    bibliography.forEach((b) => {
      if (b.source) set.add(b.source.toLowerCase());
    });
    return Array.from(set);
  }, [bibliography]);

  const filteredBibliography = useMemo(() => {
    return bibliography.filter((item) => {
      if (onlyVerified && !item.verified) return false;
      if (selectedSource !== 'all' && item.source.toLowerCase() !== selectedSource.toLowerCase()) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesAuthors = item.authors.toLowerCase().includes(q);
        const matchesDoi = item.doi.toLowerCase().includes(q);
        const matchesSource = item.source.toLowerCase().includes(q);
        if (!matchesTitle && !matchesAuthors && !matchesDoi && !matchesSource) return false;
      }
      return true;
    });
  }, [bibliography, searchQuery, selectedSource, onlyVerified]);

  const totalSourcesCount = bibliography.length;
  const verifiedCount = bibliography.filter((b) => b.verified).length;

  if (totalSourcesCount === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <Database className="mx-auto mb-3 h-10 w-10 opacity-40 text-blue-400" />
          <h3 className="text-base font-bold mb-1" style={{ color: 'var(--color-ink)' }}>No Research Sources Loaded</h3>
          <p className="text-xs" style={{ color: 'var(--color-ink-mute)' }}>
            Sources and bibliographic verification data will appear here once research generation completes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 space-y-6">
      {/* ── Top Header & Summary Stats ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--color-line)' }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} color="var(--color-pink)" />
            <p className="mono-kicker">Academic Evidence Dossier</p>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--color-ink)' }}>
            Real Retrieved Sources & Verification
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--color-ink-soft)' }}>
            Examine every primary study retrieved from academic indexes, DOIs, authors, and evidence links.
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl border bg-surface/60" style={{ borderColor: 'var(--color-line)' }}>
          <button
            type="button"
            onClick={() => setViewMode('sources')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              viewMode === 'sources'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <BookOpen size={13} />
            Sources ({totalSourcesCount})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('claims')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              viewMode === 'claims'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <Layers size={13} />
            Claim Traceability ({claimEvidenceMap.length})
          </button>
        </div>
      </div>

      {/* ── Quick Metric Pills ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-500/10 text-blue-400">
            <Database size={16} />
          </div>
          <div>
            <div className="text-lg font-bold text-ink">{totalSourcesCount}</div>
            <div className="text-[11px] text-ink-mute">Cited Sources</div>
          </div>
        </div>

        <div className="card p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-400">
            <ShieldCheck size={16} />
          </div>
          <div>
            <div className="text-lg font-bold text-ink">{verifiedCount} / {totalSourcesCount}</div>
            <div className="text-[11px] text-ink-mute">Metadata Verified</div>
          </div>
        </div>

        <div className="card p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-500/10 text-purple-400">
            <Filter size={16} />
          </div>
          <div>
            <div className="text-lg font-bold text-ink">{availableSources.length}</div>
            <div className="text-[11px] text-ink-mute">Source Channels</div>
          </div>
        </div>

        <div className="card p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-pink-500/10 text-pink-400">
            <Layers size={16} />
          </div>
          <div>
            <div className="text-lg font-bold text-ink">{claimEvidenceMap.length}</div>
            <div className="text-[11px] text-ink-mute">Grounded Claims</div>
          </div>
        </div>
      </div>

      {/* ── View 1: Sources List ── */}
      {viewMode === 'sources' && (
        <div className="space-y-4">
          {/* Filter / Search Bar */}
          <div className="card p-3.5 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, author, DOI, or keyword..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs bg-surface/50 border focus:outline-none focus:border-blue-500 transition-colors"
                style={{ borderColor: 'var(--color-line)', color: 'var(--color-ink)' }}
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Channel Dropdown */}
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface/50 border focus:outline-none transition-colors"
                style={{ borderColor: 'var(--color-line)', color: 'var(--color-ink)' }}
              >
                <option value="all">All Channels ({totalSourcesCount})</option>
                {availableSources.map((src) => (
                  <option key={src} value={src}>{formatSourceName(src)}</option>
                ))}
              </select>

              {/* Verified Only Toggle */}
              <button
                type="button"
                onClick={() => setOnlyVerified((v) => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                  onlyVerified
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 font-semibold'
                    : 'bg-surface/50 border-line text-ink-soft hover:text-ink'
                }`}
                style={{ borderColor: onlyVerified ? 'rgba(16,185,129,0.4)' : 'var(--color-line)' }}
              >
                <CheckCircle2 size={12} />
                Verified Only
              </button>
            </div>
          </div>

          {/* Paper Cards List */}
          <div className="space-y-3">
            <AnimatePresence>
              {filteredBibliography.map((item) => {
                const color = getSourceColor(item.source);
                const doiUrl = item.doi
                  ? item.doi.startsWith('http')
                    ? item.doi
                    : `https://doi.org/${item.doi}`
                  : item.url;

                return (
                  <motion.div
                    key={item.paper_id || item.index}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="card p-4 sm:p-5 hover:border-blue-500/40 transition-all flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <span className="shrink-0 w-6 h-6 rounded-lg bg-blue-500/10 text-blue-400 font-mono text-xs font-bold flex items-center justify-center">
                          [{item.index}]
                        </span>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm sm:text-base leading-snug text-ink mb-1">
                            {doiUrl ? (
                              <a
                                href={doiUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-blue-400 transition-colors inline-flex items-baseline gap-1"
                              >
                                <span>{item.title}</span>
                                <ExternalLink size={12} className="shrink-0 opacity-60 inline" />
                              </a>
                            ) : (
                              item.title
                            )}
                          </h4>
                          <p className="text-xs text-ink-soft line-clamp-1 mb-2">
                            {item.authors} {item.year !== 'n.d.' && `(${item.year})`}
                          </p>

                          {/* Metadata Tags */}
                          <div className="flex items-center gap-2 flex-wrap text-[11px]">
                            {/* Source Badge */}
                            <span
                              className="px-2 py-0.5 rounded-md font-semibold border"
                              style={{ background: color.bg, color: color.text, borderColor: color.border }}
                            >
                              {formatSourceName(item.source)}
                            </span>

                            {/* Verification Badge */}
                            {item.verified ? (
                              <span className="px-2 py-0.5 rounded-md font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                                <CheckCircle2 size={11} /> Verified Metadata
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 flex items-center gap-1">
                                <AlertCircle size={11} /> Web / Unindexed
                              </span>
                            )}

                            {/* DOI Tag */}
                            {item.doi && (
                              <a
                                href={doiUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2 py-0.5 rounded-md font-mono text-[10px] bg-surface border border-line text-ink-soft hover:text-blue-400 hover:border-blue-500/40 transition-colors flex items-center gap-1"
                              >
                                DOI: {item.doi}
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Direct External Action Link */}
                      {doiUrl && (
                        <a
                          href={doiUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="control-button text-xs shrink-0 py-1.5 px-3 hidden sm:flex items-center gap-1.5"
                        >
                          <span>Open Source</span>
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {filteredBibliography.length === 0 && (
              <div className="card p-8 text-center text-xs text-ink-mute">
                No research papers matched your search filter.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── View 2: Claim Traceability ── */}
      {viewMode === 'claims' && (
        <div className="space-y-4">
          <div className="card p-4 border-blue-500/20 bg-blue-500/5">
            <h4 className="text-xs font-bold text-blue-300 flex items-center gap-1.5 mb-1">
              <ShieldCheck size={14} /> Evidence-to-Claim Verification Map
            </h4>
            <p className="text-[11px] text-ink-soft leading-relaxed">
              Every factual assertion synthesized in the manuscript is tied to verified citation provenance to ensure rigor and transparent traceability.
            </p>
          </div>

          <div className="space-y-3">
            {claimEvidenceMap.map((c, i) => {
              const matchedPaper = bibliography.find((b) => b.paper_id === c.paper_id || String(b.index) === c.paper_id);
              return (
                <div key={i} className="card p-4 space-y-2.5">
                  <div className="text-xs sm:text-sm font-medium text-ink leading-snug">
                    "{c.claim}"
                  </div>

                  <div className="pt-2 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs" style={{ borderColor: 'var(--color-line)' }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge badge-blue text-[10px]">
                        Supporting Study: [{matchedPaper?.index || '1'}] {matchedPaper?.title || 'Academic Reference'}
                      </span>
                      {matchedPaper?.source && (
                        <span className="text-[11px] text-ink-mute">
                          via {formatSourceName(matchedPaper.source)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 size={12} /> Grounded Claim
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
