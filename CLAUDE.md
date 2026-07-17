# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ORION is a multi-agent deep-research platform. A FastAPI + LangGraph backend runs an 8-stage
research pipeline (plan → retrieve → summarize → debate → cross-paper → gap analysis → paper), and
a React + Vite frontend drives it with a live WebSocket feed and session history.

## Commands

Backend (from `backend/`, Windows venv activation shown as in the repo docs):

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env          # then set VERTEX_API_KEY (required)

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

- `backend/app/core/llm_client.py` wraps **Vertex AI Express Mode (Gemini 2.5 Pro)** — auth is a
  bare API key (`VERTEX_API_KEY`) as a query param, no GCP project. Includes retry logic.
- Nodes call this client; there is no per-node model configuration beyond what the client exposes.

### Retrieval & vector store

- `backend/app/services/retrieval.py` fetches from ArXiv, Semantic Scholar, and Tavily (web, optional
  via `TAVILY_API_KEY`), with topic-relevance scoring, off-topic drift penalties, dedup, and
  near-duplicate clustering.
- Uploaded PDFs: `services/parsing.py` (extract/chunk) → `services/vector_store.py` (ChromaDB,
  collection `orion_papers`). The retrieval node also queries ChromaDB for uploaded-PDF chunks, and
  the floating research chat uses the same vector store for Deep RAG grounding.

### API & realtime

- Session lifecycle + persistence: `backend/app/api/routes/research.py` (start/cancel/retry/resume/
  delete, status/detail/paper/timeline/chat/export, resources list/download).
- PDF upload: `backend/app/api/routes/upload.py`.
- WebSocket live progress: `WS /ws/{session_id}` in `backend/app/main.py`. Event types the frontend
  expects: `status`, `paper_found`, `gap`, `debate`, `complete`, `error`.

### Persistence (three layers, all local files under `backend/`)

1. **`orion_sessions.json`** — session metadata, controls, timeline, metrics, result payloads
   (path via `SESSION_STORE_PATH`). Writes are debounced.
2. **`orion_checkpoints.db`** — LangGraph SQLite checkpointer for graph state (`SQLITE_CHECKPOINT_PATH`).
3. **`resources/<session_id>/`** — per-session artifacts: `analysis.md`, `final_draft.md`, `paper.md`,
   `bibliography.json`, `paper_summaries.json`, `claim_evidence_map.json`, `gaps.json`,
   `source_counts.json`, `timeline.json`, `export_bundle.json`, `chat_history.json`, and images.

`chroma_data/` (vector DB), `resources/`, and the JSON/DB state files are runtime-generated and
safe to regenerate.

### Frontend

- `frontend/src/App.tsx` orchestrates tabs: New Research, Research Feed, Final Paper, Analytics,
  Resources, plus the floating Deep RAG chat.
- `src/api.ts` is the API client; `src/hooks/useWebSocket.ts` handles the WS lifecycle, reconnect,
  and timeline preload; `src/types.ts` holds the shared contracts that must match backend payloads.
- Notable components: `ResearchFeed.tsx`, `PaperViewer.tsx`, `ResearchChatFloating.tsx`,
  `VisualInsights.tsx`, `Mermaid.tsx`, `PdfUpload.tsx`, `Sidebar.tsx`.

## Configuration

All backend config is in `backend/app/core/config.py`, loaded from `backend/.env` (see `.env.example`).
Required: `VERTEX_API_KEY`. Optional: `TAVILY_API_KEY`. Tunables include `MAX_SEARCH_QUERIES`,
`MAX_SOURCE_RESULTS_PER_QUERY`, `SEMANTIC_SCHOLAR_MAX_RETRIES`, `SEMANTIC_SCHOLAR_BASE_BACKOFF_SECONDS`,
`MAX_DEBATE_ROUNDS`, `STRICT_SYNTHESIS_MODE`, and the persistence paths above.

Per-run controls accepted by `POST /research/start`: `strict_mode`, `max_debate_rounds`,
`paper_format` (`academic` | `ieee` | `apa` | `acm` | `mla`), `depth`, `year_from`,
`include_sources`, `exclude_sources`.
