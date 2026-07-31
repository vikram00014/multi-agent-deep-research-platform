# Changelog

All notable changes to ORION are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Prior to 2026-07-28 this project had no changelog. The entries below are reconstructed from git
history and are therefore coarse; entries from here on should be written as changes land.

## [Unreleased]

### Changed
- **LLM provider migrated from Google Vertex AI (Gemini) to the Anthropic Messages API.**
  `llm_client.py` is now `AnthropicClient`: `POST {base}/messages`, block-based response
  parsing that skips `thinking` blocks, and `x-api-key` auth with an automatic fallback to
  `Authorization: Bearer`. Config keys `VERTEX_API_KEY`/`VERTEX_BASE_URL`/`VERTEX_MODEL` are
  replaced by `LLM_API_KEY`/`LLM_BASE_URL`/`LLM_MODEL` (defaults: the Aerolink gateway and
  `claude-sonnet-5`). The `gemini_client` singleton is renamed `llm_client`.
- **Image generation removed.** The Anthropic API has no image endpoint, so `generate_image`
  returns `""` and the paper prompt no longer requests `[IMAGE_PROMPT]` tokens. Figures render
  as `> Figure concept: …` captions. The substitution handler remains as a safety net.

### Fixed
- Removed hardcoded topic-specific ranking hacks: a biology-term penalty list and an
  urban/smart-city term list in relevance scoring, plus a legal/transformer/mechanistic
  whitelist in the planner prompt. These silently mis-ranked whole research domains. Relevance
  now applies a domain-neutral penalty when a paper's title shares no tokens with the topic.
- `paper_summaries` fallback keys use a SHA-1 digest instead of `abs(hash(title))`, which was
  not stable across processes under default `PYTHONHASHSEED`.
- Failed critic rounds emit `[CRITIC-FAILED]` and no longer consume the debate budget, while
  still bounding total attempts so a sustained LLM outage cannot loop forever.
- Debounced session-store writes are now cleaned up, and `flush_pending_persists()` forces a
  final write on shutdown so in-flight state is not lost.
- The Crossref `User-Agent` placeholder `orion@example.com` is now the optional
  `CROSSREF_CONTACT_EMAIL` setting, omitted entirely when blank.

### Added
- Permanent documentation set under `docs/`: `architecture.md`, `api.md`, `database.md`,
  `ui.md`, `deployment.md`
- `PROJECT_STATUS.md` — session handoff, feature inventory, technical-debt register, and a
  prioritized roadmap
- This changelog

### Changed
- `CLAUDE.md` corrected to describe the current three-view frontend rather than the removed
  five-tab layout, and to list the six retrieval sources actually implemented
- `README.md` slimmed to an overview, quick start, and index into `docs/`, removing setup and
  endpoint content that now lives in the docs set
- `@types/react` and `@types/react-dom` moved from `dependencies` to `devDependencies`
- Added a `typecheck` script to the frontend

### Removed
Dead code with zero call sites, each verified by grep before deletion. Backend imports and
boots cleanly; frontend builds with zero TypeScript errors.

- Files: `backend/app/api/dependencies.py` (no route used `Depends`), `frontend/fix_app.py`
  (one-off codemod with a hardcoded absolute path, already non-functional)
- Backend: `GAP_ANALYSIS_PROMPT`, `_normalize_gaps`, `VectorStoreService.has_document`,
  `Settings.stream_generate_url`, `ResearchState.human_feedback`, the unused import-time
  `research_graph`, and a byte-identical duplicate of `_debate_snippet` in `research.py`
- Frontend: eight unused `api.ts` functions (`startResearch`, `getBaseUrl`, `health`,
  `exportBundle`, `listSessionResources`, `resourceDownloadUrl`, `getResearchChat`,
  `sendResearchChat`); the `PaperFound`, `ChatMessage`, and `StartResearchResponse` types;
  `FeedItem.icon` and the dead `getIcon` heuristic in `useWebSocket`
- Dependencies: `class-variance-authority`, `clsx`, `tailwind-merge` — declared but never
  imported
- Untracked `backend/orion_sessions.json` and `backend/chroma_data/chroma.sqlite3` from git
  (kept on disk); they matched `.gitignore` but were tracked from the initial commit
- Documentation: `PROJECT_DETAILED_EXPLANATION.md` (described the removed components, the
  Analytics tab, and only three retrieval sources) and `RUN_COMMANDS.md` (duplicated the README
  quick start)
- `project_report.pdf` (1.8 MB build artifact) and `project_report.tex` — an academic
  deliverable rather than project documentation — along with the six `ss/screenshot_*.png`
  files that only that report referenced

### Uncommitted in the working tree
- Frontend simplified from a five-tab workspace to a linear `idle → running → done` flow;
  `ResearchChatFloating.tsx` and `VisualInsights.tsx` removed. Build passes.
- Changes to `backend/app/api/routes/research.py` and `backend/app/services/pdf_export.py`

## [0.1.0] — prior work

### `6d4bac6` — Fix audit issues and make paper drafting produce complete papers
- Paper architect reworked to emit a complete publication-style draft, with a dedicated retry
  pass when the first attempt does not look like a real paper
- Separate output artifacts: `analysis.md` (dossier), `final_draft.md` (draft), `paper.md`
  (combined, for compatibility)

### `df43f30` — Update project
- Broad iteration across pipeline, API, and frontend

### `b488ee4` — Initial commit
- FastAPI + LangGraph backend with the 8-node research pipeline
- React + Vite frontend with live WebSocket feed
- Multi-source retrieval, ChromaDB vector store, PDF upload, session persistence
