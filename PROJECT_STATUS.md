# Project status

**Last updated:** 2026-07-28
**Branch:** `fix/audit-and-paper-quality`
**Working tree:** dirty — a frontend rewrite is uncommitted (see below)

This file is the session handoff between conversations. Update it at the end of any session
that changes project state. `CLAUDE.md` holds permanent facts; this file holds current state.

---

## 1. Where the project is right now

Delve is a **working end-to-end prototype**. The full 8-stage pipeline runs, streams live
progress over WebSocket, and produces a formatted paper with a bibliography, gap analysis, and
downloadable artifacts. Both halves build clean:

- `python -m compileall backend/app` — passes
- `cd frontend && npm run build` — passes, zero TypeScript errors

It is **not deployable beyond a single local user**. No auth, no rate limiting, single-process
only, and the API key travels in a URL query string.

### Uncommitted work in progress

The working tree contains a substantial **frontend simplification** that has not been committed:

- Deleted `ResearchChatFloating.tsx` and `VisualInsights.tsx`
- Modified `App.tsx`, `PaperViewer.tsx`, `ResearchFeed.tsx`, `Sidebar.tsx`, `index.css`,
  `index.html`
- The five-tab workspace (New Research / Feed / Paper / Analytics / Resources) became a
  three-state linear flow (`idle → running → done`)
- Also modified: `backend/app/api/routes/research.py`, `backend/app/services/pdf_export.py`

**The deletions are clean** — no source file references either removed component, and the build
passes. What went stale is documentation, which this docs pass has now corrected.

The `ss/` screenshot directory and the two tracked runtime state files have since been removed
or untracked — see §4a.

---

## 2. Completed features

**Pipeline**
- 8-node LangGraph `StateGraph` with a proposer⇄critic debate loop (configurable 1–5 rounds)
- Cross-paper analysis producing methodology patterns, contradictions, missing dimensions,
  weak evaluation signals, evidence notes, comparative axes, and recommended experiments
- Two-phase gap analysis: generator, then a gap-critic that approves candidates
- Paper architect producing three separate artifacts — analysis dossier, publication draft, and
  a combined compatibility paper. Figures render as text captions — the Anthropic API has no
  image endpoint.

**Retrieval**
- Six sources: ArXiv, Semantic Scholar, OpenAlex, Crossref, GitHub repos, Tavily web
- Topic-relevance scoring with per-source quality weighting and off-topic penalties
- Two-stage deduplication plus near-duplicate cluster reporting
- Per-depth budgets (`quick` / `standard` / `deep`)
- Year filtering and source include/exclude lists

**Quality signals**
- Citation verification counts, per-claim evidence mapping, source mix, confidence bands
- Format compliance scoring for `academic` / `ieee` / `apa` / `acm` / `mla`

**Sessions**
- Start, cancel, retry, resume, delete
- Persistent session store with debounced writes; LangGraph SQLite checkpointing
- Timeline capture and replay; per-session artifact directory with 11 files
- Export bundle, on-demand PDF generation, reveal.js slide deck

**Ingestion**
- PDF upload → text extraction → chunking → ChromaDB, queried during retrieval

**Frontend**
- Live WebSocket feed with a 9-stage stepper and automatic polling fallback
- Markdown paper viewer with mermaid diagram rendering and PDF download
- Session sidebar with polling refresh and delete
- Drag-and-drop multi-PDF upload

---

## 3. Missing or incomplete

**Implemented backend, no UI**
- Deep RAG chat (`GET`/`POST /research/{id}/chat`) — fully functional, component deleted
- `POST /research/{id}/resume`
- `GET /research/{id}/slides`
- Export bundle and resource list/download

The corresponding dead `api.ts` client functions have been removed; the backend endpoints
remain. Restoring any of these features means writing both the client function and the UI.

**Never implemented**
- Any test suite, on either side
- Any linting or formatting config
- Authentication, authorization, rate limiting
- Dockerfiles or a compose file (`nginx.conf` exists and expects them)
- LLM response streaming
- Real token accounting — `usageMetadata` is never read; the estimate is `len(draft) // 4` from
  a single node, and cost is a hardcoded per-token constant duplicated in two places
- Human-in-the-loop review
- Real embedding-based near-duplicate detection (currently a token-frequency cosine proxy)

---

## 4. Technical debt and known issues

### Critical

| # | Issue | Location |
|---|---|---|
| C3 | No auth or rate limiting; `POST /research/start` is an unbounded cost amplifier | all routes |
| C6 | Single-process only; module-level session/WS dicts break under `--workers > 1` | `research.py` |

Resolved: **C1** (API key sent as a header, never a query parameter — `llm_client.py`), **C2** (the
unauthenticated `/resources` static mount no longer exists — `main.py` has no `StaticFiles` mount),
**C4**/**C5** (path checks use `Path.is_relative_to` at `research.py:150,977`, and session ids are
rejected rather than stripped via `SAFE_SESSION_ID_RE`), **C7** (runtime state untracked 2026-07-28).

### High

| # | Issue | Location |
|---|---|---|
| H4 | Session store rewrites the whole JSON file on every WebSocket broadcast — O(all sessions) per event | `research.py:204` |

Resolved: **H1** (topic-specific ranking hacks removed — the biology penalty list is replaced by a
domain-neutral no-title-overlap penalty, the generic-term set no longer contains urban/smart-city
terms, and the planner prompt asks for a narrowing angle in the topic's own vocabulary instead of a
hardcoded whitelist), **H2** (`fetch_semantic_scholar` returns `[]` after its retry loop),
**H3** (every retrieval fetcher logs before returning `[]`), **H5** (artifact writes and the chat
vector query run under `asyncio.to_thread`), **H6** (`paper_summaries` fallback keys use a SHA-1
digest, stable across processes), **H7** (critic failures emit `[CRITIC-FAILED]`, which does not
count toward the debate budget but still bounds total attempts), **H8** (both handlers guard with
`active_sessions.get`), **H9** (aria labels, `aria-live` on the feed, keyboard-accessible upload),
**H10** (start/retry/cancel/poll failures surface through `actionError`).

### Medium

- **Swallowed exceptions** at `agents.py:2507`, `:2573`, `research.py:307`, `:335`,
  `main.py:152`. The gap-critic one silently downgrades to unreviewed candidates.
- **Config that should not be hardcoded:** all 12 depth-budget numbers, the 2.5 relevance
  cutoff, the 0.82 dedup threshold, all source weights, the timeline cap (700), chat cap (80),
  summarizer concurrency, the 120 s LLM timeout, chunk size/overlap, and the per-token cost
  constant (duplicated).
- **Frontend:** completion is still tracked four ways, and the bundle is dominated by `mermaid`
  (which pulls in `cytoscape` and `katex`); `index-*.js` alone is ~536 kB.
- **No checkpoint pruning** — `delve_checkpoints.db` grows monotonically.
- **Naming:** the UI brands as "Delve" and the backend as "Delve". This is intentional and
  documented in `CLAUDE.md`, but the PDF export author and `delve_paper.pdf` filename mean the
  split reaches user-facing artifacts.

Resolved: unvalidated inputs (`paper_format`/`depth` are `Literal` enums, `topic` is bounded to
500 chars, `year_from` to 1900–2100, and source lists plus `uploaded_paper_ids` have field
validators), upload hardening (size checked while streaming, `%PDF-` magic verified),
`main.py` `__import__("json")` (now a module import), the Crossref placeholder email (now the
optional `CROSSREF_CONTACT_EMAIL` setting, omitted when blank), and
`_persist_all_sessions_debounced` task cleanup (tasks self-remove, and `flush_pending_persists`
forces a final write on shutdown).

---

## 4a. Dead code removed (2026-07-28)

A cleanup pass removed code with zero call sites, verified by grep before each deletion.
Backend imports cleanly and boots; frontend builds with zero TypeScript errors.

**Files deleted:** `backend/app/api/dependencies.py` (no route used `Depends`),
`frontend/fix_app.py` (one-off codemod with a hardcoded absolute path; its target marker no
longer existed, so it could only fail).

**Backend symbols:** `GAP_ANALYSIS_PROMPT`, `_normalize_gaps`, `VectorStoreService.has_document`,
`Settings.stream_generate_url`, `ResearchState.human_feedback`, and the import-time
`research_graph` (the graph is rebuilt per-run inside the checkpointer context). The
`_debate_snippet` helper was duplicated byte-for-byte in `research.py` and `agents.py`; the
route now imports the `agents.py` copy.

**Frontend:** eight unused `api.ts` functions (`startResearch`, `getBaseUrl`, `health`,
`exportBundle`, `listSessionResources`, `resourceDownloadUrl`, `getResearchChat`,
`sendResearchChat`); the unused `PaperFound`, `ChatMessage`, and `StartResearchResponse` types;
`FeedItem.icon` plus the dead `getIcon` heuristic in `useWebSocket` (`ResearchFeed` computes its
own icons and never read the field).

**Dependencies:** removed `class-variance-authority`, `clsx`, `tailwind-merge` (declared, never
imported). Moved `@types/react` and `@types/react-dom` to `devDependencies`. Added a
`typecheck` script.

**Git:** `backend/delve_sessions.json` and `backend/chroma_data/chroma.sqlite3` untracked via
`git rm --cached` (files kept on disk). They matched `.gitignore` but were tracked from the
initial commit, so the ignore rules never applied.

**Documentation consolidated:** `PROJECT_DETAILED_EXPLANATION.md` and `RUN_COMMANDS.md` were
deleted — the former actively described the removed components, the Analytics tab, and only
three retrieval sources; the latter duplicated the README quick start. `project_report.pdf`
(1.8 MB build artifact) and `project_report.tex` were removed as an academic deliverable rather
than project documentation, which in turn made the six `ss/screenshot_*.png` files they
referenced unused. `README.md` was slimmed to an overview plus an index into `docs/`.

---

## 5. Proposed roadmap

Awaiting approval — nothing here has been implemented.

### Phase 0 — Repo hygiene — DONE
1. ~~Untrack `backend/delve_sessions.json` and `backend/chroma_data/chroma.sqlite3`~~ done (C7)
2. ~~Delete `frontend/fix_app.py`~~ done
3. ~~Remove dead code and unused dependencies~~ done — see §4a
4. ~~Fix the model-default mismatch so a fresh clone works~~ superseded — the LLM provider moved
   to the Anthropic Messages API, where `config.py` and `.env.example` agree on
   `claude-sonnet-5`. Committing the frontend rewrite remains open.

### Phase 1 — Correctness bugs — DONE
5. ~~Remove the hardcoded topic-specific ranking hacks (H1)~~ done
6. ~~Fix the missing `fetch_semantic_scholar` return (H2)~~ done
7. ~~Fix the exception-handler `KeyError` and throwaway-dict mutation (H8)~~ done
8. ~~Stop counting failed critic rounds as debate rounds (H7)~~ done
9. ~~Make `paper_summaries` keys stable (H6)~~ done
10. ~~Log retrieval failures instead of blanket-swallowing them (H3)~~ done

### Phase 2 — Security — DONE except auth
11. ~~Move the API key out of the URL and into a request header (C1)~~ done
12. ~~Remove or authenticate the `/resources` static mount (C2)~~ done — mount removed
13. ~~Replace `startswith` path checks with `Path.is_relative_to`, and reject rather than strip
    unsafe session ids (C4, C5)~~ done
14. ~~Validate `paper_format` / `depth` / source lists as enums; bound `topic` and `year_from`~~ done
15. ~~Check the `%PDF` header and stream the upload size check~~ done

### Phase 3 — Testability
16. Add pytest with fixtures that stub the LLM client, and cover the pure helpers in `agents.py`
    (scoring, dedup, JSON extraction, citation formatting, format compliance) — these are
    numerous, pure, and currently entirely untested
17. Add route tests against a fake session store
18. Add ESLint + Prettier and a `typecheck` script to the frontend

### Phase 4 — Robustness and performance
19. ~~Move artifact writes and the chat-handler vector query off the event loop (H5)~~ done
20. Replace whole-file session-store rewrites with per-session files or SQLite (H4)
21. Add real token accounting from `usageMetadata`; centralize the cost constant
22. Add checkpoint pruning
23. Extract the hardcoded tunables into `config.py`

### Phase 5 — Frontend quality
24. ~~Accessibility pass: labels, `aria-live` on the feed, keyboard-accessible upload, accessible
    names on icon buttons (H9)~~ done
25. ~~Surface errors to the user~~ done via `actionError`; an error boundary is still missing
26. Lazy-load `mermaid`
27. Decide the fate of the removed features — either restore chat/analytics/resources UI or
    delete the orphaned backend endpoints

### Phase 6 — Deployment (only if it needs to leave localhost)
28. Auth and rate limiting (C3)
29. Move session/WS state out of module-level dicts (C6)
30. Dockerfiles + compose to match the existing `nginx.conf`
31. Configurable CORS origins

### Cross-cutting, unscheduled
- **Split `agents.py`.** At ~3,150 lines with roughly 70 module-level helpers plus 8 nodes, it
  is the single biggest obstacle to working in this codebase. A natural split is
  `prompts.py` / `scoring.py` / `tables.py` (the ~30 markdown-table builders) / `nodes.py`.
  Worth doing early in any phase that touches the pipeline heavily, but not worth a standalone
  churn commit.
- Resolve the Delve/Delve naming split.
