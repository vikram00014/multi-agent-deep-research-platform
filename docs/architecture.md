# Architecture

## System overview

Delve is a two-process local application.

```
┌──────────────────────────────┐        ┌──────────────────────────────────┐
│  Frontend  (React 19 + Vite) │        │  Backend (FastAPI + LangGraph)   │
│  :5173 dev  /  nginx :80 prod│◀──────▶│  :8000                           │
│                              │  HTTP  │                                  │
│  idle → running → done       │   +    │  8-node research StateGraph      │
│  Sidebar (session list)      │   WS   │  Session store (JSON)            │
└──────────────────────────────┘        │  Checkpointer (SQLite)           │
                                        │  Vector store (ChromaDB)         │
                                        └──────────────┬───────────────────┘
                                                       │
                        ┌──────────────────────────────┼───────────────────────┐
                        │                              │                       │
                 Anthropic Messages           ArXiv / Semantic Scholar    Tavily / GitHub
                 (Claude, via gateway)        OpenAlex / Crossref          (optional)
```

There is no database server, no message queue, and no auth layer. All state lives in local
files under `backend/`.

## The research pipeline

Defined as a LangGraph `StateGraph` in `backend/app/core/graph.py`. All node implementations
live in the single large module `backend/app/core/agents.py` (~3,150 lines).

```
planner → retrieval → summarizer → proposer ⇄ critic → cross_paper → gap_analysis → paper_architect → END
                                      │                    ▲
                                      └── debate_should_continue ──┘
```

Every node has the signature `async def node(state: ResearchState, config: dict) -> dict` and
returns a partial state dict that LangGraph merges into the shared `ResearchState`.

### Node reference

| Node | Reads | Writes | LLM calls | WS events emitted |
|---|---|---|---|---|
| `planner_node` | `topic`, `planner_constraints` | `refined_query`, `search_queries`, `research_plan` | 1 (JSON, temp 0.3) | `status` ×2 |
| `retrieval_node` | `search_queries`, `planner_constraints`, `uploaded_paper_ids` | `retrieved_papers`, `vector_results`, `duplicate_clusters`, `source_counts` | 0 | `status`, up to 5 × `paper_found` |
| `summarizer_node` | `retrieved_papers`, `vector_results` | `paper_summaries`, `citation_quality`, `citation_verification` | N = summary cap (8/14/22 by depth), concurrency 4–6 | `status` per paper |
| `proposer_node` | `topic`, `paper_summaries`, `debate_log` | `literature_review_draft`, `debate_log`, `debate_round`, `token_estimate` | 1 per round (6144 tok, thinking on) | `status` ×2 |
| `critic_node` | `literature_review_draft`, `paper_summaries` | `debate_log` (`[CRITIC] …`) | 1 per round (2048 tok) | `status` ×2 |
| `cross_paper_analyzer_node` | `topic`, `paper_summaries` | `cross_paper_analysis` (7 keys) | 1 (JSON) | `status` ×2 |
| `gap_analysis_node` | `cross_paper_analysis`, `paper_summaries` | `generated_gap_candidates`, `gap_critique`, `identified_gaps` | 2–4 | one `gap` per gap, `status` |
| `paper_architect_node` | nearly all prior state | `research_analysis_markdown`, `final_draft_markdown`, `final_paper_markdown`, `bibliography`, `claim_to_evidence_map`, `verified_citations`, `format_compliance` | 1 main (16384 tok) + optional retry | final `status` |

`debate_should_continue` (`agents.py:3145`) counts `[CRITIC]` entries in `debate_log` and routes
back to `critic` until `max_debate_rounds` (clamped 0..5) is reached, then to `cross_paper`.
Note the conditional-edge key is literally `"gap_analysis"` but maps to the `cross_paper` node
(`graph.py:65`) — a naming artifact, not a bug.

`complete`, `error`, and `debate` WebSocket events are emitted by the route wrapper
`run_research_pipeline` (`research.py:418`), not by the nodes.

### Shared state

`ResearchState` (`backend/app/core/state.py`) is a `TypedDict(total=False)` with ~35 fields
grouped by stage. Two fields use append reducers (`retrieved_papers`, `vector_results`,
`paper_summaries`, `debate_log`) so repeated writes accumulate rather than replace.

**When adding a state field, thread it through four places:** `state.py`, the producing node,
the API serialization in `research.py`, and `frontend/src/types.ts`.

## LLM access

`backend/app/core/llm_client.py` is a thin async wrapper over the **Anthropic Messages API**.
Auth is a bare API key sent as the **`x-api-key` header**, with an automatic fallback to
`Authorization: Bearer` so either gateway convention works.

- Endpoint: `{llm_base_url}/messages`
- `llm_base_url` defaults to `https://api.aerolink.lat/v1`, an Anthropic-compatible gateway.
  Point it at `https://api.anthropic.com/v1` to use Anthropic directly.
- Default model is `claude-sonnet-5`, matching `.env.example`.
- **No image generation.** The Anthropic API has no image endpoint, so `generate_image` always
  returns `""` and figure generation degrades to `> Figure concept: …` text placeholders. The
  paper prompt no longer asks for `[IMAGE_PROMPT]` tokens, though the handler remains as a
  safety net for stray ones.
- Timeout: single global 120 s on a shared lazily-created `httpx.AsyncClient`.
- Retry: 3 attempts, exponential `2**attempt` backoff (no jitter) on 429/5xx/timeouts.
- Thinking: `budget_tokens` 1024–2048 when enabled, and disabled entirely whenever a JSON mime
  type is requested so the full budget goes to the answer. Enabling thinking drops
  `temperature`, which the API requires to be default in that mode.
- JSON output: no response steering is applied. Callers parse with `_parse_json_object` /
  `_parse_json_array` (`agents.py:180`, `:204`), which strip markdown fences and accept either
  an object or an array — the gap-analysis path specifically requires an array.
- Token accounting: the API's `usage` field is never read. `token_estimate` is the heuristic
  `len(draft) // 4` from the proposer only, and cost is `tokens × 0.00000035`.

No streaming code path is implemented; all calls are unary `POST /messages`.

## Retrieval

`backend/app/services/retrieval.py` implements six sources, all normalized into a common paper
dict via `_make_paper`:

| Source | Notes |
|---|---|
| `arxiv` | via the `arxiv` library, run in `asyncio.to_thread` |
| `semantic_scholar` | Graph API; retry/backoff on 429; drops papers with no abstract |
| `openalex` | reconstructs abstracts from the inverted index |
| `crossref` | synthesizes a pseudo-abstract from title/subtitle/container |
| `github_repo` | unauthenticated repo search sorted by stars |
| `web_tavily` | optional, requires `TAVILY_API_KEY` |

All six are enabled by default. Academic sources fan out across every planner query; Tavily and
GitHub are queried once against the raw topic.

**Budgets** come from `_depth_budgets` (`agents.py:354`) and are hardcoded, not config:

| depth | queries | results/query | max total | summary cap |
|---|---|---|---|---|
| `quick` | 3 | 4 | 10 | 8 |
| `standard` | 5 | 5 | 20 | 14 |
| `deep` | 6 | 6 | 36 | 22 |

**Ranking** combines title/token overlap against the topic with per-source bonuses and
penalties, applies a hard `score >= 2.5` cutoff, then round-robins across sources by a priority
list until `max_total` is reached.

**Deduplication** happens twice: exact-ish dedup by DOI-or-title in `deduplicate_papers`, and a
reporting-only O(n²) near-duplicate clustering at similarity ≥ 0.82 in `_cluster_duplicates`.
The "embedding" similarity there is a token-frequency cosine proxy, not real embeddings.

## Uploaded PDFs and the vector store

```
POST /upload/pdf → parsing.extract_text_from_pdf → parsing.chunk_text → vector_store.add_document
                                                    (1000 chars, 200 overlap)
```

ChromaDB persistent client, collection `delve_papers`, cosine space, Chroma's default embedding
function (`all-MiniLM-L6-v2`). The retrieval node queries it for the first 3 planner queries at
`n_results=5`, filtered to the session's `uploaded_paper_ids`.

## Realtime

`WS /ws/{session_id}` (`main.py:104`). The server registers the socket in a module-level
`ws_connections` dict, sends a `connected` frame, then heartbeats every 30 s. Clients may send
`{"type":"ping"}` or `{"type":"stop"}` (the latter cancels the running asyncio task).

Event types the frontend handles: `connected`, `heartbeat`, `pong`, `status`, `paper_found`,
`gap`, `debate`, `complete`, `error`. The frontend falls back to HTTP polling if the socket
cannot be established.

## Concurrency and process model

`active_sessions`, `session_tasks`, and `ws_connections` are module-level dicts. **The backend is
single-process only** — running uvicorn with `--workers > 1` breaks session lookup and WebSocket
routing. Each research run is a bare `asyncio.Task`; there is no queue, no concurrency cap, and
no backpressure.
