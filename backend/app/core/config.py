"""
Delve Configuration Module
──────────────────────────
Loads environment variables via pydantic-settings.
All API keys and paths are centralized here.
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from pathlib import Path


class Settings(BaseSettings):
    """Application settings loaded from .env file."""

    # ── LLM (Anthropic Messages API) ──────────────────────────────────────
    llm_api_key: str = Field(
        ...,
        description="API key for the Anthropic-compatible endpoint.",
    )
    llm_base_url: str = Field(
        default="https://api.aerolink.lat/v1",
        description="Base URL for the Anthropic Messages API.",
    )
    llm_model: str = Field(
        default="claude-sonnet-5",
        description="Claude model name.",
    )
    anthropic_version: str = Field(
        default="2023-06-01",
        description="Anthropic API version header.",
    )
    llm_thinking_effort: str = Field(
        default="medium",
        description="Reasoning effort when thinking is enabled: low, medium, or high.",
    )
    llm_timeout_seconds: float = Field(
        default=600.0,
        description="Per-request timeout. Long-form drafting (16k output tokens) can run "
                    "several minutes, so this is generous by design.",
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
        default="./delve_checkpoints.db",
        description="SQLite DB path for LangGraph state persistence.",
    )

    # ── Session Store (persistent local JSON) ─────────────────────────────
    session_store_path: str = Field(
        default="./delve_sessions.json",
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
    crossref_contact_email: str = Field(
        default="",
        description="Contact email sent to Crossref for polite-pool access. Empty omits the mailto.",
    )

    # ── Server ────────────────────────────────────────────────────────────
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    @property
    def messages_url(self) -> str:
        """Full URL for the Anthropic Messages endpoint."""
        return f"{self.llm_base_url.rstrip('/')}/messages"


# Singleton instance
settings = Settings()
