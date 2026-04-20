"""
ORION Configuration Module
──────────────────────────
Loads environment variables via pydantic-settings.
All API keys and paths are centralized here.
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from pathlib import Path


class Settings(BaseSettings):
    """Application settings loaded from .env file."""

    # ── Vertex AI Gemini 2.5 Pro ──────────────────────────────────────────
    vertex_api_key: str = Field(
        ...,
        description="Google Vertex AI API key (Express Mode).",
    )
    vertex_base_url: str = Field(
        default="https://aiplatform.googleapis.com/v1/publishers/google/models",
        description="Vertex AI base URL.",
    )
    vertex_model: str = Field(
        default="gemini-2.5-pro",
        description="Gemini model name.",
    )

    # ── Tavily Web Search ─────────────────────────────────────────────────
    tavily_api_key: str = Field(
        default="",
        description="Tavily API key for web search (optional).",
    )

    # ── ChromaDB ──────────────────────────────────────────────────────────
    chroma_persist_dir: str = Field(
        default="./chroma_data",
        description="ChromaDB persistence directory.",
    )

    # ── LangGraph SQLite Checkpoint ───────────────────────────────────────
    sqlite_checkpoint_path: str = Field(
        default="./orion_checkpoints.db",
        description="SQLite DB path for LangGraph state persistence.",
    )

    # ── Session Store (persistent local JSON) ─────────────────────────────
    session_store_path: str = Field(
        default="./orion_sessions.json",
        description="Path for persisted session metadata/results/timeline.",
    )

    # ── Retrieval Tuning ───────────────────────────────────────────────────
    max_search_queries: int = Field(
        default=4,
        description="Max planner queries to execute per session.",
    )
    max_source_results_per_query: int = Field(
        default=4,
        description="Max results fetched per source/query pair.",
    )
    semantic_scholar_max_retries: int = Field(
        default=3,
        description="Retry attempts for Semantic Scholar on rate limits/transient failures.",
    )
    semantic_scholar_base_backoff_seconds: float = Field(
        default=2.0,
        description="Base backoff for Semantic Scholar retry delays.",
    )
    max_debate_rounds: int = Field(
        default=1,
        description="Default max critic rounds in proposer/critic loop.",
    )
    strict_synthesis_mode: bool = Field(
        default=False,
        description="If true, synthesis prompts enforce stricter evidence-grounded writing.",
    )

    # ── Server ────────────────────────────────────────────────────────────
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }

    @property
    def generate_content_url(self) -> str:
        """Full URL for Gemini generateContent endpoint."""
        return f"{self.vertex_base_url}/{self.vertex_model}:generateContent?key={self.vertex_api_key}"

    @property
    def stream_generate_url(self) -> str:
        """Full URL for Gemini streamGenerateContent endpoint."""
        return f"{self.vertex_base_url}/{self.vertex_model}:streamGenerateContent?key={self.vertex_api_key}"


# Singleton instance
settings = Settings()
