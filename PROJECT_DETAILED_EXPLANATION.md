# ORION Project Detailed Explanation

## 1. What this project is

ORION is a multi-agent deep-research platform that takes a topic, gathers evidence from multiple sources, critiques its own synthesis, finds research gaps, and produces a structured final paper with quality signals.

It combines:
- **Backend:** FastAPI + LangGraph orchestration + Vertex Gemini + ChromaDB
- **Frontend:** React + Vite UI with live pipeline feed and session history
- **Persistence:** JSON session store + per-session artifact files + vector DB for uploaded PDFs

---

## 2. Number of agents and what each agent does

ORION uses **7 graph nodes (agents/stages)** in the LangGraph pipeline:

1. **Planner (`planner_node`)**
   - Creates 3–5 focused search queries and a research plan.
   - Enforces query quality constraints (quoted phrase, narrowing terms, lexical overlap with topic).

2. **Retrieval (`retrieval_node`)**
   - Fetches papers from:
     - ArXiv
     - Semantic Scholar
     - Tavily web search (optional via API key)
   - Applies topic-aware relevance scoring and filters off-topic drift.
   - Deduplicates and clusters near-duplicate papers.
   - Queries ChromaDB for uploaded PDF chunks.

3. **Summarizer (`summarizer_node`)**
   - Summarizes top papers into structured JSON (`summary`, `limitation`).
   - Computes citation quality and verification metadata per source.

4. **Proposer (`proposer_node`)**
   - Drafts literature review synthesis from summaries.
   - Supports strict evidence-grounded mode.

5. **Critic (`critic_node`)**
   - Reviews proposer draft for unsupported claims and imbalance.
   - Sends critique back into debate loop.

6. **Gap Analysis (`gap_analysis_node`)**
   - Produces structured research gaps (`title`, `evidence`, `proposed_direction`).
   - Includes JSON repair retry, synthesis fallback, minimum-gap enforcement, and gap quality cleanup.

7. **Paper Architect (`paper_architect_node`)**
   - Builds final publication-style markdown paper.
   - Applies deterministic citation normalization by selected format.
   - Builds bibliography, claim-evidence links, and format compliance scoring.

---

## 3. Full pipeline flow

Defined in `backend/app/core/graph.py`:

`planner -> retrieval -> summarizer -> proposer <-> critic (loop) -> gap_analysis -> paper_architect -> END`

Debate loop logic (`debate_should_continue`):
- Runs critic rounds until `max_debate_rounds` is reached (clamped 1..5).
- Then exits to gap analysis.

---

## 4. Data/state model (ResearchState)

Shared state lives in `backend/app/core/state.py` and includes:

- **Inputs:** topic, uploaded PDF ids
- **Planner outputs:** queries, plan, constraints, strict mode, debate rounds, paper format
- **Retrieval outputs:** retrieved papers, vector results, source counts, duplicate clusters
- **Summarizer outputs:** paper summaries, citation quality, citation verification
- **Debate outputs:** draft text, debate log, round/token estimate
- **Gap outputs:** identified gaps
- **Final outputs:** paper markdown, bibliography, claim-evidence map, verified citation count, debate rounds, format compliance

---

## 5. Backend API architecture

Main APIs live in `backend/app/api/routes/research.py`.

### Core session lifecycle
- `POST /research/start` – start run with controls
- `POST /research/{id}/cancel` – cancel run
- `POST /research/{id}/retry` – rerun session
- `POST /research/{id}/resume` – resume cancelled/error run
- `DELETE /research/{id}` – delete session

### Session read APIs
- `GET /research/{id}/status`
- `GET /research/{id}/detail`
- `GET /research/{id}/paper`
- `GET /research/{id}/timeline`
- `GET /research/sessions/list`

### Export/resources
- `GET /research/{id}/export`
- `GET /research/{id}/resources/list`
- `GET /research/{id}/resources/download/{file_name}`

### Upload + realtime
- `POST /upload/pdf` (`backend/app/api/routes/upload.py`)
- `WS /ws/{session_id}` (`backend/app/main.py`)

---

## 6. Persistence and artifacts

### Session persistence
- Stored in JSON: `backend/orion_sessions.json`
- Includes timeline, controls, metrics, result payloads.

### Per-session artifacts
- Saved in: `backend/resources/<session_id>/`
- Files include:
  - `paper.md`
  - `bibliography.json`
  - `paper_summaries.json`
  - `claim_evidence_map.json`
  - `gaps.json`
  - `source_counts.json`
  - `timeline.json`
  - `export_bundle.json`

### Vector storage for uploads
- ChromaDB persistent directory from config (`CHROMA_PERSIST_DIR` / `chroma_persist_dir`)
- Collection: `orion_papers`

---

## 7. Quality/reliability mechanisms already implemented

1. **Topic drift control**
   - Relevance scoring against topic/query tokens
   - Penalty terms for known off-domain drift patterns

2. **Deduplication + cluster visibility**
   - Title/DOI dedupe + semantic duplicate cluster reporting

3. **Citation quality and verification**
   - Per-source confidence and verification flags

4. **Gap robustness**
   - JSON parsing + repair retry
   - Fallback synthesis when sparse
   - Post-cleanup for actionable, deduped gaps

5. **Format enforcement**
   - Supports `academic`, `ieee`, `apa`, `acm`, `mla`
   - Deterministic post-normalization + generated references section
   - Format compliance score + pass/fail checks

6. **Claim-evidence links**
   - Extracted from actual paper citation markers

7. **Resilience**
   - Semantic Scholar retry/backoff
   - LLM retry handling
   - Session persistence debouncing

8. **Observability**
   - Live WebSocket events (`status`, `paper_found`, `gap`, `debate`, `complete`, `error`)
   - Timeline replay for historical sessions

---

## 8. Frontend architecture and pages

Main frontend orchestrator: `frontend/src/App.tsx`

Tabs/pages:
1. **New Research**
   - Topic input
   - Strict mode toggle
   - Debate rounds selector
   - Paper format selector
   - PDF upload integration

2. **Research Feed**
   - Real-time pipeline progress and event stream
   - Step indicator and counters
   - Debate snippets and gap cards

3. **Final Paper**
   - Rendered markdown paper
   - Signals: gaps, references, claim-evidence links, debate rounds, verified citations, format compliance
   - Copy/download/print actions

4. **Analytics**
   - Session-level aggregate metrics and status distribution

5. **Resources**
   - Session summary
   - Export and markdown download options
   - Saved artifact file list and direct download links

Supporting components:
- `Sidebar.tsx` – session list, status, select/delete
- `ResearchFeed.tsx` – progress + event cards
- `PaperViewer.tsx` – final paper and trust signals
- `useWebSocket.ts` – WS lifecycle, reconnect control, timeline preload
- `api.ts` – frontend API client

---

## 9. Config and runtime controls

From `backend/app/core/config.py`:

- `VERTEX_API_KEY` (required)
- `TAVILY_API_KEY` (optional)
- `CHROMA_PERSIST_DIR`
- `SQLITE_CHECKPOINT_PATH`
- `SESSION_STORE_PATH`
- `MAX_SEARCH_QUERIES`
- `MAX_SOURCE_RESULTS_PER_QUERY`
- `SEMANTIC_SCHOLAR_MAX_RETRIES`
- `SEMANTIC_SCHOLAR_BASE_BACKOFF_SECONDS`
- `MAX_DEBATE_ROUNDS`
- `STRICT_SYNTHESIS_MODE`
- `HOST`, `PORT`

Per-run controls accepted by `/research/start`:
- `strict_mode`
- `max_debate_rounds`
- `paper_format`
- `depth`
- `year_from`
- `include_sources`
- `exclude_sources`

---

## 10. How to use the full system end-to-end

1. Start backend and frontend.
2. Open UI and go to **New Research**.
3. Enter topic, choose strict mode/debate rounds/format.
4. Optionally upload PDFs (for private corpus grounding).
5. Start research.
6. Track execution in **Research Feed**.
7. Read output in **Final Paper**.
8. Inspect trust/quality metrics (verified citations, claim-evidence, format compliance).
9. Download artifacts from **Resources**.
10. Compare run history in **Analytics** and sidebar sessions.

---

## 11. Why this system is useful

ORION is useful when you need:
- fast literature synthesis with transparent pipeline stages,
- evidence-aware draft generation instead of one-shot prompting,
- structured research gaps for roadmap planning,
- reproducible session artifacts and exportable evidence,
- multi-run comparison and iterative refinement.

It is especially practical for:
- thesis/dissertation scoping,
- regulatory/clinical literature reviews,
- technical landscape and benchmark surveys,
- R&D gap analysis workflows.

---

## 12. Known practical constraints

- Quality depends on source quality and API availability.
- Tavily web sources may be noisier than indexed academic sources.
- Citation verification is heuristic (metadata-driven), not a formal bibliographic validator.
- Format compliance is strong but still markdown-text based (not a full citation-style compiler).
- LLM outputs can vary by topic complexity and retrieval coverage.

---

## 13. Key files map

### Backend
- `backend/app/main.py` – FastAPI app + WebSocket endpoint
- `backend/app/core/graph.py` – LangGraph orchestration
- `backend/app/core/state.py` – shared typed state
- `backend/app/core/agents.py` – all agent logic
- `backend/app/core/llm_client.py` – Vertex Gemini client + retry logic
- `backend/app/core/config.py` – settings
- `backend/app/services/retrieval.py` – ArXiv/Semantic Scholar/Tavily
- `backend/app/services/parsing.py` – PDF text extraction/chunking
- `backend/app/services/vector_store.py` – ChromaDB store/query
- `backend/app/api/routes/research.py` – session APIs and persistence
- `backend/app/api/routes/upload.py` – PDF upload API

### Frontend
- `frontend/src/App.tsx` – page orchestration and controls
- `frontend/src/api.ts` – API client
- `frontend/src/hooks/useWebSocket.ts` – websocket hook
- `frontend/src/components/Sidebar.tsx` – session navigation
- `frontend/src/components/ResearchFeed.tsx` – live pipeline feed
- `frontend/src/components/PaperViewer.tsx` – final paper and quality signals
- `frontend/src/types.ts` – frontend types/contracts

---

## 14. Current maturity summary

ORION is currently a **strong multi-agent research platform** with:
- complete end-to-end orchestration,
- session durability,
- quality signals,
- resources/export workflows,
- and a polished operator-facing UI.

The system is already solid for serious research-assistant usage and iterative topic exploration workflows.
