"""
ORION API Dependencies
───────────────────────
Shared dependencies for FastAPI route injection.
"""

from app.core.llm_client import gemini_client
from app.services.vector_store import vector_store


async def get_llm_client():
    """Dependency: returns the Vertex Gemini client singleton."""
    return gemini_client


async def get_vector_store():
    """Dependency: returns the ChromaDB vector store singleton."""
    return vector_store
