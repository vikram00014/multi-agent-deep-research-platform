"""
Delve – Multi-Agent Deep Research System
═════════════════════════════════════════
Main FastAPI application with WebSocket support.

Endpoints:
  POST   /research/start          – Start a new research session
  GET    /research/{id}/status    – Get session status
  GET    /research/{id}/paper     – Get completed paper
  GET    /research/sessions/list  – List all sessions
  POST   /upload/pdf              – Upload a PDF for inclusion
  WS     /ws/{session_id}         – Live progress updates
  GET    /health                  – Health check
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.llm_client import llm_client
from app.api.routes.research import (
    router as research_router,
    ws_connections,
    _startup_load_sessions,
    flush_pending_persists,
)
from app.api.routes.upload import router as upload_router

# ── Logging Setup ─────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-25s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("delve.main")


# ── Lifecycle ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Validate API key on startup, clean up on shutdown."""
    logger.info("=" * 60)
    logger.info("  Delve – Multi-Agent Deep Research System")
    logger.info("=" * 60)
    logger.info("Validating LLM API key...")

    valid = await llm_client.validate_api_key()
    if valid:
        logger.info("✓ LLM API key is valid")
    else:
        logger.warning("✗ LLM API key validation failed – LLM calls may fail")

    # Load persisted sessions from disk (moved here from a router startup hook,
    # which does not fire reliably when the app uses a lifespan handler).
    try:
        await _startup_load_sessions()
    except Exception as e:
        logger.error("Failed to load persisted sessions on startup: %s", e)

    yield

    # Shutdown
    await flush_pending_persists()
    await llm_client.close()
    logger.info("Delve shut down cleanly")


# ── FastAPI App ───────────────────────────────────────────────────────────

app = FastAPI(
    title="Delve API",
    description="Multi-Agent Deep Research & Paper Drafting System",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS (allow React dev server) ────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Include REST Routers ─────────────────────────────────────────────────
app.include_router(research_router)
app.include_router(upload_router)

# ── WebSocket Endpoint ───────────────────────────────────────────────────

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for live research progress updates.

    Clients connect here after starting a research session.
    The server sends JSON messages as each agent node runs:
      {"type": "status",      "message": "..."}
      {"type": "paper_found", "data": {...}}
      {"type": "gap",         "data": {...}}
      {"type": "complete",    "message": "...", "data": {...}}
      {"type": "error",       "message": "..."}
    """
    await websocket.accept()
    logger.info("WebSocket connected: session=%s", session_id)

    # Register connection
    if session_id not in ws_connections:
        ws_connections[session_id] = []
    ws_connections[session_id].append(websocket)

    try:
        # Send initial confirmation
        await websocket.send_json({
            "type": "connected",
            "message": f"Connected to session {session_id}",
        })

        # Keep connection alive with heartbeat pings
        while True:
            try:
                # Wait for client messages (or just keep alive)
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)

                # Handle client messages
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                    elif msg.get("type") == "stop":
                        logger.info("Client requested stop for session %s", session_id)
                        await websocket.send_json({
                            "type": "status",
                            "message": "Stop requested (cancelling task)",
                        })
                        from app.api.routes.research import session_tasks
                        if session_id in session_tasks and not session_tasks[session_id].done():
                            session_tasks[session_id].cancel()
                except Exception:
                    pass

            except asyncio.TimeoutError:
                # Send heartbeat ping
                try:
                    await websocket.send_json({"type": "heartbeat"})
                except Exception:
                    break

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: session=%s", session_id)
    except Exception as e:
        logger.error("WebSocket error for session %s: %s", session_id, e)
    finally:
        # Unregister connection
        if session_id in ws_connections and websocket in ws_connections[session_id]:
            ws_connections[session_id].remove(websocket)


# ── Health Check ──────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "Delve",
        "version": "1.0.0",
    }


# ── Main Entry Point ─────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level="info",
    )
