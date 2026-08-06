# Delve — Multi-Agent Deep Research Platform

Delve takes a research topic, gathers evidence from six academic and web sources, critiques its
own synthesis through a proposer/critic debate loop, identifies research gaps, and produces a
formatted paper with citations, a bibliography, and quality signals.

- **Backend** — FastAPI + LangGraph, an 8-stage research pipeline, Claude
- **Frontend** — React 19 + Vite, live WebSocket progress feed, session history
- **Storage** — local files only: JSON session store, SQLite checkpoints, ChromaDB vector store

```
planner → retrieval → summarizer → proposer ⇄ critic → cross_paper → gap_analysis → paper_architect
```

## Quick start

Requires Python 3.11+, Node.js 18+, and an API key for an Anthropic-compatible endpoint.

```bash
# Terminal 1 — backend
cd backend
python -m venv .venv && .venv\Scripts\activate     # source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
copy .env.example .env                             # then set LLM_API_KEY
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies API and WebSocket traffic to port 8000,
so no CORS setup is needed.

## Verification

There is no test suite in this repository.

```bash
python -m compileall backend/app    # backend sanity check
cd frontend && npm run build        # tsc typecheck + production build
```

## Documentation

Documentation is the source of truth for this project.

| File | Contents |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Permanent project memory: tech stack, folder structure, coding standards, project rules |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | Current state, feature inventory, technical-debt register, roadmap |
| [CHANGELOG.md](CHANGELOG.md) | What changed, when |
| [docs/architecture.md](docs/architecture.md) | Pipeline nodes, LLM client, retrieval, realtime, process model |
| [docs/api.md](docs/api.md) | Every endpoint with request/response shapes |
| [docs/database.md](docs/database.md) | The persistence layers and their record shapes |
| [docs/ui.md](docs/ui.md) | Frontend navigation model, components, state |
| [docs/deployment.md](docs/deployment.md) | Setup, configuration reference, deployment blockers |
| [docs/aerolink.md](docs/aerolink.md) | Connecting to the Aerolink LLM gateway — auth, gotchas, error handling |

## Status

Delve is a working local prototype. It is **not ready for shared or public deployment** — there
is no authentication or rate limiting, and the backend is single-process only. See
[docs/deployment.md](docs/deployment.md#blockers-before-any-shared-or-public-deployment).

## License

MIT
