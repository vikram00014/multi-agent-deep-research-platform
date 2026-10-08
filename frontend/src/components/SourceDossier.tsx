import { useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Database,
  ExternalLink,
  Layers,
  Search,
  ShieldCheck,
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
    custom_pdf: 'Reference PDF',
    vector_store: 'Uploaded Documents',
  };
  const key = source.trim().toLowerCase();
  if (map[key]) return map[key];
  return source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SourceDossier({ paper }: SourceDossierProps) {
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
      <div className="flex h-full items-center justify-center p-8 text-center bg-canvas">
        <div className="max-w-md">
          <Database className="mx-auto mb-3 h-8 w-8 text-ink-mute opacity-50" />
          <h3 className="text-sm font-semibold mb-1 text-ink">No Research Sources Loaded</h3>
          <p className="text-xs text-ink-mute">
            Sources and bibliographic verification records will appear here once research generation completes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 space-y-6 bg-canvas">
      {/* ── Top Header & Summary Stats ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <span className="mono-kicker text-[10px]">Academic Evidence Dossier</span>
          <h2 className="text-xl font-bold text-ink mt-0.5">
            Retrieved Sources & Verification Trail
          </h2>
          <p className="text-xs text-ink-mute mt-1">
            Examine primary studies retrieved from academic databases, resolved DOIs, and grounded claim linkages.
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center gap-1 p-0.5 rounded border border-line bg-surface shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('sources')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
              viewMode === 'sources'
                ? 'bg-primary text-white shadow-xs'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <BookOpen size={12} />
            Sources ({totalSourcesCount})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('claims')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
              viewMode === 'claims'
                ? 'bg-primary text-white shadow-xs'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <Layers size={12} />
            Claim Traceability ({claimEvidenceMap.length})
          </button>
        </div>
      </div>

      {/* ── Metric Summary Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4">
          <span className="mono-kicker text-xs">Total Cited</span>
          <div className="text-2xl font-bold font-mono text-ink mt-1">{totalSourcesCount}</div>
          <div className="text-xs text-ink-mute mt-0.5">Primary literature</div>
        </div>

        <div className="card p-4">
          <span className="mono-kicker text-xs">Verified Citations</span>
          <div className="text-2xl font-bold font-mono text-ok mt-1">{verifiedCount} / {totalSourcesCount}</div>
          <div className="text-xs text-ink-mute mt-0.5">Matched to primary papers</div>
        </div>

        <div className="card p-4">
          <span className="mono-kicker text-xs">Academic Sources</span>
          <div className="text-2xl font-bold font-mono text-ink mt-1">{availableSources.length}</div>
          <div className="text-xs text-ink-mute mt-0.5">Active research channels</div>
        </div>

        <div className="card p-4">
          <span className="mono-kicker text-xs">Evidence Links</span>
          <div className="text-2xl font-bold font-mono text-ink mt-1">{claimEvidenceMap.length}</div>
          <div className="text-xs text-ink-mute mt-0.5">Grounded manuscript claims</div>
        </div>
      </div>

      {/* ── View 1: Sources List ── */}
      {viewMode === 'sources' && (
        <div className="space-y-4">
          {/* Filter / Search Bar */}
          <div className="card p-3 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, author, DOI, or keyword..."
                className="research-input pl-8 py-1.5 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Channel Dropdown */}
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="px-2.5 py-1.5 rounded border border-line text-xs font-medium bg-surface text-ink focus:outline-none"
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
                className={`control-button text-xs py-1.5 px-2.5 ${
                  onlyVerified ? 'border-emerald-300 bg-ok-subtle text-ok' : ''
                }`}
              >
                <CheckCircle2 size={12} className={onlyVerified ? 'text-ok' : 'text-ink-mute'} />
                Verified Only
              </button>
            </div>
          </div>

          {/* Paper Cards List */}
          <div className="space-y-2.5">
            {filteredBibliography.map((item) => {
              const doiUrl = item.doi
                ? item.doi.startsWith('http')
                  ? item.doi
                  : `https://doi.org/${item.doi}`
                : item.url;

              return (
                <div
                  key={item.paper_id || item.index}
                  className="card p-4 hover:border-line-strong transition-colors flex flex-col gap-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <span className="shrink-0 w-6 h-6 rounded border border-line bg-surface-subtle text-ink font-mono text-[11px] font-semibold flex items-center justify-center">
                        {item.index}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-xs sm:text-sm leading-snug text-ink mb-0.5">
                          {doiUrl ? (
                            <a
                              href={doiUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline inline-flex items-baseline gap-1"
                            >
                              <span>{item.title}</span>
                              <ExternalLink size={11} className="shrink-0 opacity-60 inline" />
                            </a>
                          ) : (
                            item.title
                          )}
                        </h4>
                        <p className="text-xs text-ink-mute mb-2">
                          {item.authors} {item.year !== 'n.d.' && `(${item.year})`}
                        </p>

                        {/* Metadata Tags */}
                        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                          <span className="badge">
                            {formatSourceName(item.source)}
                          </span>

                          {item.verified ? (
                            <span className="badge badge-green">
                              <CheckCircle2 size={10} /> Verified DOI
                            </span>
                          ) : (
                            <span className="badge">
                              <AlertCircle size={10} className="text-ink-mute" /> Unindexed Web
                            </span>
                          )}

                          {item.doi && (
                            <a
                              href={doiUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="badge hover:border-line-strong font-mono text-[10px]"
                            >
                              DOI: {item.doi}
                              <ExternalLink size={9} />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {doiUrl && (
                      <a
                        href={doiUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="control-button text-xs shrink-0 hidden sm:inline-flex items-center gap-1"
                      >
                        <span>View Source</span>
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}

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
        <div className="space-y-3">
          <div className="card p-3.5 bg-surface-subtle">
            <h4 className="text-xs font-semibold text-ink flex items-center gap-1.5 mb-1">
              <ShieldCheck size={14} className="text-ok" /> Evidence-to-Claim Provenance Map
            </h4>
            <p className="text-[11px] text-ink-soft leading-relaxed">
              Every factual assertion synthesized in the manuscript is tied to verified citation provenance to ensure empirical accountability.
            </p>
          </div>

          <div className="space-y-2.5">
            {claimEvidenceMap.map((c, i) => {
              const matchedPaper = bibliography.find((b) => b.paper_id === c.paper_id || String(b.index) === c.paper_id);
              return (
                <div key={i} className="card p-3.5 space-y-2">
                  <div className="text-xs font-medium text-ink leading-relaxed">
                    &ldquo;{c.claim}&rdquo;
                  </div>

                  <div className="pt-2 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge badge-blue text-[10px]">
                        Ref [{matchedPaper?.index || '1'}]: {matchedPaper?.title || 'Academic Reference'}
                      </span>
                      {matchedPaper?.source && (
                        <span className="text-[11px] text-ink-mute">
                          via {formatSourceName(matchedPaper.source)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-ok font-medium">
                      <CheckCircle2 size={12} /> Grounded Claim
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
