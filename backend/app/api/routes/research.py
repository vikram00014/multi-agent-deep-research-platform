"""
ORION Research Routes
──────────────────────
POST /research/start              – Start a new research session
POST /research/{id}/cancel        – Request cancel
POST /research/{id}/retry         – Retry failed/completed session
DELETE /research/{id}             – Delete a saved session
GET  /research/{id}/status        – Get session status
GET  /research/{id}/detail        – Rich session detail
GET  /research/{id}/paper         – Get completed paper
GET  /research/{id}/chat          – Get research chat history
POST /research/{id}/chat          – Chat with session context
GET  /research/{id}/timeline      – Timeline events
GET  /research/{id}/export        – Markdown/PDF/BibTeX/JSON bundle
GET  /research/sessions/list      – List all sessions
"""

from __future__ import annotations

import asyncio
import html
import json
import logging
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, WebSocket
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field, field_validator

from app.core.agents import _debate_snippet
from app.core.config import settings
from app.core.llm_client import llm_client
from app.services.pdf_export import generate_research_pdf

logger = logging.getLogger("orion.api.research")

router = APIRouter(prefix="/research", tags=["research"])

ALLOWED_PAPER_FORMATS = {"academic", "ieee", "apa", "acm", "mla"}
ALLOWED_DEPTHS = {"quick", "standard", "deep"}
ALLOWED_SOURCES = {"arxiv", "semantic_scholar", "openalex", "crossref", "github_repo", "web_tavily"}
SAFE_SESSION_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


class StartResearchRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=500)
    uploaded_paper_ids: list[str] = Field(default_factory=list)
    max_debate_rounds: int | None = Field(default=None, ge=0, le=5)
    strict_mode: bool | None = None
    paper_format: Literal["academic", "ieee", "apa", "acm", "mla"] | None = "academic"
    depth: Literal["quick", "standard", "deep"] | None = "standard"
    year_from: int | None = Field(default=None, ge=1900, le=2100)
    include_sources: list[str] | None = None
    exclude_sources: list[str] | None = None

    @field_validator("topic")
    @classmethod
    def _clean_topic(cls, value: str) -> str:
        topic = value.strip()
        if not topic:
            raise ValueError("Topic cannot be empty")
        return topic

    @field_validator("uploaded_paper_ids")
    @classmethod
    def _validate_uploaded_ids(cls, value: list[str]) -> list[str]:
        bad = [item for item in value if not SAFE_SESSION_ID_RE.fullmatch(item)]
        if bad:
            raise ValueError("Uploaded paper ids may only contain letters, numbers, underscores, and hyphens")
        return value

    @field_validator("include_sources", "exclude_sources")
    @classmethod
    def _validate_sources(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        unknown = sorted({source for source in value if source not in ALLOWED_SOURCES})
        if unknown:
            raise ValueError(f"Unknown sources: {', '.join(unknown)}")
        return value


class StartResearchResponse(BaseModel):
    session_id: str
    message: str


class SessionStatus(BaseModel):
    session_id: str
    status: str
    current_step: str
    paper_available: bool


class SessionActionResponse(BaseModel):
    session_id: str
    status: str
    message: str


class ResearchChatRequest(BaseModel):
    message: str


class ResearchChatMessage(BaseModel):
    role: str
    content: str
    timestamp: str


class ResearchChatResponse(BaseModel):
    session_id: str
    answer: str
    history: list[ResearchChatMessage]


active_sessions: dict[str, dict[str, Any]] = {}
session_tasks: dict[str, asyncio.Task] = {}
ws_connections: dict[str, list[WebSocket]] = {}
SESSION_STORE_PATH = Path(settings.session_store_path).resolve()
RESOURCES_ROOT = SESSION_STORE_PATH.parent / "resources"
_store_lock = asyncio.Lock()
_pending_persist_tasks: dict[str, asyncio.Task] = {}


def _ensure_store_parent() -> None:
    SESSION_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESOURCES_ROOT.mkdir(parents=True, exist_ok=True)


def _safe_session_segment(session_id: str) -> str:
    if not session_id or not SAFE_SESSION_ID_RE.fullmatch(session_id):
        raise HTTPException(status_code=400, detail="Invalid session id")
    return session_id


def _session_resource_dir(session_id: str) -> Path:
    safe = _safe_session_segment(session_id)
    return (RESOURCES_ROOT / safe).resolve()


def _remove_session_resources(session_id: str) -> None:
    target = _session_resource_dir(session_id)
    root = RESOURCES_ROOT.resolve()
    if target.exists() and target.is_relative_to(root) and target != root:
        shutil.rmtree(target, ignore_errors=True)


def _validate_resource_name(name: str) -> str:
    if not name or ".." in name or "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="Invalid resource file name")
    return name


def _resource_download_url(session_id: str, filename: str) -> str:
    return f"/research/{session_id}/resources/download/{filename}"


def _rewrite_resource_links(session_id: str, markdown: str) -> str:
    safe_session = re.escape(_safe_session_segment(session_id))
    pattern = re.compile(rf"\]\(/resources/{safe_session}/([a-zA-Z0-9_.-]+)\)")
    return pattern.sub(lambda m: f"]({_resource_download_url(session_id, m.group(1))})", markdown)


def _pdf_output_path(session_id: str) -> Path:
    return _session_resource_dir(session_id) / "delve_paper.pdf"


def _ensure_pdf_generated(session_id: str, session: dict[str, Any]) -> Path:
    result = session.get("result", {}) or {}
    analysis = str(result.get("research_analysis", "") or "")
    final_draft = str(result.get("final_draft", result.get("final_paper", "")) or "")
    if not final_draft and not analysis:
        raise HTTPException(status_code=404, detail="No paper content available for PDF export")

    out_dir = _session_resource_dir(session_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = _pdf_output_path(session_id)
    generate_research_pdf(
        topic=session.get("topic", "Research Paper"),
        session_id=session_id,
        analysis_markdown=analysis,
        final_markdown=final_draft,
        out_path=out_path,
        resource_dir=out_dir,
    )
    return out_path


def _sanitize_session_for_store(session: dict[str, Any]) -> dict[str, Any]:
    result = session.get("result", {})
    return {
        "status": session.get("status", "unknown"),
        "topic": session.get("topic", ""),
        "uploaded_paper_ids": session.get("uploaded_paper_ids", []),
        "updated_at": session.get("updated_at", datetime.now(timezone.utc).isoformat()),
        "started_at": session.get("started_at", datetime.now(timezone.utc).isoformat()),
        "finished_at": session.get("finished_at"),
        "current_step": session.get("current_step", "unknown"),
        "timeline": session.get("timeline", []),
        "error": session.get("error"),
        "controls": session.get("controls", {}),
        "metrics": session.get("metrics", {}),
        "resource_files": session.get("resource_files", []),
        "chat_history": session.get("chat_history", []),
        "result": {
            "final_paper": result.get("final_paper", ""),
            "research_analysis": result.get("research_analysis", ""),
            "final_draft": result.get("final_draft", result.get("final_paper", "")),
            "gaps": result.get("gaps", []),
            "bibliography": result.get("bibliography", []),
            "debate_log": result.get("debate_log", []),
            "paper_summaries": result.get("paper_summaries", {}),
            "literature_review": result.get("literature_review", ""),
            "cross_paper_analysis": result.get("cross_paper_analysis", {}),
            "citation_quality": result.get("citation_quality", {}),
            "citation_verification": result.get("citation_verification", {}),
            "source_counts": result.get("source_counts", {}),
            "duplicate_clusters": result.get("duplicate_clusters", []),
            "gap_candidates": result.get("gap_candidates", []),
            "gap_critique": result.get("gap_critique", ""),
            "claim_to_evidence_map": result.get("claim_to_evidence_map", []),
            "debate_rounds": result.get("debate_rounds", 0),
            "verified_citations": result.get("verified_citations", 0),
            "paper_format": result.get("paper_format", session.get("controls", {}).get("paper_format", "academic")),
            "format_compliance": result.get("format_compliance", {}),
            "format_compliance_score": (result.get("format_compliance", {}) or {}).get("score", 0.0),
            "format_compliant": (result.get("format_compliance", {}) or {}).get("is_compliant", False),
        } if result else {},
    }


def _read_store_sync() -> dict[str, dict[str, Any]]:
    if not SESSION_STORE_PATH.exists():
        return {}
    try:
        with SESSION_STORE_PATH.open("r", encoding="utf-8") as f:
            payload = json.load(f)
            if isinstance(payload, dict):
                return payload
    except Exception as e:
        logger.error("Failed to read session store %s: %s", SESSION_STORE_PATH, e)
    return {}


def _write_store_sync(payload: dict[str, dict[str, Any]]) -> None:
    _ensure_store_parent()
    with SESSION_STORE_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


async def _persist_all_sessions() -> None:
    async with _store_lock:
        payload = {sid: _sanitize_session_for_store(data) for sid, data in active_sessions.items()}
        await asyncio.to_thread(_write_store_sync, payload)


async def _persist_all_sessions_debounced(key: str, delay: float = 0.8) -> None:
    existing = _pending_persist_tasks.get(key)
    if existing and not existing.done():
        existing.cancel()

    async def _job() -> None:
        try:
            await asyncio.sleep(delay)
            await _persist_all_sessions()
        except asyncio.CancelledError:
            return
        finally:
            if _pending_persist_tasks.get(key) is asyncio.current_task():
                _pending_persist_tasks.pop(key, None)

    _pending_persist_tasks[key] = asyncio.create_task(_job())


async def flush_pending_persists() -> None:
    """Cancel debounced writes and force one final flush. Called on shutdown."""
    for task in list(_pending_persist_tasks.values()):
        if not task.done():
            task.cancel()
    _pending_persist_tasks.clear()
    try:
        await _persist_all_sessions()
    except Exception as e:
        logger.error("Final session flush failed: %s", e)


async def _load_sessions_from_disk() -> None:
    async with _store_lock:
        stored = await asyncio.to_thread(_read_store_sync)
    if not stored:
        return
    active_sessions.update(stored)
    for sid in stored.keys():
        ws_connections.setdefault(sid, [])
    logger.info("Loaded %d persisted sessions from %s", len(stored), SESSION_STORE_PATH)


try:
    _boot_sessions = _read_store_sync()
    if _boot_sessions:
        active_sessions.update(_boot_sessions)
        for _sid in _boot_sessions.keys():
            ws_connections.setdefault(_sid, [])
except Exception as _e:
    logger.warning("Session store bootstrap skipped: %s", _e)


def _timeline_event(session_id: str, message: dict[str, Any]) -> None:
    session = active_sessions.get(session_id)
    if not session:
        return
    timeline = session.setdefault("timeline", [])
    timeline.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": message.get("type", "status"),
        "message": message.get("message", ""),
        "data": message.get("data", {}),
    })
    if len(timeline) > 700:
        del timeline[: len(timeline) - 700]


def _infer_step(message: str) -> str:
    lower = message.lower()
    if "planning" in lower or "query" in lower:
        return "planner"
    if "searching academic databases" in lower or "retrieved" in lower:
        return "retrieval"
    if "summariz" in lower:
        return "summarizer"
    if "draft" in lower:
        return "proposer"
    if "peer review" in lower:
        return "critic"
    if "gap" in lower:
        return "gap_analysis"
    if "assembling" in lower or "paper complete" in lower:
        return "paper_architect"
    return ""


async def broadcast_to_session(session_id: str, message: dict[str, Any]) -> None:
    session = active_sessions.get(session_id)
    if session:
        session["updated_at"] = datetime.now(timezone.utc).isoformat()
        metrics = session.setdefault("metrics", {})
        if message.get("type") == "status":
            data = message.setdefault("data", {})
            step = str((data or {}).get("node", "")).strip() or _infer_step(str(message.get("message", "")))
            if step:
                data["node"] = step
                session["current_step"] = step
            if "token_estimate" in data:
                metrics["token_estimate"] = int(data.get("token_estimate") or 0)
                metrics["cost_estimate_usd"] = round(metrics["token_estimate"] * 0.00000035, 4)
        _timeline_event(session_id, message)

    connections = ws_connections.get(session_id, [])
    dead: list[WebSocket] = []
    for ws in connections:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        connections.remove(ws)

    await _persist_all_sessions_debounced(session_id)


async def _emit_node_status(session_id: str, node: str, message: str, data: dict[str, Any] | None = None) -> None:
    payload_data = {"node": node}
    if data:
        payload_data.update(data)
    await broadcast_to_session(session_id, {
        "type": "status",
        "message": message,
        "data": payload_data,
    })


def _session_elapsed_seconds(session: dict[str, Any]) -> int:
    started = session.get("started_at")
    if not started:
        return 0
    try:
        start_dt = datetime.fromisoformat(started.replace("Z", "+00:00"))
        end_raw = session.get("finished_at")
        end_dt = datetime.fromisoformat(end_raw.replace("Z", "+00:00")) if end_raw else datetime.now(timezone.utc)
        return max(0, int((end_dt - start_dt).total_seconds()))
    except Exception:
        return 0


def _build_export_bundle(session_id: str, session: dict[str, Any]) -> dict[str, Any]:
    result = session.get("result", {})
    paper = _rewrite_resource_links(session_id, str(result.get("final_paper", "") or ""))
    analysis = _rewrite_resource_links(session_id, str(result.get("research_analysis", "") or ""))
    final_draft = _rewrite_resource_links(session_id, str(result.get("final_draft", paper) or ""))
    bibliography = result.get("bibliography", [])
    evidence = {
        "citation_quality": result.get("citation_quality", {}),
        "citation_verification": result.get("citation_verification", {}),
        "claim_to_evidence_map": result.get("claim_to_evidence_map", []),
        "duplicate_clusters": result.get("duplicate_clusters", []),
        "source_counts": result.get("source_counts", {}),
    }
    bibtex_entries = []
    for idx, b in enumerate(bibliography, start=1):
        key = f"orion{idx}"
        bibtex_entries.append(
            f"@article{{{key}, title={{{b.get('title','')}}}, author={{{b.get('authors','')}}}, year={{{b.get('year','')}}}, url={{{b.get('url','')}}}, doi={{{b.get('doi','')}}}}}"
        )
    return {
        "session_id": session_id,
        "markdown": paper,
        "analysis_markdown": analysis,
        "final_draft_markdown": final_draft,
        "pdf_text": paper,
        "bibtex": "\n\n".join(bibtex_entries),
        "evidence_json": evidence,
        "chat_history": session.get("chat_history", []),
        "timeline": session.get("timeline", []),
    }


def _save_session_resources(session_id: str, session: dict[str, Any]) -> list[dict[str, Any]]:
    """Persist fetched/derived session artifacts to disk for download."""
    result = session.get("result", {})
    if not result:
        return []

    out_dir = _session_resource_dir(session_id)
    out_dir.mkdir(parents=True, exist_ok=True)

    files_to_write: dict[str, str] = {
        "paper.md": result.get("final_paper", ""),
        "analysis.md": result.get("research_analysis", ""),
        "final_draft.md": result.get("final_draft", result.get("final_paper", "")),
        "bibliography.json": json.dumps(result.get("bibliography", []), ensure_ascii=False, indent=2),
        "paper_summaries.json": json.dumps(result.get("paper_summaries", {}), ensure_ascii=False, indent=2),
        "timeline.json": json.dumps(session.get("timeline", []), ensure_ascii=False, indent=2),
        "source_counts.json": json.dumps(result.get("source_counts", {}), ensure_ascii=False, indent=2),
        "claim_evidence_map.json": json.dumps(result.get("claim_to_evidence_map", []), ensure_ascii=False, indent=2),
        "gaps.json": json.dumps(result.get("gaps", []), ensure_ascii=False, indent=2),
        "chat_history.json": json.dumps(session.get("chat_history", []), ensure_ascii=False, indent=2),
        "export_bundle.json": json.dumps(_build_export_bundle(session_id, session), ensure_ascii=False, indent=2),
    }

    for filename, content in files_to_write.items():
        (out_dir / filename).write_text(content or "", encoding="utf-8")

    resources: list[dict[str, Any]] = []
    for p in sorted(out_dir.glob("*")):
        if not p.is_file():
            continue
        stat = p.stat()
        resources.append({
            "name": p.name,
            "size_bytes": int(stat.st_size),
            "updated_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        })
    return resources


async def run_research_pipeline(
    session_id: str,
    topic: str,
    uploaded_paper_ids: list[str],
    controls: dict[str, Any],
) -> None:
    try:
        session = active_sessions[session_id]
        session["status"] = "running"
        session["current_step"] = "planner"
        session["started_at"] = session.get("started_at", datetime.now(timezone.utc).isoformat())
        session["updated_at"] = datetime.now(timezone.utc).isoformat()
        session["finished_at"] = None
        session["controls"] = controls
        await _persist_all_sessions()

        async def ws_callback(msg: dict[str, Any]) -> None:
            await broadcast_to_session(session_id, msg)

        initial_state: dict[str, Any] = {
            "topic": topic,
            "uploaded_paper_ids": uploaded_paper_ids,
            "session_id": session_id,
            "retrieved_papers": [],
            "vector_results": [],
            "paper_summaries": {},
            "debate_log": [],
            "identified_gaps": [],
            "bibliography": [],
            "strict_mode": bool(controls.get("strict_mode", settings.strict_synthesis_mode)),
            "max_debate_rounds": int(controls.get("max_debate_rounds", settings.max_debate_rounds)),
            "paper_format": str(controls.get("paper_format", "academic")),
            "planner_constraints": {
                "depth": controls.get("depth", "standard"),
                "year_from": controls.get("year_from"),
                "include_sources": controls.get("include_sources", []),
                "exclude_sources": controls.get("exclude_sources", []),
            },
        }

        config = {"configurable": {"thread_id": session_id, "ws_callback": ws_callback}}

        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
        from app.core.graph import build_research_graph
        
        await _emit_node_status(session_id, "planner", f"Starting research on: {topic}")
        
        async with AsyncSqliteSaver.from_conn_string(settings.sqlite_checkpoint_path) as checkpointer:
            graph = build_research_graph(checkpointer=checkpointer)
            final_state = await graph.ainvoke(initial_state, config=config)

        debate_log = final_state.get("debate_log", [])
        proposer_entries = [d for d in debate_log if isinstance(d, str) and d.startswith("[PROPOSER]")]
        critic_entries = [d for d in debate_log if isinstance(d, str) and d.startswith("[CRITIC]")]

        result = {
            "final_paper": final_state.get("final_paper_markdown", ""),
            "research_analysis": final_state.get("research_analysis_markdown", ""),
            "final_draft": final_state.get("final_draft_markdown", final_state.get("final_paper_markdown", "")),
            "gaps": final_state.get("identified_gaps", []),
            "gap_candidates": final_state.get("generated_gap_candidates", []),
            "gap_critique": final_state.get("gap_critique", ""),
            "bibliography": final_state.get("bibliography", []),
            "debate_log": debate_log,
            "paper_summaries": final_state.get("paper_summaries", {}),
            "literature_review": final_state.get("literature_review_draft", ""),
            "cross_paper_analysis": final_state.get("cross_paper_analysis", {}),
            "citation_quality": final_state.get("citation_quality", {}),
            "citation_verification": final_state.get("citation_verification", {}),
            "source_counts": final_state.get("source_counts", {}),
            "duplicate_clusters": final_state.get("duplicate_clusters", []),
            "claim_to_evidence_map": final_state.get("claim_to_evidence_map", []),
            "debate_rounds": final_state.get("debate_rounds", len(critic_entries)),
            "verified_citations": final_state.get("verified_citations", 0),
            "paper_format": controls.get("paper_format", "academic"),
            "format_compliance": final_state.get("format_compliance", {}),
        }

        session.update({
            "status": "complete",
            "current_step": "complete",
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "result": result,
            "metrics": {
                "elapsed_seconds": _session_elapsed_seconds(session),
                "token_estimate": int(final_state.get("token_estimate", 0)),
                "cost_estimate_usd": round(max(0, int(final_state.get("token_estimate", 0))) * 0.00000035, 4),
                "error_count": 0,
            },
        })
        session["resource_files"] = await asyncio.to_thread(_save_session_resources, session_id, session)

        for idx, _entry in enumerate(proposer_entries, start=1):
            await broadcast_to_session(session_id, {
                "type": "debate",
                "message": f"Debate round {idx}: proposer draft prepared",
                "data": {
                    "round": idx,
                    "speaker": "proposer",
                    "node": "proposer",
                    "snippet": _debate_snippet(_entry),
                },
            })
            if idx <= len(critic_entries):
                await broadcast_to_session(session_id, {
                    "type": "debate",
                    "message": f"Debate round {idx}: critic feedback delivered",
                    "data": {
                        "round": idx,
                        "speaker": "critic",
                        "node": "critic",
                        "snippet": _debate_snippet(critic_entries[idx - 1]),
                    },
                })

        await broadcast_to_session(session_id, {
            "type": "complete",
            "message": "Research complete! Paper is ready.",
            "data": {
                "paper_length": len(result["final_paper"]),
                "num_gaps": len(result["gaps"]),
                "num_references": len(result["bibliography"]),
                "node": "complete",
                "token_estimate": session.get("metrics", {}).get("token_estimate", 0),
                "cost_estimate_usd": session.get("metrics", {}).get("cost_estimate_usd", 0),
                "debate_rounds": result.get("debate_rounds", 0),
                "verified_citations": result.get("verified_citations", 0),
                "format_compliance_score": (result.get("format_compliance", {}) or {}).get("score", 0.0),
            },
        })

    except asyncio.CancelledError:
        session = active_sessions.get(session_id)
        if session:
            session["status"] = "cancelled"
            session["current_step"] = "cancelled"
            session["updated_at"] = datetime.now(timezone.utc).isoformat()
            session["finished_at"] = datetime.now(timezone.utc).isoformat()
        await broadcast_to_session(session_id, {
            "type": "status",
            "message": "Research cancelled by user.",
            "data": {"node": "cancelled"},
        })
        raise
    except Exception as e:
        logger.error("Research pipeline failed for session %s: %s", session_id, e, exc_info=True)
        session = active_sessions.get(session_id)
        if session:
            session["status"] = "error"
            session["current_step"] = "error"
            session["updated_at"] = datetime.now(timezone.utc).isoformat()
            session["finished_at"] = datetime.now(timezone.utc).isoformat()
            session["error"] = str(e)
            metrics = session.setdefault("metrics", {})
            metrics["error_count"] = int(metrics.get("error_count", 0)) + 1
        await broadcast_to_session(session_id, {
            "type": "error",
            "message": f"Research failed: {str(e)[:200]}",
            "data": {"node": "error"},
        })
    finally:
        session_tasks.pop(session_id, None)


async def _startup_load_sessions() -> None:
    """Load persisted sessions from disk. Invoked from the app lifespan handler."""
    await _load_sessions_from_disk()


@router.post("/start", response_model=StartResearchResponse)
async def start_research(request: StartResearchRequest) -> StartResearchResponse:
    if not request.topic.strip():
        raise HTTPException(status_code=400, detail="Topic cannot be empty")

    session_id = str(uuid.uuid4())
    requested_rounds = (
        int(request.max_debate_rounds)
        if request.max_debate_rounds is not None
        else int(settings.max_debate_rounds)
    )
    controls = {
        "max_debate_rounds": max(0, min(5, requested_rounds)),
        "strict_mode": bool(request.strict_mode) if request.strict_mode is not None else bool(settings.strict_synthesis_mode),
        "paper_format": (request.paper_format or "academic").strip().lower(),
        "depth": request.depth or "standard",
        "year_from": request.year_from,
        "include_sources": request.include_sources or [],
        "exclude_sources": request.exclude_sources or [],
    }
    active_sessions[session_id] = {
        "status": "initializing",
        "current_step": "initializing",
        "topic": request.topic,
        "uploaded_paper_ids": request.uploaded_paper_ids,
        "controls": controls,
        "metrics": {"elapsed_seconds": 0, "token_estimate": 0, "cost_estimate_usd": 0, "error_count": 0},
        "started_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": None,
        "timeline": [],
        "chat_history": [],
    }
    ws_connections[session_id] = []
    await _persist_all_sessions()

    task = asyncio.create_task(run_research_pipeline(
        session_id=session_id,
        topic=request.topic,
        uploaded_paper_ids=request.uploaded_paper_ids,
        controls=controls,
    ))
    session_tasks[session_id] = task

    return StartResearchResponse(session_id=session_id, message=f"Research started for: {request.topic}")


@router.post("/{session_id}/cancel", response_model=SessionActionResponse)
async def cancel_session(session_id: str) -> SessionActionResponse:
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    task = session_tasks.get(session_id)
    if task and not task.done():
        task.cancel()
        return SessionActionResponse(session_id=session_id, status="cancelled", message="Cancellation requested")
    return SessionActionResponse(session_id=session_id, status=session.get("status", "unknown"), message="Session is not running")


@router.post("/{session_id}/retry", response_model=SessionActionResponse)
async def retry_session(session_id: str) -> SessionActionResponse:
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session_tasks.get(session_id) and not session_tasks[session_id].done():
        raise HTTPException(status_code=400, detail="Session is currently running")
    session["status"] = "initializing"
    session["current_step"] = "initializing"
    session["error"] = None
    session["finished_at"] = None
    session["updated_at"] = datetime.now(timezone.utc).isoformat()
    session["timeline"] = []
    session["chat_history"] = []
    await _persist_all_sessions()
    task = asyncio.create_task(run_research_pipeline(
        session_id=session_id,
        topic=session.get("topic", ""),
        uploaded_paper_ids=session.get("uploaded_paper_ids", []),
        controls=session.get("controls", {}),
    ))
    session_tasks[session_id] = task
    return SessionActionResponse(session_id=session_id, status="running", message="Retry started")


@router.post("/{session_id}/resume", response_model=SessionActionResponse)
async def resume_session(session_id: str) -> SessionActionResponse:
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("status") not in {"cancelled", "error"}:
        raise HTTPException(status_code=400, detail="Only cancelled/error sessions can be resumed")
    return await retry_session(session_id)


@router.delete("/{session_id}", response_model=SessionActionResponse)
async def delete_session(session_id: str) -> SessionActionResponse:
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    task = session_tasks.get(session_id)
    if task and not task.done():
        raise HTTPException(status_code=400, detail="Cannot delete a running session")

    active_sessions.pop(session_id, None)
    session_tasks.pop(session_id, None)
    ws_connections.pop(session_id, None)
    await asyncio.to_thread(_remove_session_resources, session_id)
    await _persist_all_sessions()
    return SessionActionResponse(session_id=session_id, status="deleted", message="Session deleted")


@router.get("/{session_id}/status", response_model=SessionStatus)
async def get_session_status(session_id: str) -> SessionStatus:
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionStatus(
        session_id=session_id,
        status=session.get("status", "unknown"),
        current_step=session.get("current_step", "unknown"),
        paper_available=bool(session.get("result", {}).get("final_paper")),
    )


@router.get("/{session_id}/detail")
async def get_session_detail(session_id: str) -> dict[str, Any]:
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    metrics = session.get("metrics", {})
    detail = {
        "session_id": session_id,
        "topic": session.get("topic", ""),
        "status": session.get("status", "unknown"),
        "current_step": session.get("current_step", "unknown"),
        "started_at": session.get("started_at"),
        "finished_at": session.get("finished_at"),
        "elapsed_seconds": _session_elapsed_seconds(session),
        "source_counts": session.get("result", {}).get("source_counts", {}),
        "duplicate_clusters": session.get("result", {}).get("duplicate_clusters", []),
        "error": session.get("error"),
        "error_badge": "none" if not session.get("error") else "present",
        "token_estimate": metrics.get("token_estimate", 0),
        "cost_estimate_usd": metrics.get("cost_estimate_usd", 0),
        "controls": session.get("controls", {}),
        "uploaded_paper_ids": session.get("uploaded_paper_ids", []),
        "resource_files": session.get("resource_files", []),
    }
    return detail


@router.get("/{session_id}/paper")
async def get_paper(session_id: str) -> dict[str, Any]:
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("status") != "complete":
        raise HTTPException(status_code=400, detail=f"Session is {session.get('status')}, paper not ready")
    result = session.get("result", {})
    final_paper = _rewrite_resource_links(session_id, str(result.get("final_paper", "") or ""))
    final_draft = _rewrite_resource_links(
        session_id,
        str(result.get("final_draft", result.get("final_paper", "")) or ""),
    )
    analysis = _rewrite_resource_links(session_id, str(result.get("research_analysis", "") or ""))
    return {
        "session_id": session_id,
        "paper": final_paper,
        "analysis": analysis,
        "final_draft": final_draft,
        "gaps": result.get("gaps", []),
        "bibliography": result.get("bibliography", []),
        "debate_log": result.get("debate_log", []),
        "timeline": session.get("timeline", []),
        "cross_paper_analysis": result.get("cross_paper_analysis", {}),
        "gap_candidates": result.get("gap_candidates", []),
        "gap_critique": result.get("gap_critique", ""),
        "citation_quality": result.get("citation_quality", {}),
        "citation_verification": result.get("citation_verification", {}),
        "claim_to_evidence_map": result.get("claim_to_evidence_map", []),
        "source_counts": result.get("source_counts", {}),
        "duplicate_clusters": result.get("duplicate_clusters", []),
        "debate_rounds": result.get("debate_rounds", 0),
        "verified_citations": result.get("verified_citations", 0),
        "paper_format": result.get("paper_format", session.get("controls", {}).get("paper_format", "academic")),
        "format_compliance": result.get("format_compliance", {}),
    }


def _research_chat_context(session: dict[str, Any]) -> str:
    result = session.get("result", {}) or {}
    context = {
        "topic": session.get("topic", ""),
        "status": session.get("status", "unknown"),
        "paper_ready": bool(result.get("final_paper")),
        "literature_review": str(result.get("literature_review", ""))[:5000],
        "analysis": str(result.get("research_analysis", ""))[:5000],
        "cross_paper_analysis": result.get("cross_paper_analysis", {}),
        "gaps": result.get("gaps", []),
        "source_counts": result.get("source_counts", {}),
        "format_compliance": result.get("format_compliance", {}),
    }
    return json.dumps(context, ensure_ascii=False, indent=2)


@router.get("/{session_id}/chat")
async def get_chat_history(session_id: str) -> dict[str, Any]:
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": session_id,
        "history": session.get("chat_history", []),
    }


@router.post("/{session_id}/chat", response_model=ResearchChatResponse)
async def chat_with_research(session_id: str, request: ResearchChatRequest) -> ResearchChatResponse:
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    user_message = request.message.strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    history = session.setdefault("chat_history", [])
    now_iso = datetime.now(timezone.utc).isoformat()
    history.append({"role": "user", "content": user_message, "timestamp": now_iso})

    recent_turns = history[-8:]
    conversation_text = "\n".join(
        f"{m.get('role', 'user').upper()}: {str(m.get('content', '')).strip()[:700]}"
        for m in recent_turns
        if str(m.get("content", "")).strip()
    )

    rag_context = ""
    uploaded_ids = session.get("uploaded_paper_ids", [])
    if uploaded_ids:
        from app.services.vector_store import vector_store
        chunks = await asyncio.to_thread(vector_store.query, user_message, 10, uploaded_ids)
        if chunks:
            rag_context = "Relevant excerpts from uploaded documents:\n"
            for c in chunks:
                rag_context += f"- {c['text']}\n"

    system_prompt = (
        "You are ORION Research Discussion Assistant. You answer questions about the selected research session. "
        "Stay grounded in the provided session context and the relevant RAG document excerpts. Be concrete and analytical. "
        "If information is missing in session context, clearly say it is not available yet."
    )
    user_prompt = (
        "Session context:\n"
        f"{_research_chat_context(session)}\n\n"
        f"{rag_context}\n\n"
        "Recent conversation:\n"
        f"{conversation_text}\n\n"
        "User question:\n"
        f"{user_message}\n\n"
        "Respond with a practical, concise answer focused on this research."
    )

    answer = await llm_client.generate_with_system(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.3,
        max_output_tokens=1500,
        enable_thinking=True,
    )
    cleaned_answer = (answer or "").strip() or "I could not generate a response for this question."
    history.append({
        "role": "assistant",
        "content": cleaned_answer,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    if len(history) > 80:
        del history[: len(history) - 80]

    session["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _persist_all_sessions_debounced(f"{session_id}-chat", delay=0.2)

    return ResearchChatResponse(
        session_id=session_id,
        answer=cleaned_answer,
        history=[
            ResearchChatMessage(
                role=str(m.get("role", "assistant")),
                content=str(m.get("content", "")),
                timestamp=str(m.get("timestamp", "")),
            )
            for m in history
        ],
    )


@router.get("/{session_id}/timeline")
async def get_timeline(session_id: str) -> dict[str, Any]:
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session_id": session_id, "timeline": session.get("timeline", [])}


@router.get("/{session_id}/export")
async def export_session_bundle(session_id: str) -> dict[str, Any]:
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("status") != "complete":
        raise HTTPException(status_code=400, detail="Session not complete")
    return _build_export_bundle(session_id, session)


@router.get("/{session_id}/paper.pdf")
async def download_paper_pdf(session_id: str) -> FileResponse:
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("status") != "complete":
        raise HTTPException(status_code=400, detail=f"Session is {session.get('status')}, paper not ready")

    out_path = await asyncio.to_thread(_ensure_pdf_generated, session_id, session)
    session["resource_files"] = await asyncio.to_thread(_save_session_resources, session_id, session)
    await _persist_all_sessions_debounced(f"{session_id}-pdf", delay=0.1)
    return FileResponse(
        path=str(out_path),
        filename=f"delve-paper-{session_id[:8]}.pdf",
        media_type="application/pdf",
    )


@router.get("/{session_id}/resources/list")
async def list_session_resources(session_id: str) -> dict[str, Any]:
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("status") == "complete" and not session.get("resource_files"):
        session["resource_files"] = await asyncio.to_thread(_save_session_resources, session_id, session)
        await _persist_all_sessions_debounced(session_id, delay=0.1)
    return {"session_id": session_id, "resources": session.get("resource_files", [])}


@router.get("/{session_id}/resources/download/{file_name}")
async def download_session_resource(session_id: str, file_name: str) -> FileResponse:
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    safe_name = _validate_resource_name(file_name)
    base = _session_resource_dir(session_id)
    target = (base / safe_name).resolve()
    if not target.is_relative_to(base):
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Resource file not found")
    return FileResponse(path=str(target), filename=target.name, media_type="application/octet-stream")

@router.get("/{session_id}/slides", response_class=HTMLResponse)
async def get_presentation_slides(session_id: str) -> str:
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    paper_md = _rewrite_resource_links(session_id, str(session.get("result", {}).get("final_paper", "") or ""))
    if not paper_md:
        raise HTTPException(status_code=404, detail="Final paper not generated yet")
    
    # Simple split to create slides. We split by major headings.
    import re
    sections = re.split(r'\n(?=#{1,2} )', paper_md)
    slides_html = ""
    for sec in sections:
        sec_clean = sec.strip()
        if not sec_clean:
            continue
        safe_markdown = sec_clean.replace("</script", "<\\/script")
        slides_html += f"""
        <section data-markdown>
            <script type="text/template">
{safe_markdown}
            </script>
        </section>"""

    topic = html.escape(session.get("topic", "Research Presentation"))
    
    reveal_html = f"""<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <title>{topic} - ORION Presentation</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/reset.css">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/reveal.css">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/theme/black.css" id="theme">
        <style>
            .reveal h1, .reveal h2, .reveal h3 {{ text-transform: none; }}
            .reveal pre {{ width: 100%; box-shadow: none; font-size: 0.55em; }}
            .reveal blockquote {{ width: 100%; font-size: 0.8em; border-left: 4px solid #38bdf8; background: rgba(56,189,248,0.1); padding: 1em; }}
            .reveal ul, .reveal ol {{ font-size: 0.8em; line-height: 1.5; }}
            .reveal p {{ font-size: 0.8em; line-height: 1.5; text-align: left; }}
        </style>
    </head>
    <body>
        <div class="reveal">
            <div class="slides">
                {slides_html}
            </div>
        </div>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/reveal.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/plugin/markdown/markdown.js"></script>
        <script>
            Reveal.initialize({{
                hash: true,
                slideNumber: 'c/t',
                plugins: [ RevealMarkdown ]
            }});
        </script>
    </body>
</html>"""
    return reveal_html

@router.get("/sessions/list")
async def list_sessions() -> dict[str, list[dict[str, Any]]]:
    sessions: list[dict[str, Any]] = []
    for sid, data in active_sessions.items():
        sessions.append({
            "session_id": sid,
            "topic": data.get("topic", ""),
            "status": data.get("status", "unknown"),
            "current_step": data.get("current_step", "unknown"),
            "created_at": data.get("started_at", ""),
            "updated_at": data.get("updated_at", ""),
            "token_estimate": data.get("metrics", {}).get("token_estimate", 0),
            "cost_estimate_usd": data.get("metrics", {}).get("cost_estimate_usd", 0),
        })
    sessions.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return {"sessions": sessions}
