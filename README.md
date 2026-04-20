# ORION - Multi-Agent Deep Research System

ORION is a production-oriented research assistant that runs a full multi-stage pipeline:

1. Planner -> retrieval (ArXiv/Semantic Scholar/Tavily + optional uploaded PDFs)
2. Summarizer -> proposer/critic debate loop
3. Gap analysis with structured outputs
4. Final paper generation with citation/evidence quality signals and downloadable session artifacts

## What ORION now supports

- **Structured quality signals** in final results:
  - verified citations
  - claim-evidence links
  - source mix and duplicate clusters
  - format compliance summary for selected paper format
- **Configurable controls** per run:
  - strict synthesis mode
  - debate rounds (1..5)
  - paper format (`academic`, `ieee`, `apa`, `acm`, `mla`)
  - retrieval depth/source filters/year constraints
- **Persistent sessions**:
  - saved session state in `backend/orion_sessions.json`
  - per-session resource files under `backend/resources/<session_id>/`
- **Session operations**:
  - cancel / retry / resume / delete
  - timeline replay
  - export bundle download

## Architecture

```text
Frontend (React + Vite)
  - New Research
  - Research Feed (WebSocket + persisted timeline preload)
  - Final Paper
  - Analytics
  - Resources
  - Floating Research Discussion Chat

Backend (FastAPI + LangGraph)
  planner -> retrieval -> summarizer -> proposer <-> critic -> gap_analysis -> paper_architect
```

## Quick start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Vertex API key

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Set `VERTEX_API_KEY` in `backend\.env` (and `TAVILY_API_KEY` if you want web retrieval enabled).

### Frontend

```bash
cd frontend
npm install
```

### Run

```bash
# terminal 1
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# terminal 2
cd frontend
npm run dev
```

Open: `http://localhost:5173`

## Main API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/research/start` | Start research session with controls |
| POST | `/research/{id}/cancel` | Cancel running session |
| POST | `/research/{id}/retry` | Retry a finished/failed session |
| POST | `/research/{id}/resume` | Resume cancelled/error session |
| DELETE | `/research/{id}` | Delete session |
| GET | `/research/{id}/status` | Lightweight run status |
| GET | `/research/{id}/detail` | Full session detail + controls/metrics |
| GET | `/research/{id}/paper` | Final paper + quality metadata |
| GET | `/research/{id}/chat` | Get session research chat history |
| POST | `/research/{id}/chat` | Ask context-aware research questions |
| GET | `/research/{id}/timeline` | Timeline events |
| GET | `/research/{id}/export` | JSON export bundle |
| GET | `/research/{id}/resources/list` | Saved resource files for session |
| GET | `/research/{id}/resources/download/{file_name}` | Download resource artifact |
| GET | `/research/sessions/list` | List all sessions |
| POST | `/upload/pdf` | Upload PDF for vector retrieval |
| WS | `/ws/{session_id}` | Live progress stream |
| GET | `/health` | Health check |

## Environment variables

Core:
- `VERTEX_API_KEY` (required)
- `TAVILY_API_KEY` (optional)

Persistence:
- `SESSION_STORE_PATH`
- `SQLITE_CHECKPOINT_PATH`

Tuning:
- `MAX_SEARCH_QUERIES`
- `MAX_SOURCE_RESULTS_PER_QUERY`
- `SEMANTIC_SCHOLAR_MAX_RETRIES`
- `SEMANTIC_SCHOLAR_BASE_BACKOFF_SECONDS`
- `MAX_DEBATE_ROUNDS`
- `STRICT_SYNTHESIS_MODE`

Server:
- `HOST`
- `PORT`

## Cleanup and build commands

```bash
# backend sanity
python -m compileall backend\app

# frontend production build
cd frontend
npm run build
```

## Notes

- `frontend\dist\` is build output and can be safely regenerated.
- `backend\resources\` stores session artifacts used by the Resources page.
- `backend\orion_sessions.json` is persistent local state.

## License

MIT
 - **Separated output artifacts**:
   - `analysis.md` (Research Analysis Dossier)
   - `final_draft.md` (publication-style draft)
   - `paper.md` (compatibility combined paper field)
