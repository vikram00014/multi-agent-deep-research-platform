# Data and persistence

There is no database server. Delve persists to three local layers under `backend/`, all
gitignored and all safe to delete and regenerate.

| Layer | Path | Purpose |
|---|---|---|
| Session store | `delve_sessions.json` (`SESSION_STORE_PATH`) | Session metadata, controls, timeline, metrics, full result payloads |
| Graph checkpoints | `delve_checkpoints.db` (`SQLITE_CHECKPOINT_PATH`) | LangGraph `AsyncSqliteSaver` state, keyed by `thread_id = session_id` |
| Vector store | `chroma_data/` (`CHROMA_PERSIST_DIR`) | ChromaDB collection `delve_papers` |
| Artifacts | `resources/<session_id>/` | Per-session markdown, JSON, PDF, and generated images |

## 1. Session store — `delve_sessions.json`

A single JSON object keyed by session id. The record shape is fixed by
`_sanitize_session_for_store` (`research.py:148`):

```jsonc
{
  "<session_id>": {
    "status": "running | complete | error | cancelled",
    "topic": "...",
    "uploaded_paper_ids": [],
    "started_at": "...", "updated_at": "...", "finished_at": "...",
    "current_step": "planner | retrieval | ...",
    "error": null,
    "timeline": [ { "timestamp": "...", "type": "...", "message": "...", "data": {} } ],
    "controls": {
      "max_debate_rounds": 1, "strict_mode": false, "paper_format": "academic",
      "depth": "standard", "year_from": null,
      "include_sources": [], "exclude_sources": []
    },
    "metrics": {
      "elapsed_seconds": 0, "token_estimate": 0,
      "cost_estimate_usd": 0.0, "error_count": 0
    },
    "resource_files": [ { "name": "...", "size_bytes": 0, "updated_at": "..." } ],
    "chat_history": [ { "role": "...", "content": "...", "timestamp": "..." } ],
    "result": {
      "final_paper": "", "research_analysis": "", "final_draft": "",
      "gaps": [], "bibliography": [], "debate_log": [], "paper_summaries": {},
      "literature_review": "", "cross_paper_analysis": {},
      "citation_quality": {}, "citation_verification": {},
      "source_counts": {}, "duplicate_clusters": [],
      "gap_candidates": [], "gap_critique": "", "claim_to_evidence_map": [],
      "debate_rounds": 0, "verified_citations": 0,
      "paper_format": "academic", "format_compliance": {},
      "format_compliance_score": 0, "format_compliant": false
    }
  }
}
```

Caps: `timeline` keeps the last 700 events; `chat_history` the last 80 messages.

**Write behavior.** `_write_store_sync` rewrites the *entire* file — all sessions — on every
save, offloaded to a thread under a lock. Saves are debounced 0.8 s and triggered on **every**
WebSocket broadcast. The file is loaded twice at startup: once at module import
(`research.py:243`) and again from the lifespan handler (`main.py:58`).

This is O(all sessions) per event and is the primary scaling limit of the current design.

## 2. LangGraph checkpoints — `delve_checkpoints.db`

Opened per-run as `AsyncSqliteSaver.from_conn_string(...)`, with the graph **rebuilt inside that
context on every session** (`research.py:460`). `thread_id` is the session id. There is no
pruning or retention policy, so the DB grows monotonically.

A second, uncheckpointed graph is compiled at import time in `graph.py:85` and imported by
`research.py:36` but never used.

## 3. Vector store — `chroma_data/`

- Client: `chromadb.Client` with `is_persistent=True`, telemetry disabled.
- Collection: **`delve_papers`**, `hnsw:space = cosine`.
- Embeddings: Chroma's default (`all-MiniLM-L6-v2`) — never specified explicitly, so it tracks
  whatever the installed chromadb version defaults to.
- Chunking (`services/parsing.py`): 1000 characters with 200 overlap, snapped to a sentence
  boundary. Both are module constants, not settings.
- Document ids: `{file_id}_chunk_{i}`; metadata carries `file_id` and `chunk_index`.
- `query()` is synchronous. `retrieval_node` correctly wraps it in `asyncio.to_thread`; the chat
  handler does not.
- Re-uploading the same PDF re-embeds it; there is no duplicate-document check.

## 4. Session artifacts — `resources/<session_id>/`

Written by `_save_session_resources` (`research.py:371`) on pipeline completion:

| File | Contents |
|---|---|
| `analysis.md` | Research Analysis Dossier |
| `final_draft.md` | Publication-style draft |
| `paper.md` | Combined paper (compatibility field) |
| `bibliography.json` | Verified reference list |
| `paper_summaries.json` | Per-paper structured summaries |
| `claim_evidence_map.json` | Claim → supporting-source links |
| `gaps.json` | Identified research gaps |
| `source_counts.json` | Per-source retrieval counts |
| `timeline.json` | Full event timeline |
| `chat_history.json` | Deep RAG conversation |
| `export_bundle.json` | Everything, for the export endpoint |
| `delve_paper.pdf` | Generated on demand by `/paper.pdf` |

Older sessions may also contain `img_<hex8>.png` figures. These are no longer produced — the
Anthropic API has no image endpoint, so figures render as text captions instead.

All 11 JSON/markdown files are written via `asyncio.to_thread`, keeping them off the event loop.

## Known data-integrity issues

- **Append reducers on retrieval fields.** `retrieved_papers` and `vector_results` use the
  merge-append reducer. Harmless today because retrieval runs once, but a checkpointed
  retry/resume would duplicate rather than replace.
- **No checkpoint pruning.** `delve_checkpoints.db` grows monotonically.
