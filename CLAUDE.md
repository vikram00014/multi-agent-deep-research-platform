# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Delve is a multi-agent deep-research platform. A FastAPI + LangGraph backend runs an 8-stage
research pipeline (plan → retrieve → summarize → debate → cross-paper → gap analysis → paper), and
a React + Vite frontend drives it with a live WebSocket feed and session history.

The project was previously named ORION; that name has been fully retired. If you find it anywhere
outside `CHANGELOG.md` history entries, it is a leftover and should be renamed to Delve.

## Documentation map

Documentation is the source of truth. Never rely on chat history from a previous session.

| File | Role |
|---|---|
| `README.md` | Entry point: overview, quick start, index into everything below |
| `CLAUDE.md` (this file) | Permanent project memory — facts that do not change per session |
| `PROJECT_STATUS.md` | Session handoff: current state, feature inventory, tech-debt register, roadmap |
| `CHANGELOG.md` | What changed, when |
| `docs/architecture.md` | Pipeline nodes, LLM client, retrieval, realtime, process model |
| `docs/api.md` | Every endpoint, request/response shapes |
| `docs/database.md` | The three persistence layers and their record shapes |
| `docs/ui.md` | Frontend navigation model, components, state, known gaps |
| `docs/deployment.md` | Local setup, configuration, deployment blockers |
| `docs/aerolink.md` | Aerolink gateway: auth scheme, API gotchas, error semantics, risks |

Keep these current. If a change makes a doc statement false, fix the doc in the same commit.

## Commands

Backend (from `backend/`, Windows venv activation shown as in the repo docs):

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env          # then set LLM_API_KEY (required)

uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
python -m compileall app        # sanity "build"/typecheck for backend
```

Frontend (from `frontend/`):

```bash
npm install
npm run dev        # Vite dev server on http://localhost:5173
npm run build      # tsc typecheck + production build
```

There is **no test suite** in this repo — do not assume `pytest`/`vitest` exist. Backend
verification is `python -m compileall app`; frontend verification is `npm run build` (which runs
`tsc` first).

## Tech stack

**Backend** — Python 3.11+, FastAPI 0.115, uvicorn, LangGraph 0.4 (+ `langgraph-checkpoint-sqlite`),
httpx, ChromaDB 0.6, `arxiv`, `tavily-python`, pypdf, reportlab, pydantic-settings.
LLM is Claude via the Anthropic Messages API, called over plain REST — no SDK. There is no image
generation.

**Frontend** — React 19, TypeScript 6, Vite 8, Tailwind v4 (via `@tailwindcss/vite`, no config
file), framer-motion, lucide-react, react-markdown + remark-gfm, mermaid.

## Folder structure

```
backend/
  app/
    main.py                 FastAPI app, lifespan, WebSocket endpoint, /health, static mount
    core/
      agents.py             ALL node logic + ~70 helpers (~3,150 lines) — the big one
      graph.py              StateGraph wiring
      state.py              ResearchState TypedDict
      llm_client.py         Anthropic Messages API REST wrapper
      config.py             pydantic-settings, loaded from backend/.env
    api/
      routes/research.py    Session lifecycle, reads, artifacts, chat
      routes/upload.py      PDF upload
    services/
      retrieval.py          Six external source fetchers
      vector_store.py       ChromaDB wrapper
      parsing.py            PDF text extraction + chunking
      pdf_export.py         Markdown → PDF via reportlab
  requirements.txt
  .env.example
  (runtime, gitignored: delve_sessions.json, delve_checkpoints.db, chroma_data/, resources/)

frontend/
  src/
    App.tsx                 Root; derives the idle/running/done view
    api.ts                  API client
    types.ts                Shared contracts — must match backend payloads
    hooks/useWebSocket.ts   WS lifecycle, reconnect, polling fallback
    components/             ResearchFeed, PaperViewer, Sidebar, PdfUpload, Mermaid
  vite.config.ts            Dev proxy to 127.0.0.1:8000
  nginx.conf                Container proxy config (no Dockerfile exists yet)

docs/                       architecture, api, database, ui, deployment
```

## Architecture

### Pipeline (the core of the system)

The research pipeline is a LangGraph `StateGraph` defined in `backend/app/core/graph.py`:

```
planner -> retrieval -> summarizer -> proposer <-> critic (debate loop) -> cross_paper -> gap_analysis -> paper_architect -> END
```

- **All node/agent logic lives in one large file: `backend/app/core/agents.py` (~3000 lines).**
  Each stage is a `*_node` function taking and returning `ResearchState`.
- The proposer↔critic **debate loop** is controlled by `debate_should_continue`, which runs critic
  rounds until `max_debate_rounds` (clamped 1..5) is reached, then proceeds to cross-paper analysis.
- Shared state is a single `TypedDict`-style object, `ResearchState` in `backend/app/core/state.py`.
  Every node reads inputs and merges its outputs into this state; when adding a field, thread it
  through state.py, the producing node, and any consumer (API serialization, frontend `types.ts`).

### LLM access

- `backend/app/core/llm_client.py` wraps the **Anthropic Messages API** — auth is a bare API key
  (`LLM_API_KEY`) sent as the `x-api-key` header, with automatic fallback to
  `Authorization: Bearer`. Includes retry logic. `LLM_BASE_URL` defaults to the Aerolink gateway
  (`https://api.aerolink.lat/v1`); set it to `https://api.anthropic.com/v1` for Anthropic direct.
  **There is no image generation** — `generate_image` always returns `""`, so figures degrade to
  text placeholders.
- Nodes call this client; there is no per-node model configuration beyond what the client exposes.

### Retrieval & vector store

- `backend/app/services/retrieval.py` fetches from ArXiv, Semantic Scholar, OpenAlex, Crossref,
  GitHub repositories, and Tavily (web, optional via `TAVILY_API_KEY`), with topic-relevance
  scoring, off-topic drift penalties, dedup, and near-duplicate clustering. All six are enabled
  by default; per-depth budgets are hardcoded in `_depth_budgets` in `agents.py`, not config.
- Uploaded PDFs: `services/parsing.py` (extract/chunk) → `services/vector_store.py` (ChromaDB,
  collection `delve_papers`). The retrieval node also queries ChromaDB for uploaded-PDF chunks, and
  the floating research chat uses the same vector store for Deep RAG grounding.

### API & realtime

- Session lifecycle + persistence: `backend/app/api/routes/research.py` (start/cancel/retry/resume/
  delete, status/detail/paper/timeline/chat/export, resources list/download).
- PDF upload: `backend/app/api/routes/upload.py`.
- WebSocket live progress: `WS /ws/{session_id}` in `backend/app/main.py`. Event types the frontend
  expects: `status`, `paper_found`, `gap`, `debate`, `complete`, `error`.

### Persistence (three layers, all local files under `backend/`)

1. **`delve_sessions.json`** — session metadata, controls, timeline, metrics, result payloads
   (path via `SESSION_STORE_PATH`). Writes are debounced.
2. **`delve_checkpoints.db`** — LangGraph SQLite checkpointer for graph state (`SQLITE_CHECKPOINT_PATH`).
3. **`resources/<session_id>/`** — per-session artifacts: `analysis.md`, `final_draft.md`, `paper.md`,
   `bibliography.json`, `paper_summaries.json`, `claim_evidence_map.json`, `gaps.json`,
   `source_counts.json`, `timeline.json`, `export_bundle.json`, `chat_history.json`, and images.

`chroma_data/` (vector DB), `resources/`, and the JSON/DB state files are runtime-generated and
safe to regenerate.

### Frontend

- `frontend/src/App.tsx` drives a single linear flow, not tabs. The view is derived, never
  user-selected: `type View = 'idle' | 'running' | 'done'`. A persistent `Sidebar` lists sessions.
- `src/api.ts` is the API client; `src/hooks/useWebSocket.ts` handles the WS lifecycle, reconnect,
  timeline preload, and HTTP polling fallback; `src/types.ts` holds the shared contracts that must
  match backend payloads.
- Components: `ResearchFeed.tsx`, `PaperViewer.tsx`, `Mermaid.tsx`, `PdfUpload.tsx`, `Sidebar.tsx`.
  That is the complete set — an earlier revision also had `ResearchChatFloating.tsx` and
  `VisualInsights.tsx` with Analytics/Resources tabs; those were removed. The backend chat,
  resume, slides, and resource endpoints they used still exist but have no UI.
- See `docs/ui.md` for the full component and state breakdown.

## Coding standards

- **Backend:** async throughout. Nodes are `async def node(state, config) -> dict` returning a
  partial state. Keep blocking I/O off the event loop with `asyncio.to_thread`. Private helpers
  are `_`-prefixed and module-level. Type hints on all signatures; `from __future__ import
  annotations` where useful.
- **Frontend:** function components with hooks, no classes. Tailwind utilities inline — there is
  no Tailwind config file and no `cn()` helper. Avoid `any`.
- **Naming:** Python `snake_case`, pipeline nodes end in `_node`. TypeScript `camelCase` for
  values, `PascalCase` for components and types. API JSON is `snake_case` on both sides — the
  frontend does not camelize.
- Follow the surrounding file's style over any general preference.

## Permanent project rules

- **No test suite exists.** Do not assume `pytest` or `vitest`. Verification is
  `python -m compileall app` and `npm run build`.
- **Adding a `ResearchState` field requires four edits:** `state.py`, the producing node, the API
  serialization in `research.py`, and `frontend/src/types.ts`.
- **The backend is single-process.** Session and WebSocket state live in module-level dicts.
  Never introduce anything that assumes multiple workers without moving that state first.
- **Runtime files are disposable:** `delve_sessions.json`, `delve_checkpoints.db`, `chroma_data/`,
  and `resources/`. Never hand-edit them; deleting them is a valid reset.
- **Do not commit runtime state or secrets.** `.env` is gitignored, as are
  `backend/delve_sessions.json`, `backend/delve_checkpoints.db`, `backend/chroma_data/`, and
  `backend/resources/`.
- Update the relevant doc in the same commit as any change that invalidates it.

## Configuration

All backend config is in `backend/app/core/config.py`, loaded from `backend/.env` (see `.env.example`).
Required: `LLM_API_KEY`. Optional: `TAVILY_API_KEY`. Tunables include `LLM_BASE_URL`, `LLM_MODEL`,
`MAX_SEARCH_QUERIES`,
`MAX_SOURCE_RESULTS_PER_QUERY`, `SEMANTIC_SCHOLAR_MAX_RETRIES`, `SEMANTIC_SCHOLAR_BASE_BACKOFF_SECONDS`,
`MAX_DEBATE_ROUNDS`, `STRICT_SYNTHESIS_MODE`, and the persistence paths above.

Per-run controls accepted by `POST /research/start`: `strict_mode`, `max_debate_rounds`,
`paper_format` (`academic` | `ieee` | `apa` | `acm` | `mla`), `depth`, `year_from`,
`include_sources`, `exclude_sources`.
