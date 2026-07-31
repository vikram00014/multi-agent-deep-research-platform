# API reference

Base URL in development: `http://127.0.0.1:8000`. The frontend calls these through the Vite dev
proxy (same-origin), or through nginx in a container build.

**There is no authentication, authorization, or rate limiting on any endpoint.**

## Routers

| Prefix | Module |
|---|---|
| `/research` | `backend/app/api/routes/research.py` |
| `/upload` | `backend/app/api/routes/upload.py` |
| `/health`, `/ws` | `backend/app/main.py` |

## Request/response models

Defined in `research.py:45-88` and `upload.py:21`.

```python
StartResearchRequest:
    topic: str
    uploaded_paper_ids: list[str] = []
    max_debate_rounds: int | None
    strict_mode: bool | None
    paper_format: str | None = "academic"      # academic | ieee | apa | acm | mla
    depth: str | None = "standard"             # quick | standard | deep
    year_from: int | None
    include_sources: list[str] | None
    exclude_sources: list[str] | None

StartResearchResponse:  session_id, message
SessionStatus:          session_id, status, current_step, paper_available
SessionActionResponse:  session_id, status, message
ResearchChatRequest:    message
ResearchChatMessage:    role, content, timestamp
ResearchChatResponse:   session_id, answer, history
UploadResponse:         file_id, filename, chunks_stored, total_characters
```

`paper_format`, `depth`, `include_sources`, and `exclude_sources` are **not validated against an
enum** — unknown values silently fall back to defaults.

Session `status` values: `running`, `complete`, `error`, `cancelled`.

## Endpoints

### Session lifecycle

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/research/start` | `StartResearchRequest` | `StartResearchResponse` |
| POST | `/research/{id}/cancel` | — | `SessionActionResponse` |
| POST | `/research/{id}/retry` | — | `SessionActionResponse` |
| POST | `/research/{id}/resume` | — | `SessionActionResponse` (delegates to retry; only valid for `cancelled`/`error`) |
| DELETE | `/research/{id}` | — | `SessionActionResponse`; **400** if the session is running |

`start` spawns a detached `asyncio.Task` and returns immediately. Clients then open the
WebSocket and/or poll `/status`.

### Reads

| Method | Path | Returns |
|---|---|---|
| GET | `/research/{id}/status` | `SessionStatus` — lightweight, safe to poll |
| GET | `/research/{id}/detail` | untyped dict: topic, status, current_step, started_at, finished_at, elapsed_seconds, source_counts, duplicate_clusters, error, error_badge, token_estimate, cost_estimate_usd, controls, uploaded_paper_ids, resource_files |
| GET | `/research/{id}/paper` | untyped dict: paper, analysis, final_draft, gaps, bibliography, debate_log, timeline, cross_paper_analysis, gap_candidates, gap_critique, citation_quality, citation_verification, claim_to_evidence_map, source_counts, duplicate_clusters, debate_rounds, verified_citations, paper_format, format_compliance. **400 unless status == "complete"** |
| GET | `/research/{id}/timeline` | `{session_id, timeline}` |
| GET | `/research/sessions/list` | `{sessions: [{session_id, topic, status, current_step, created_at, updated_at, token_estimate, cost_estimate_usd}]}` |

### Artifacts

| Method | Path | Returns |
|---|---|---|
| GET | `/research/{id}/export` | `{markdown, analysis_markdown, final_draft_markdown, pdf_text, bibtex, evidence_json, chat_history, timeline}` |
| GET | `/research/{id}/paper.pdf` | `FileResponse` (`application/pdf`), generated on demand via reportlab |
| GET | `/research/{id}/resources/list` | `{resources: [{name, size_bytes, updated_at}]}` |
| GET | `/research/{id}/resources/download/{file_name}` | `FileResponse` |
| GET | `/research/{id}/slides` | `HTMLResponse` — reveal.js deck rendered from the paper |

### Chat (Deep RAG)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/research/{id}/chat` | — | `{session_id, history}` |
| POST | `/research/{id}/chat` | `ResearchChatRequest` | `ResearchChatResponse` |

Grounds answers in the session result plus a ChromaDB query over the session's uploaded PDFs.
History is capped at the last 80 messages.

**These endpoints currently have no UI** — the floating chat component was removed.

### Upload

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/upload/pdf` | multipart, field `file` | `UploadResponse` |

50 MB cap, but the whole file is buffered into memory *before* the size check. Only the filename
extension is checked; the `%PDF` magic header is not verified.

### Health and realtime

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{status, service, version}` |
| WS | `/ws/{session_id}` | See below |

WebSocket frames — server → client: `connected`, `heartbeat`, `pong`, `status`, `paper_found`,
`gap`, `debate`, `complete`, `error`. Client → server: `{"type":"ping"}`, `{"type":"stop"}`.

## Endpoints with no frontend caller

`POST /research/{id}/resume`, `GET /research/{id}/slides`, and both `/chat` endpoints are
implemented and functional but unreferenced by the current UI.

## Frontend API client

`frontend/src/api.ts` mirrors these routes one-to-one. `API_BASE` comes from `VITE_API_BASE` and
defaults to `''` (same-origin). It intentionally covers only the routes the UI calls — the chat,
export, resource-listing, resume, and slides endpoints have no client function.
