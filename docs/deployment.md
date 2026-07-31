# Deployment

## Current status

ORION is a **local, single-user, single-process application**. There is no production
deployment today, and the codebase is not yet ready for one — see "Blockers" below.

A `frontend/nginx.conf` exists that assumes a container topology with a backend service
reachable at `http://backend:8000`, but there is **no Dockerfile and no compose file** in the
repository. The nginx config is aspirational.

## Local development

### Prerequisites

- Python 3.11+
- Node.js 18+
- An API key for an Anthropic-compatible endpoint (Aerolink by default)
- Optionally, a Tavily API key for web retrieval

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows; use source .venv/bin/activate elsewhere
pip install -r requirements.txt
copy .env.example .env          # then set LLM_API_KEY

uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

Open `http://localhost:5173`. The Vite dev server proxies `/research`, `/upload`, `/health`,
`/resources`, and `/ws` to `127.0.0.1:8000`, so no CORS or `VITE_API_BASE` configuration is
needed for local work.

### Verification

There is no test suite in this repository.

```bash
python -m compileall backend/app    # backend sanity check
cd frontend && npm run build        # runs tsc, then vite build
```

## Configuration

All backend settings load from `backend/.env` via pydantic-settings (`app/core/config.py`).

| Variable | Default | Notes |
|---|---|---|
| `LLM_API_KEY` | — | **Required** |
| `LLM_BASE_URL` | `https://api.aerolink.lat/v1` | Anthropic-compatible gateway; use `https://api.anthropic.com/v1` for Anthropic directly |
| `LLM_MODEL` | `claude-sonnet-5` | Also available: `claude-opus-4-8`, `claude-haiku-4-5-20251001` |
| `ANTHROPIC_VERSION` | `2023-06-01` | API version header |
| `TAVILY_API_KEY` | `""` | Optional; disables web retrieval when unset |
| `CHROMA_PERSIST_DIR` | `./chroma_data` | |
| `SQLITE_CHECKPOINT_PATH` | `./orion_checkpoints.db` | |
| `SESSION_STORE_PATH` | `./orion_sessions.json` | |
| `MAX_SEARCH_QUERIES` | 4 | Silently overridden upward by the per-depth budget |
| `MAX_SOURCE_RESULTS_PER_QUERY` | 4 | Same |
| `SEMANTIC_SCHOLAR_MAX_RETRIES` | 3 | |
| `SEMANTIC_SCHOLAR_BASE_BACKOFF_SECONDS` | 2.0 | |
| `MAX_DEBATE_ROUNDS` | 1 | Clamped 0..5 at runtime |
| `STRICT_SYNTHESIS_MODE` | false | |
| `CROSSREF_CONTACT_EMAIL` | `""` | Sent to Crossref for polite-pool access; omitted when blank |
| `HOST` | `0.0.0.0` | |
| `PORT` | 8000 | |

Frontend: `VITE_API_BASE` (optional, defaults to same-origin). No `frontend/.env.example` exists.

## Runtime files

Everything ORION writes lives under `backend/` and is safe to delete:

```
backend/orion_sessions.json      # session store
backend/orion_checkpoints.db     # LangGraph checkpoints (grows without bound)
backend/chroma_data/             # vector store
backend/resources/<session_id>/  # per-session artifacts
```

Deleting them resets the app to a clean state. See `docs/database.md`.

## Blockers before any shared or public deployment

These are hard blockers, not polish:

1. **No authentication or rate limiting.** `POST /research/start` spawns an unbounded task that
   makes dozens of LLM calls. Exposed publicly, it is a trivially abusable cost amplifier.
2. **Single-process only.** `active_sessions`, `session_tasks`, and `ws_connections` are
   module-level dicts. `--workers > 1` breaks session lookup and WebSocket routing. Horizontal
   scaling requires moving that state to shared storage.
3. **CORS is a hardcoded four-origin localhost list** in `main.py`, so any non-localhost
   deployment requires a code edit.
4. **Dev defaults are baked in.** `HOST` defaults to `0.0.0.0` and `main.py` hardcodes
   `reload=True` in its `__main__` block.
5. **The session store rewrites the entire JSON file on every WebSocket broadcast**, which will
   not survive multiple concurrent sessions.

## If containerizing

The missing pieces are a backend Dockerfile, a frontend multi-stage build that emits `dist/`
into the nginx image, and a compose file wiring them with a service named `backend` (the name
`nginx.conf` already expects). Volumes are needed for `chroma_data/`, `resources/`, and the two
state files. Note that nginx's `client_max_body_size 50M` on `/upload` must stay aligned with
the backend's own 50 MB cap.
