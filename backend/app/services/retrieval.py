"""
ORION Retrieval Services
─────────────────────────
Fetches papers from ArXiv, Semantic Scholar, and web via Tavily.
All methods are async and return normalized paper dicts.
"""

import asyncio
import logging
from typing import Any
from datetime import datetime
import random

import httpx

from app.core.config import settings

logger = logging.getLogger("orion.retrieval")


# ── Paper Schema ──────────────────────────────────────────────────────────

def _make_paper(
    title: str,
    authors: str,
    abstract: str,
    year: int | str,
    source: str,
    url: str = "",
    doi: str = "",
    citation_count: int = 0,
    arxiv_id: str = "",
) -> dict[str, Any]:
    """Create a normalized paper dict."""
    return {
        "title": title.strip(),
        "authors": authors.strip(),
        "abstract": abstract.strip(),
        "year": str(year),
        "source": source,
        "url": url,
        "doi": doi,
        "citation_count": citation_count,
        "arxiv_id": arxiv_id,
        "paper_id": doi or arxiv_id or title[:60].lower().replace(" ", "_"),
    }


# ── ArXiv ─────────────────────────────────────────────────────────────────

async def fetch_arxiv(query: str, max_results: int = 10) -> list[dict]:
    """
    Fetch papers from arXiv API.
    Uses the `arxiv` library in a thread executor since it's synchronous.
    """
    try:
        import arxiv

        def _search():
            client = arxiv.Client()
            search = arxiv.Search(
                query=query,
                max_results=max_results,
                sort_by=arxiv.SortCriterion.Relevance,
            )
            papers = []
            for result in client.results(search):
                authors = ", ".join(a.name for a in result.authors[:5])
                if len(result.authors) > 5:
                    authors += " et al."

                papers.append(_make_paper(
                    title=result.title,
                    authors=authors,
                    abstract=result.summary,
                    year=result.published.year if result.published else "",
                    source="arxiv",
                    url=result.entry_id,
                    arxiv_id=result.entry_id.split("/")[-1] if result.entry_id else "",
                ))
            return papers

        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(None, _search)
        logger.info("ArXiv returned %d papers for '%s'", len(results), query)
        return results

    except Exception as e:
        logger.error("ArXiv fetch failed: %s", e)
        return []


# ── Semantic Scholar ──────────────────────────────────────────────────────

async def fetch_semantic_scholar(query: str, max_results: int = 10) -> list[dict]:
    """
    Fetch papers from Semantic Scholar free API.
    Endpoint: https://api.semanticscholar.org/graph/v1/paper/search
    """
    url = "https://api.semanticscholar.org/graph/v1/paper/search"
    params = {
        "query": query,
        "limit": max_results,
        "fields": "title,authors,abstract,year,citationCount,externalIds,url",
    }

    retries = max(1, settings.semantic_scholar_max_retries)
    backoff_base = max(0.5, settings.semantic_scholar_base_backoff_seconds)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            for attempt in range(1, retries + 1):
                resp = await client.get(url, params=params)

                if resp.status_code == 200:
                    data = resp.json()
                    papers = []
                    for p in data.get("data", []):
                        if not p.get("abstract"):
                            continue

                        authors = ", ".join(
                            a.get("name", "") for a in (p.get("authors") or [])[:5]
                        )
                        ext_ids = p.get("externalIds") or {}

                        papers.append(_make_paper(
                            title=p.get("title", ""),
                            authors=authors,
                            abstract=p.get("abstract", ""),
                            year=p.get("year", ""),
                            source="semantic_scholar",
                            url=p.get("url", ""),
                            doi=ext_ids.get("DOI", ""),
                            citation_count=p.get("citationCount", 0),
                            arxiv_id=ext_ids.get("ArXiv", ""),
                        ))

                    logger.info("Semantic Scholar returned %d papers for '%s'", len(papers), query)
                    return papers

                if resp.status_code in (429, 500, 502, 503, 504) and attempt < retries:
                    jitter = random.uniform(0, 0.5)
                    delay = backoff_base * (2 ** (attempt - 1)) + jitter
                    logger.warning(
                        "Semantic Scholar HTTP %s (attempt %d/%d), backing off %.1fs",
                        resp.status_code,
                        attempt,
                        retries,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    continue

                logger.error("Semantic Scholar HTTP %s", resp.status_code)
                return []

    except Exception as e:
        logger.error("Semantic Scholar fetch failed: %s", e)
        return []


# ── Tavily Web Search ─────────────────────────────────────────────────────

async def fetch_web_tavily(query: str, api_key: str, max_results: int = 5) -> list[dict]:
    """
    Fetch web results via Tavily API.
    Returns normalized paper-like dicts for web articles.
    """
    if not api_key:
        logger.warning("Tavily API key not set, skipping web search.")
        return []

    try:
        from tavily import AsyncTavilyClient

        client = AsyncTavilyClient(api_key=api_key)
        response = await client.search(
            query=f"academic research {query}",
            max_results=max_results,
            search_depth="advanced",
        )

        papers = []
        for result in response.get("results", []):
            papers.append(_make_paper(
                title=result.get("title", ""),
                authors="Web Source",
                abstract=result.get("content", ""),
                year=str(datetime.now().year),
                source="web_tavily",
                url=result.get("url", ""),
            ))

        logger.info("Tavily returned %d results for '%s'", len(papers), query)
        return papers

    except Exception as e:
        logger.error("Tavily fetch failed: %s", e)
        return []


# ── Deduplication ─────────────────────────────────────────────────────────

def deduplicate_papers(papers: list[dict]) -> list[dict]:
    """
    Deduplicate papers based on title similarity and DOI.
    Keeps the entry with higher citation count.
    """
    seen: dict[str, dict] = {}

    for paper in papers:
        # Create a normalized key from title
        key = paper["title"].lower().strip()[:80]
        doi = paper.get("doi", "")

        # If we have a DOI, prefer that as the key
        if doi:
            key = doi

        if key in seen:
            # Keep the one with higher citation count
            if paper.get("citation_count", 0) > seen[key].get("citation_count", 0):
                seen[key] = paper
        else:
            seen[key] = paper

    return list(seen.values())
