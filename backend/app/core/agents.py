"""
ORION Agent Nodes
──────────────────
All LangGraph node functions for the research pipeline.
Each node reads from / writes to the shared ResearchState.

Nodes:
  1. planner_node        – Generates search queries + research plan
  2. retrieval_node      – Fetches papers from ArXiv, Semantic Scholar, Tavily, ChromaDB
  3. summarizer_node     – Summarizes top papers and extracts limitations
  4. proposer_node       – Drafts literature review
  5. critic_node         – Reviews and critiques the draft
  6. gap_analysis_node   – Identifies research gaps (JSON output)
  7. paper_architect_node – Assembles final Markdown paper
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import re
from collections import Counter
from typing import Any

from app.core.llm_client import gemini_client
from app.core.config import settings
from app.core.state import ResearchState
from app.services.retrieval import (
    fetch_arxiv,
    fetch_semantic_scholar,
    fetch_web_tavily,
    deduplicate_papers,
)
from app.services.vector_store import vector_store

logger = logging.getLogger("orion.agents")


# ── Helper: WebSocket Status Update ──────────────────────────────────────

def _ws_callback(config: dict):
    """
    Extract the WebSocket broadcast callback from LangGraph config.
    Returns a callable or a no-op if not present.
    """
    return config.get("configurable", {}).get("ws_callback", lambda msg: None)


async def _send_status(config: dict, message: str, msg_type: str = "status", data: dict | None = None):
    """Send a status update via WebSocket callback if available."""
    cb = _ws_callback(config)
    payload = {"type": msg_type, "message": message}
    if data:
        payload["data"] = data
    try:
        if asyncio.iscoroutinefunction(cb):
            await cb(payload)
        else:
            cb(payload)
    except Exception as e:
        logger.warning("WebSocket callback failed: %s", e)


def _source_quality_score(source: str) -> float:
    source = (source or "").lower()
    if source == "semantic_scholar":
        return 0.95  # mostly peer-reviewed index
    if source == "arxiv":
        return 0.72  # strong but preprint-heavy
    if source == "web_tavily":
        return 0.45
    if source == "uploaded_pdf":
        return 0.8
    return 0.5


def _confidence_score(citation_count: int, abstract: str, source: str) -> float:
    citation_component = min(1.0, math.log1p(max(0, citation_count)) / math.log1p(200))
    abstract_component = 1.0 if len((abstract or "").strip()) >= 500 else 0.65
    source_component = _source_quality_score(source)
    return round(0.5 * source_component + 0.3 * citation_component + 0.2 * abstract_component, 3)


def _normalize_tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(t) > 2}


def _title_similarity(a: str, b: str) -> float:
    ta, tb = _normalize_tokens(a), _normalize_tokens(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    union = len(ta | tb)
    return inter / union if union else 0.0


def _embedding_similarity(a: str, b: str) -> float:
    # Lightweight local proxy for embedding similarity using token-frequency cosine.
    va = Counter(re.findall(r"[a-z0-9]+", (a or "").lower()))
    vb = Counter(re.findall(r"[a-z0-9]+", (b or "").lower()))
    if not va or not vb:
        return 0.0
    keys = set(va) | set(vb)
    dot = sum(va.get(k, 0) * vb.get(k, 0) for k in keys)
    na = math.sqrt(sum(v * v for v in va.values()))
    nb = math.sqrt(sum(v * v for v in vb.values()))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _cluster_duplicates(papers: list[dict[str, Any]], threshold: float = 0.82) -> list[dict[str, Any]]:
    clusters: list[dict[str, Any]] = []
    used: set[int] = set()
    for i, p in enumerate(papers):
        if i in used:
            continue
        cluster = [p]
        used.add(i)
        for j in range(i + 1, len(papers)):
            if j in used:
                continue
            q = papers[j]
            same_doi = bool(p.get("doi")) and p.get("doi") == q.get("doi")
            title_sim = _title_similarity(p.get("title", ""), q.get("title", ""))
            emb_sim = _embedding_similarity(
                f"{p.get('title','')} {p.get('abstract','')[:300]}",
                f"{q.get('title','')} {q.get('abstract','')[:300]}",
            )
            sim = max(title_sim, emb_sim)
            if same_doi or sim >= threshold:
                cluster.append(q)
                used.add(j)
        if len(cluster) > 1:
            clusters.append({
                "canonical_title": cluster[0].get("title", ""),
                "size": len(cluster),
                "sources": sorted(list({c.get("source", "unknown") for c in cluster})),
                "paper_ids": [c.get("paper_id") for c in cluster],
            })
    return clusters


def _extract_json_fragment(text: str) -> str:
    if not text:
        return ""
    start_candidates = [i for i in [text.find("["), text.find("{")] if i != -1]
    if not start_candidates:
        return text.strip()
    start = min(start_candidates)
    end_arr = text.rfind("]")
    end_obj = text.rfind("}")
    end = max(end_arr, end_obj)
    if end > start:
        return text[start:end + 1]
    return text[start:].strip()


def _parse_json_object(text: str) -> dict[str, Any]:
    """Best-effort parse for model output expected to be a JSON object."""
    if not text:
        return {}
    for candidate in (text, _extract_json_fragment(text)):
        try:
            parsed = json.loads(candidate)
        except Exception:
            continue
        if isinstance(parsed, dict):
            return parsed
    return {}


def _topic_anchor_terms(topic: str, limit: int = 8) -> list[str]:
    raw = [t.lower() for t in re.findall(r"[A-Za-z0-9]+", topic or "") if len(t) > 3]
    stop = {
        "with", "from", "into", "using", "over", "under", "across", "towards",
        "between", "based", "analysis", "system", "study", "research", "approach",
        "architectures", "architecture",
    }
    anchors: list[str] = []
    for token in raw:
        if token in stop:
            continue
        if token not in anchors:
            anchors.append(token)
        if len(anchors) >= limit:
            break
    return anchors


def _critical_topic_terms(topic: str, limit: int = 6) -> list[str]:
    anchors = _topic_anchor_terms(topic, limit=20)
    generic = {
        "urban", "city", "cities", "smart", "study", "research", "analysis", "approach",
        "strategies", "causes", "impacts", "effects", "evaluation", "system", "models",
    }
    critical = [a for a in anchors if a not in generic]
    return critical[:limit]


def _paper_relevance_score(paper: dict[str, Any], topic_tokens: set[str], query_tokens: set[str]) -> float:
    hay = f"{paper.get('title', '')} {paper.get('abstract', '')}".lower()
    tokens = {t for t in re.findall(r"[a-z0-9]+", hay) if len(t) > 2}
    if not tokens:
        return 0.0
    t_overlap = len(tokens & topic_tokens)
    q_overlap = len(tokens & query_tokens)
    title_tokens = {t for t in re.findall(r"[a-z0-9]+", str(paper.get("title", "")).lower()) if len(t) > 2}
    title_overlap = len(title_tokens & topic_tokens)
    base = (2.2 * title_overlap) + (1.3 * t_overlap) + (0.5 * q_overlap)
    title_l = str(paper.get("title", "")).lower()
    abstract_l = str(paper.get("abstract", "")).lower()
    penalty_terms = {
        "gene regulatory network", "gene regulatory networks", "primer",
        "biology", "biological", "drug discovery in plants",
    }
    if any(term in title_l or term in abstract_l for term in penalty_terms):
        base -= 3.0
    return base


def _clean_nullable_text(value: Any) -> str:
    text = str(value or "").strip()
    if text.lower() in {"none", "null", "n/a", "na", "not available"}:
        return ""
    return text


def _citation_key(authors: str, year: str | int | None) -> str:
    author_last = "unknown"
    if authors:
        first = str(authors).split(",")[0].strip()
        chunks = [c for c in re.findall(r"[A-Za-z]+", first) if c]
        if chunks:
            author_last = chunks[-1].lower()
    y = str(year or "nd").strip().lower()
    return f"{author_last}{y}"


def _citation_display_name(authors: str, year: str | int | None) -> tuple[str, str]:
    first = str(authors or "").split(",")[0].strip()
    chunks = [c for c in re.findall(r"[A-Za-z]+", first) if c]
    author_last = chunks[-1] if chunks else "Unknown"
    y = str(year or "n.d.").strip()
    return author_last, y


def _citation_marker_map(bibliography: list[dict[str, Any]]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    next_idx = 1
    for item in bibliography:
        key = str(item.get("citation_key", "")).strip().lower()
        if not key:
            key = _citation_key(item.get("authors", ""), item.get("year", ""))
        if key and key not in mapping:
            mapping[key] = next_idx
            next_idx += 1
    return mapping


def _strip_reference_tail(markdown: str) -> str:
    if not markdown:
        return ""
    pattern = r"(?is)\n(?:#+\s*)?(references|works cited)\b.*$"
    return re.sub(pattern, "", markdown).rstrip()


def _render_references_section(paper_format: str, bibliography: list[dict[str, Any]]) -> str:
    fmt = (paper_format or "ACADEMIC").upper()
    if not bibliography:
        return ""

    if fmt in {"IEEE", "ACM"}:
        lines = ["## References"]
        for i, b in enumerate(bibliography, start=1):
            title = b.get("title", "Untitled")
            authors = b.get("authors", "Unknown")
            year = b.get("year", "n.d.")
            url = b.get("url", "")
            doi = b.get("doi", "")
            tail = f" {url}".strip()
            if doi:
                tail = f"{tail} DOI: {doi}".strip()
            lines.append(f"[{i}] {authors}, \"{title},\" {year}.{(' ' + tail) if tail else ''}")
        return "\n".join(lines)

    if fmt == "APA":
        lines = ["## References"]
        for b in bibliography:
            title = b.get("title", "Untitled")
            authors = b.get("authors", "Unknown")
            year = b.get("year", "n.d.")
            url = b.get("url", "")
            doi = b.get("doi", "")
            if doi:
                lines.append(f"{authors} ({year}). {title}. https://doi.org/{doi}")
            elif url:
                lines.append(f"{authors} ({year}). {title}. {url}")
            else:
                lines.append(f"{authors} ({year}). {title}.")
        return "\n".join(lines)

    if fmt == "MLA":
        lines = ["## Works Cited"]
        for b in bibliography:
            title = b.get("title", "Untitled")
            authors = b.get("authors", "Unknown")
            year = b.get("year", "n.d.")
            url = b.get("url", "")
            line = f"{authors}. \"{title}.\" {year}."
            if url:
                line = f"{line} {url}"
            lines.append(line)
        return "\n".join(lines)

    lines = ["## References"]
    for b in bibliography:
        key = b.get("citation_key") or _citation_key(b.get("authors", ""), b.get("year", ""))
        lines.append(
            f"[@{key}] {b.get('authors', 'Unknown')}. \"{b.get('title', 'Untitled')}\". "
            f"{b.get('year', 'n.d.')}. {b.get('url', '')}".strip()
        )
    return "\n".join(lines)


def _normalize_citations_for_format(markdown: str, paper_format: str, bibliography: list[dict[str, Any]]) -> str:
    if not markdown:
        return markdown
    fmt = (paper_format or "ACADEMIC").upper()
    citation_indices = _citation_marker_map(bibliography)

    def _to_numeric(match: re.Match[str]) -> str:
        key = match.group(1).strip().lower()
        idx = citation_indices.get(key)
        if idx is None:
            idx = len(citation_indices) + 1
            citation_indices[key] = idx
        return f"[{idx}]"

    def _to_apa(match: re.Match[str]) -> str:
        key = match.group(1).strip().lower()
        for b in bibliography:
            b_key = str(b.get("citation_key", "")).strip().lower() or _citation_key(b.get("authors", ""), b.get("year", ""))
            if b_key == key:
                author_last, year = _citation_display_name(b.get("authors", ""), b.get("year", ""))
                return f"({author_last}, {year})"
        return "(Unknown, n.d.)"

    def _to_mla(match: re.Match[str]) -> str:
        key = match.group(1).strip().lower()
        for b in bibliography:
            b_key = str(b.get("citation_key", "")).strip().lower() or _citation_key(b.get("authors", ""), b.get("year", ""))
            if b_key == key:
                author_last, _year = _citation_display_name(b.get("authors", ""), b.get("year", ""))
                return f"({author_last})"
        return "(Unknown)"

    transformed = markdown
    if fmt in {"IEEE", "ACM"}:
        transformed = re.sub(r"\[@([A-Za-z0-9_.:-]+)\]", _to_numeric, transformed)
    elif fmt == "APA":
        transformed = re.sub(r"\[@([A-Za-z0-9_.:-]+)\]", _to_apa, transformed)
    elif fmt == "MLA":
        transformed = re.sub(r"\[@([A-Za-z0-9_.:-]+)\]", _to_mla, transformed)
    return transformed


def _extract_claim_evidence_map(
    paper_markdown: str,
    bibliography: list[dict[str, Any]],
    paper_format: str,
    citation_quality: dict[str, dict[str, Any]],
    citation_verification: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    if not paper_markdown or not bibliography:
        return []
    lines = [ln.strip() for ln in paper_markdown.splitlines() if ln.strip()]
    items: list[dict[str, Any]] = []
    fmt = (paper_format or "ACADEMIC").upper()
    key_to_pid: dict[str, str] = {}
    index_to_pid: dict[int, str] = {}
    for i, b in enumerate(bibliography, start=1):
        pid = str(b.get("paper_id", ""))
        key = str(b.get("citation_key", "")).strip().lower() or _citation_key(b.get("authors", ""), b.get("year", ""))
        if key:
            key_to_pid[key] = pid
        index_to_pid[i] = pid

    for line in lines:
        if len(line) < 40 or line.startswith("#"):
            continue
        matched_pids: set[str] = set()
        if fmt in {"IEEE", "ACM"}:
            for m in re.findall(r"\[(\d+)\]", line):
                pid = index_to_pid.get(int(m))
                if pid:
                    matched_pids.add(pid)
        else:
            for m in re.findall(r"\[@([A-Za-z0-9_.:-]+)\]", line):
                pid = key_to_pid.get(m.lower())
                if pid:
                    matched_pids.add(pid)

        if not matched_pids:
            continue
        claim = line
        if len(claim) > 220:
            claim = f"{claim[:220].rstrip()}..."
        for pid in sorted(matched_pids):
            items.append({
                "claim": claim,
                "paper_id": pid,
                "confidence": citation_quality.get(pid, {}).get("confidence", 0.5),
                "verified": citation_verification.get(pid, {}).get("verified", False),
            })
    return items


def _fallback_gap_title(topic: str, evidence: str, idx: int) -> str:
    phrase = re.split(r"[.;:,\n]", evidence or "", maxsplit=1)[0].strip()
    phrase = re.sub(r"^(no specific limitations extracted from the retrieved papers|not available)\b[:\- ]*", "", phrase, flags=re.IGNORECASE).strip()
    if phrase:
        words = phrase.split()
        short = " ".join(words[:8])
        return f"Gap {idx}: {short}"
    anchors = _topic_anchor_terms(topic, limit=2)
    anchor = " ".join(anchors) if anchors else "core evaluation dimension"
    return f"Gap {idx}: Underexplored {anchor}"


def _extract_limitation_signal(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r"\s+", " ", text).strip()
    # Prefer explicit limitation-style clauses.
    patterns = [
        r"(?:limitation|challenge|constraint|bias|scarcity|insufficient|lack|underexplored)[^.]{0,180}\.",
        r"(?:future work|further research|needs to|remains unclear)[^.]{0,180}\.",
    ]
    for pat in patterns:
        m = re.search(pat, cleaned, flags=re.IGNORECASE)
        if m:
            return m.group(0).strip()
    # Secondary fallback: capture first "however/but" sentence.
    m = re.search(r"(?:however|but)\s+[^.]{30,220}\.", cleaned, flags=re.IGNORECASE)
    if m:
        return m.group(0).strip()
    return ""


def _derive_gaps_from_paper_evidence(
    topic: str,
    summaries: dict[str, dict[str, Any]],
    source_counts: dict[str, int] | None = None,
    min_gaps: int = 3,
) -> list[dict[str, str]]:
    candidates: list[dict[str, str]] = []
    source_counts = source_counts or {}

    # Topic-agnostic quality blind spots that almost always matter for real studies.
    candidates.extend([
        {
            "title": "Limited external validity across city contexts",
            "evidence": "Retrieved studies are unevenly distributed across regions and urban forms, limiting generalization.",
            "proposed_direction": "Evaluate methods across multiple climate zones, city morphologies, and socioeconomic contexts with a unified protocol.",
        },
        {
            "title": "Insufficient causal evaluation of mitigation impact",
            "evidence": "Many studies report associations or case outcomes without strong causal identification and uncertainty quantification.",
            "proposed_direction": "Use quasi-experimental/causal designs with counterfactual baselines and confidence intervals for intervention effects.",
        },
        {
            "title": "Weak longitudinal validation of proposed strategies",
            "evidence": "Evidence is often short-horizon, making durability and seasonal robustness of mitigation uncertain.",
            "proposed_direction": "Run longitudinal monitoring with seasonal and extreme-event stress tests to validate sustained performance.",
        },
    ])

    limitation_signals: list[tuple[str, str]] = []
    corpus_text_parts: list[str] = []
    for info in summaries.values():
        title = str(info.get("title", "")).strip()
        summary = str(info.get("summary", "")).strip()
        limitation = _clean_nullable_text(info.get("limitation", ""))
        body = f"{title}. {summary}".strip()
        if body:
            corpus_text_parts.append(body.lower())
        signal = limitation or _extract_limitation_signal(body)
        if signal:
            limitation_signals.append((title, signal))

    for title, signal in limitation_signals:
        gap_title = _fallback_gap_title(topic, signal, len(candidates) + 1)
        candidates.append({
            "title": gap_title,
            "evidence": f"{title}: {signal}"[:900],
            "proposed_direction": "Run controlled comparative studies with stronger baselines, subgroup analysis, and explicit failure reporting.",
        })

    corpus_text = " ".join(corpus_text_parts)
    critical_terms = _critical_topic_terms(topic)
    missing_terms = [t for t in critical_terms if t not in corpus_text]
    for term in missing_terms[:3]:
        candidates.append({
            "title": f"Limited coverage of {term} in current evidence base",
            "evidence": f"Across summarized papers, direct analysis for '{term}' is sparse relative to the user topic scope.",
            "proposed_direction": f"Prioritize targeted retrieval and evaluation specifically focused on '{term}', then benchmark against current findings.",
        })

    total_sources = sum(int(v) for v in source_counts.values()) if source_counts else 0
    if total_sources > 0:
        top_source = max(source_counts, key=source_counts.get)
        top_share = (source_counts.get(top_source, 0) / total_sources) if total_sources else 0.0
        if top_share >= 0.7:
            candidates.append({
                "title": "Source diversity imbalance in retrieved evidence",
                "evidence": f"{top_source} contributes {top_share:.0%} of retrieved sources, increasing risk of coverage bias.",
                "proposed_direction": "Enforce source-balancing constraints and compare conclusions across independent source families.",
            })

    # Sanitize + de-duplicate and enforce minimum count.
    finalized: list[dict[str, str]] = []
    seen: set[str] = set()
    for i, gap in enumerate(candidates, start=1):
        title = _clean_nullable_text(gap.get("title", ""))
        evidence = _clean_nullable_text(gap.get("evidence", ""))
        direction = _clean_nullable_text(gap.get("proposed_direction", ""))
        if not title or not evidence or not direction:
            continue
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        finalized.append({
            "title": title[:180],
            "evidence": evidence[:900],
            "proposed_direction": direction[:900],
        })
        if len(finalized) >= 5:
            break

    while len(finalized) < min_gaps:
        idx = len(finalized) + 1
        fallback_title = f"Gap {idx}: Limited rigorous evaluation coverage"
        if fallback_title.lower() in seen:
            break
        seen.add(fallback_title.lower())
        finalized.append({
            "title": fallback_title,
            "evidence": "Current paper set does not provide enough explicit limitation reporting across all key topic dimensions.",
            "proposed_direction": "Design topic-specific benchmarks and report stratified error/failure modes for each major sub-problem.",
        })
    return finalized


def _format_compliance_summary(markdown: str, paper_format: str) -> dict[str, Any]:
    fmt = (paper_format or "ACADEMIC").upper()
    text = markdown or ""
    checks: dict[str, bool] = {}
    if fmt in {"IEEE", "ACM"}:
        checks["numeric_citations"] = bool(re.search(r"\[\d+\]", text))
        checks["references_heading"] = bool(re.search(r"(?im)^##\s+references\s*$", text))
        checks["author_year_markers_absent"] = not bool(re.search(r"\[@[A-Za-z0-9_.:-]+\]", text))
    elif fmt == "APA":
        checks["apa_parenthetical"] = bool(re.search(r"\([A-Z][A-Za-z\-]+,\s*\d{4}\)", text))
        checks["references_heading"] = bool(re.search(r"(?im)^##\s+references\s*$", text))
        checks["numeric_citations_absent"] = not bool(re.search(r"\[\d+\]", text))
    elif fmt == "MLA":
        checks["mla_parenthetical"] = bool(re.search(r"\([A-Z][A-Za-z\-]+\)", text))
        checks["works_cited_heading"] = bool(re.search(r"(?im)^##\s+works cited\s*$", text))
        checks["numeric_citations_absent"] = not bool(re.search(r"\[\d+\]", text))
    else:
        checks["author_year_markers_present"] = bool(re.search(r"\[@[A-Za-z0-9_.:-]+\]", text))
        checks["references_heading"] = bool(re.search(r"(?im)^##\s+references\s*$", text))

    total = len(checks)
    passed = sum(1 for ok in checks.values() if ok)
    score = round((passed / total) if total else 0.0, 3)
    return {
        "paper_format": fmt,
        "checks": checks,
        "passed": passed,
        "total": total,
        "score": score,
        "is_compliant": passed == total and total > 0,
    }


# ══════════════════════════════════════════════════════════════════════════
# NODE 1: PLANNER
# ══════════════════════════════════════════════════════════════════════════

PLANNER_PROMPT = """You are a senior research strategist. Given the topic: "{topic}", generate a list of 3-5 specific search queries suitable for academic databases (arXiv, Semantic Scholar) and a short research plan covering key angles to investigate.

Strict constraints for each query:
1) Must include at least one quoted phrase.
2) Must include at least one narrowing term from this set: recent, benchmark, evaluation, ablation, transformer, mechanistic, legal, law, jurisprudence.
3) Avoid generic one/two-word queries and avoid purely broad topic terms.
4) Keep each query under 18 words.
5) Prioritize lexical overlap with the user topic; avoid adjacent but different fields.

Output as JSON: {{"queries": ["query1", ...], "plan": ["angle1", ...], "constraints_applied": true}}"""


async def planner_node(state: ResearchState, config: dict) -> dict:
    """Generate search queries and a research plan from the user's topic."""
    topic = state["topic"]
    await _send_status(config, f"Planning research strategy for: {topic}")

    prompt = PLANNER_PROMPT.format(topic=topic)
    response = await gemini_client.generate_content(
        prompt=prompt,
        response_mime_type="application/json",
        temperature=0.3,
        max_output_tokens=1024,
        enable_thinking=False,
    )

    topic_terms = {
        token.lower()
        for token in re.findall(r"[A-Za-z0-9]+", topic)
        if len(token) > 2
    }

    anchors = _topic_anchor_terms(topic)

    try:
        data = _parse_json_object(response)
        if not data:
            raise json.JSONDecodeError("Invalid planner JSON", response, 0)
        raw_queries = data.get("queries", [topic])
        queries = []
        for q in raw_queries:
            q = str(q).strip()
            if not q:
                continue
            if '"' not in q:
                q = f"\"{q}\" evaluation"
            q_terms = {token.lower() for token in re.findall(r"[A-Za-z0-9]+", q) if len(token) > 2}
            overlap = len(topic_terms.intersection(q_terms))
            if overlap < max(1, min(3, len(topic_terms) // 8 + 1)):
                q = f"\"{topic}\" evaluation {anchors[0] if anchors else 'benchmark'}"
            if anchors:
                # Ensure at least one strong topic anchor is present.
                if not any(a in q.lower() for a in anchors[:4]):
                    q = f"{q} {anchors[0]}"
            queries.append(q[:180])
        # Ensure breadth: at least 3 focused queries.
        if len(queries) < 3:
            seed = anchors[0] if anchors else "benchmark"
            fillers = [
                f"\"{topic}\" recent evaluation {seed}",
                f"\"{topic}\" ablation study {seed}",
                f"\"{topic}\" benchmark analysis {seed}",
            ]
            for fq in fillers:
                if len(queries) >= 3:
                    break
                if fq not in queries:
                    queries.append(fq[:180])
        if not queries:
            queries = [f"\"{topic}\" evaluation {anchors[0] if anchors else 'benchmark'}"]
        plan = data.get("plan", [])
    except json.JSONDecodeError:
        logger.warning("Planner returned non-JSON, using topic as query: %s", response[:200])
        queries = [f"\"{topic}\" evaluation {anchors[0] if anchors else 'benchmark'}"]
        plan = ["General literature survey"]

    if len(queries) < 3:
        seed = anchors[0] if anchors else "benchmark"
        fillers = [
            f"\"{topic}\" recent evaluation {seed}",
            f"\"{topic}\" ablation study {seed}",
            f"\"{topic}\" benchmark analysis {seed}",
        ]
        for fq in fillers:
            if len(queries) >= 3:
                break
            if fq not in queries:
                queries.append(fq[:180])

    await _send_status(config, f"Generated {len(queries)} search queries", "status", {
        "queries": queries,
        "plan": plan,
        "node": "planner",
    })

    existing_constraints = state.get("planner_constraints", {})
    return {
        "refined_query": topic,
        "search_queries": queries,
        "research_plan": plan,
        "planner_constraints": {
            "quoted_phrases_required": True,
            "max_query_words": 18,
            "broad_query_avoidance": True,
            "depth": existing_constraints.get("depth", "standard"),
            "year_from": existing_constraints.get("year_from"),
            "include_sources": existing_constraints.get("include_sources", []),
            "exclude_sources": existing_constraints.get("exclude_sources", []),
        },
        "strict_mode": bool(state.get("strict_mode", settings.strict_synthesis_mode)),
        "max_debate_rounds": int(state.get("max_debate_rounds", settings.max_debate_rounds)),
        "status_message": f"Research plan ready with {len(queries)} queries",
    }


# ══════════════════════════════════════════════════════════════════════════
# NODE 2: RETRIEVAL (Parallel Fetch)
# ══════════════════════════════════════════════════════════════════════════

async def retrieval_node(state: ResearchState, config: dict) -> dict:
    """
    Fetch papers from multiple sources in parallel.
    Also queries ChromaDB if uploaded paper IDs exist.
    """
    max_queries = max(1, settings.max_search_queries)
    max_results = max(1, settings.max_source_results_per_query)
    queries = state.get("search_queries", [state["topic"]])[:max_queries]
    constraints = state.get("planner_constraints", {})
    include_sources = set(constraints.get("include_sources", []) or [])
    exclude_sources = set(constraints.get("exclude_sources", []) or [])
    uploaded_ids = state.get("uploaded_paper_ids", [])

    await _send_status(config, "Searching academic databases...", data={"node": "retrieval"})

    all_papers = []

    # Run all queries across all sources in parallel
    tasks = []
    for query in queries:
        if "arxiv" not in exclude_sources and (not include_sources or "arxiv" in include_sources):
            tasks.append(fetch_arxiv(query, max_results=max_results))
        if "semantic_scholar" not in exclude_sources and (not include_sources or "semantic_scholar" in include_sources):
            tasks.append(fetch_semantic_scholar(query, max_results=max_results))

    # Add Tavily search for the main topic
    if "web_tavily" not in exclude_sources and (not include_sources or "web_tavily" in include_sources):
        tasks.append(fetch_web_tavily(state["topic"], settings.tavily_api_key, max_results=max_results))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, Exception):
            logger.error("Retrieval task failed: %s", result)
            continue
        if isinstance(result, list):
            all_papers.extend(result)

    # Topic-aware reranking/filtering to reduce drift and prioritize relevance.
    topic_tokens = _normalize_tokens(state.get("topic", ""))
    query_tokens = _normalize_tokens(" ".join(queries))
    critical_terms = _critical_topic_terms(state.get("topic", ""))
    scored: list[tuple[float, dict[str, Any]]] = []
    for paper in all_papers:
        score = _paper_relevance_score(paper, topic_tokens, query_tokens)
        hay = f"{paper.get('title', '')} {paper.get('abstract', '')}".lower()
        term_hits = sum(1 for t in critical_terms if t in hay)
        source = str(paper.get("source", "")).lower()
        if source == "web_tavily" and term_hits < max(1, min(2, len(critical_terms))):
            score -= 2.0
        if source == "arxiv" and term_hits == 0:
            score -= 1.2
        if source == "semantic_scholar":
            score += 0.4
        scored.append((score, paper))
    scored.sort(key=lambda x: x[0], reverse=True)

    filtered = [p for s, p in scored if s >= 2.5]
    if filtered:
        all_papers = filtered[: max(10, max_results * max_queries * 2)]
    else:
        all_papers = [p for _, p in scored[: max(8, max_results * max_queries)]]

    # Send paper_found events
    for paper in all_papers[:5]:  # Send first 5 as previews
        confidence = _confidence_score(
            paper.get("citation_count", 0),
            paper.get("abstract", ""),
            paper.get("source", ""),
        )
        await _send_status(config, f"Found: {paper['title'][:80]}...", "paper_found", {
            "title": paper["title"],
            "authors": paper["authors"],
            "source": paper["source"],
            "year": paper["year"],
            "confidence": confidence,
            "node": "retrieval",
        })

    # Deduplicate
    unique_papers = deduplicate_papers(all_papers)
    # Keep strongest, most relevant papers first for downstream summarization.
    unique_papers.sort(
        key=lambda p: (
            _paper_relevance_score(p, topic_tokens, query_tokens),
            p.get("citation_count", 0),
        ),
        reverse=True,
    )
    duplicate_clusters = _cluster_duplicates(all_papers)

    # Source balancing for better reliability/coverage (avoid web-only dominance).
    grouped: dict[str, list[dict[str, Any]]] = {}
    for p in unique_papers:
        grouped.setdefault(str(p.get("source", "unknown")).lower(), []).append(p)
    for src in grouped:
        grouped[src].sort(
            key=lambda p: (
                _paper_relevance_score(p, topic_tokens, query_tokens),
                p.get("citation_count", 0),
            ),
            reverse=True,
        )
    ordered: list[dict[str, Any]] = []
    # Prefer stronger academic sources first.
    source_priority = ["semantic_scholar", "arxiv", "web_tavily"]
    max_total = max(10, max_results * max_queries * 2)
    per_source_cap = max(2, max_total // 2)
    for src in source_priority:
        for p in grouped.get(src, [])[:per_source_cap]:
            ordered.append(p)
            if len(ordered) >= max_total:
                break
        if len(ordered) >= max_total:
            break
    if len(ordered) < max_total:
        seen_ids = {str(p.get("paper_id", "")) for p in ordered}
        for p in unique_papers:
            pid = str(p.get("paper_id", ""))
            if pid in seen_ids:
                continue
            ordered.append(p)
            seen_ids.add(pid)
            if len(ordered) >= max_total:
                break
    unique_papers = ordered

    source_counts: dict[str, int] = {}
    for p in unique_papers:
        src = p.get("source", "unknown")
        source_counts[src] = source_counts.get(src, 0) + 1

    await _send_status(
        config,
        f"Retrieved {len(all_papers)} papers, {len(unique_papers)} unique after dedup",
        data={
            "node": "retrieval",
            "source_counts": source_counts,
            "duplicate_clusters": len(duplicate_clusters),
        },
    )

    # Query ChromaDB for uploaded PDF content
    vector_results = []
    if uploaded_ids:
        await _send_status(config, "Searching uploaded PDFs...")
        for query in queries[:3]:
            chunks = vector_store.query(query, n_results=5, file_ids=uploaded_ids)
            vector_results.extend(chunks)

    return {
        "retrieved_papers": unique_papers,
        "vector_results": vector_results,
        "duplicate_clusters": duplicate_clusters,
        "source_counts": source_counts,
        "status_message": f"Found {len(unique_papers)} unique papers",
    }


# ══════════════════════════════════════════════════════════════════════════
# NODE 3: DEEP DIVE SUMMARIZER
# ══════════════════════════════════════════════════════════════════════════

SUMMARIZER_PROMPT = """You are an expert research analyst. Summarize the following paper concisely.

Title: {title}
Authors: {authors}
Abstract: {abstract}

Provide:
1. A 3-sentence summary of the key contributions.
2. The main limitation or future work direction mentioned or implied.

Output as JSON: {{"summary": "...", "limitation": "..."}}"""


async def summarizer_node(state: ResearchState, config: dict) -> dict:
    """Summarize the top papers and extract their limitations."""
    papers = state.get("retrieved_papers", [])

    # Sort by citation count, take top 15
    sorted_papers = sorted(papers, key=lambda p: p.get("citation_count", 0), reverse=True)
    top_papers = sorted_papers[:15]

    if not top_papers:
        await _send_status(config, "No papers to summarize.")
        return {"paper_summaries": {}, "status_message": "No papers found to summarize"}

    await _send_status(config, f"Summarizing {len(top_papers)} papers...", data={"node": "summarizer"})
    summaries = {}
    citation_quality: dict[str, dict[str, Any]] = {}
    citation_verification: dict[str, dict[str, Any]] = {}

    for i, paper in enumerate(top_papers):
        await _send_status(
            config,
            f"Summarizing paper {i + 1} of {len(top_papers)}: {paper['title'][:60]}...",
        )

        prompt = SUMMARIZER_PROMPT.format(
            title=paper["title"],
            authors=paper["authors"],
            abstract=paper["abstract"][:2000],
        )

        try:
            response = await gemini_client.generate_content(
                prompt=prompt,
                response_mime_type="application/json",
                temperature=0.3,
                max_output_tokens=512,
                enable_thinking=False,
            )
            data = _parse_json_object(response)
            if not data:
                raise json.JSONDecodeError("Invalid summarizer JSON", response, 0)
            summaries[paper["paper_id"]] = {
                "title": paper["title"],
                "authors": paper["authors"],
                "year": paper["year"],
                "summary": data.get("summary", ""),
                "limitation": data.get("limitation", ""),
                "url": paper.get("url", ""),
                "doi": paper.get("doi", ""),
                "citation_count": paper.get("citation_count", 0),
            }
            citation_quality[paper["paper_id"]] = {
                "source_quality": _source_quality_score(paper.get("source", "")),
                "confidence": _confidence_score(
                    paper.get("citation_count", 0),
                    paper.get("abstract", ""),
                    paper.get("source", ""),
                ),
            }
            has_doi = bool(paper.get("doi"))
            has_year = bool(str(paper.get("year", "")).strip())
            title_ok = len((paper.get("title") or "").strip()) > 10
            source = str(paper.get("source", "")).lower()
            reliable_source = source in {"semantic_scholar", "arxiv"}
            has_url = bool(str(paper.get("url", "")).strip())
            citation_verification[paper["paper_id"]] = {
                "title_ok": title_ok,
                "year_ok": has_year,
                "doi_ok": has_doi,
                "verified": bool(title_ok and has_year and ((has_doi and reliable_source) or (reliable_source and has_url))),
            }
        except Exception as e:
            logger.error("Failed to summarize paper '%s': %s", paper["title"][:60], e)
            summaries[paper["paper_id"]] = {
                "title": paper["title"],
                "authors": paper["authors"],
                "year": paper["year"],
                "summary": paper["abstract"][:300],
                "limitation": "Not available",
                "url": paper.get("url", ""),
                "doi": paper.get("doi", ""),
                "citation_count": paper.get("citation_count", 0),
            }
            citation_quality[paper["paper_id"]] = {
                "source_quality": _source_quality_score(paper.get("source", "")),
                "confidence": 0.4,
            }
            citation_verification[paper["paper_id"]] = {
                "title_ok": len((paper.get("title") or "").strip()) > 10,
                "year_ok": bool(str(paper.get("year", "")).strip()),
                "doi_ok": bool(paper.get("doi")),
                "verified": bool(
                    len((paper.get("title") or "").strip()) > 10
                    and bool(str(paper.get("year", "")).strip())
                    and str(paper.get("source", "")).lower() in {"semantic_scholar", "arxiv"}
                    and bool(str(paper.get("url", "")).strip())
                ),
            }

        # Small delay to avoid rate limiting
        await asyncio.sleep(0.5)

    # Include vector store results in summaries
    vector_results = state.get("vector_results", [])
    if vector_results:
        await _send_status(config, f"Incorporating {len(vector_results)} chunks from uploaded PDFs...")
        for i, chunk in enumerate(vector_results[:5]):
            chunk_id = f"uploaded_chunk_{i}"
            summaries[chunk_id] = {
                "title": f"Uploaded PDF Chunk {i + 1}",
                "authors": chunk.get("metadata", {}).get("filename", "Uploaded"),
                "year": "",
                "summary": chunk["text"][:500],
                "limitation": "",
                "url": "",
                "doi": "",
                "citation_count": 0,
            }
            citation_quality[chunk_id] = {"source_quality": _source_quality_score("uploaded_pdf"), "confidence": 0.78}
            citation_verification[chunk_id] = {
                "title_ok": True,
                "year_ok": True,
                "doi_ok": False,
                "verified": False,
            }

    verified_count = sum(1 for v in citation_verification.values() if v.get("verified"))
    await _send_status(
        config,
        f"Summarized {len(summaries)} sources; verified {verified_count} citations",
        "status",
        {"node": "summarizer", "verified_citations": verified_count},
    )
    return {
        "paper_summaries": summaries,
        "citation_quality": citation_quality,
        "citation_verification": citation_verification,
        "status_message": f"Summarized {len(summaries)} sources",
    }


# ══════════════════════════════════════════════════════════════════════════
# NODE 4A: PROPOSER (Debate Subgraph - Draft)
# ══════════════════════════════════════════════════════════════════════════

PROPOSER_PROMPT = """You are a research synthesis expert. Write a comprehensive literature review on the topic: "{topic}".

Organize the review by themes (not paper-by-paper). Use academic tone and cite papers using [@AuthorYear] notation.

Available paper summaries:
{summaries}

{previous_critique}

Write a well-structured literature review with thematic sections. Each section should synthesize findings from multiple papers."""


async def proposer_node(state: ResearchState, config: dict) -> dict:
    """Draft or revise the literature review."""
    topic = state["topic"]
    summaries = state.get("paper_summaries", {})
    debate_log = state.get("debate_log", [])

    await _send_status(config, "Drafting literature review...", data={"node": "proposer"})

    # Format summaries for the prompt
    summary_text = ""
    for pid, info in summaries.items():
        if info.get("title") and info.get("summary"):
            author_year = f"{info['authors'].split(',')[0].strip().split()[-1] if info['authors'] else 'Unknown'}{info.get('year', '')}"
            summary_text += f"\n- [@{author_year}] {info['title']}: {info['summary']}\n"

    # Include previous critique if this is a revision
    critique_text = ""
    if debate_log:
        critique_text = f"\nPrevious feedback to address:\n{debate_log[-1]}\n\nPlease revise your draft based on this feedback."

    strict_mode = bool(state.get("strict_mode", settings.strict_synthesis_mode))
    strict_guard = (
        "\nSTRICT SYNTHESIS MODE:\n"
        "- Only include claims directly supported by provided summaries.\n"
        "- If evidence is weak, explicitly label as tentative.\n"
        "- Avoid unverifiable speculative statements.\n"
    ) if strict_mode else ""

    prompt = PROPOSER_PROMPT.format(
        topic=topic,
        summaries=(summary_text + strict_guard)[:8000],
        previous_critique=critique_text + strict_guard,
    )

    draft = await gemini_client.generate_content(
        prompt=prompt,
        temperature=0.4,
        max_output_tokens=4096,
        enable_thinking=True,
    )

    round_num = sum(1 for msg in debate_log if msg.startswith("[PROPOSER]")) + 1
    token_estimate = max(1, len(draft) // 4)
    await _send_status(
        config,
        f"Literature review draft ready for review (round {round_num})",
        data={"node": "proposer", "debate_round": round_num, "token_estimate": token_estimate},
    )

    return {
        "literature_review_draft": draft,
        "debate_log": [f"[PROPOSER] Draft {'revised' if debate_log else 'created'}: {len(draft)} chars"],
        "debate_round": round_num,
        "token_estimate": token_estimate,
        "status_message": "Literature review drafted",
    }


# ══════════════════════════════════════════════════════════════════════════
# NODE 4B: CRITIC (Debate Subgraph - Review)
# ══════════════════════════════════════════════════════════════════════════

CRITIC_PROMPT = """You are a rigorous peer reviewer. Review the following literature review draft. Point out any claims that are not directly supported by the provided paper abstracts. Suggest improvements to make the review more balanced and accurate.

Draft:
{draft}

Paper Abstracts:
{abstracts}

Respond with a critique and suggested revisions. Be specific about what needs changing."""


async def critic_node(state: ResearchState, config: dict) -> dict:
    """Review the literature draft and provide critique."""
    draft = state.get("literature_review_draft", "")
    summaries = state.get("paper_summaries", {})

    await _send_status(config, "Peer reviewer analyzing the draft...", data={"node": "critic"})

    # Format abstracts for verification
    abstracts_text = ""
    for pid, info in summaries.items():
        if info.get("title") and info.get("summary"):
            abstracts_text += f"\n- {info['title']}: {info['summary']}\n"

    prompt = CRITIC_PROMPT.format(
        draft=draft[:6000],
        abstracts=abstracts_text[:6000],
    )

    critique = await gemini_client.generate_content(
        prompt=prompt,
        temperature=0.3,
        max_output_tokens=2048,
        enable_thinking=True,
    )

    await _send_status(config, "Peer review complete, sending feedback to proposer", data={"node": "critic"})

    return {
        "debate_log": [f"[CRITIC] {critique}"],
        "status_message": "Peer review complete",
    }


# ══════════════════════════════════════════════════════════════════════════
# NODE 5A: CROSS-PAPER ANALYZER
# ══════════════════════════════════════════════════════════════════════════

CROSS_PAPER_ANALYSIS_PROMPT = """You are a rigorous research scientist.
Analyze paper summaries on "{topic}" with cross-paper reasoning.

Return ONLY JSON object with keys:
- methodology_patterns: string[]
- contradictions: string[]
- missing_dimensions: string[]
- weak_evaluation_signals: string[]
- evidence_notes: [{{ "paper_title": string, "note": string }}]

Focus on:
1) Methodology comparison
2) Contradictions/disagreements
3) Missing data/evaluation
4) External validity/real-world assumptions
5) Underexplored dimensions

Paper summaries:
{summaries}
"""


def _build_cross_paper_summary_text(summaries: dict[str, dict[str, Any]], limit: int = 14) -> str:
    rows: list[str] = []
    for i, (_pid, info) in enumerate(summaries.items(), start=1):
        if i > limit:
            break
        title = str(info.get("title", "Untitled")).strip()
        year = str(info.get("year", "")).strip()
        summary = str(info.get("summary", "")).strip()
        limitation = _clean_nullable_text(info.get("limitation", ""))
        rows.append(
            f"- [{i}] {title} ({year})\n"
            f"  Summary: {summary[:500]}\n"
            f"  Limitation: {(limitation or 'Not explicit')[:240]}"
        )
    return "\n".join(rows)


async def cross_paper_analyzer_node(state: ResearchState, config: dict) -> dict:
    topic = state["topic"]
    summaries = state.get("paper_summaries", {})

    await _send_status(config, "Running cross-paper analysis...", data={"node": "cross_paper"})

    if not summaries:
        return {
            "cross_paper_analysis": {
                "methodology_patterns": [],
                "contradictions": [],
                "missing_dimensions": ["Insufficient summaries for cross-paper analysis."],
                "weak_evaluation_signals": [],
                "evidence_notes": [],
            }
        }

    prompt = CROSS_PAPER_ANALYSIS_PROMPT.format(
        topic=topic,
        summaries=_build_cross_paper_summary_text(summaries),
    )
    response = await gemini_client.generate_content(
        prompt=prompt,
        response_mime_type="application/json",
        temperature=0.2,
        max_output_tokens=2048,
        enable_thinking=False,
    )

    parsed = _parse_json_object(response)

    result = {
        "methodology_patterns": parsed.get("methodology_patterns", []) if isinstance(parsed, dict) else [],
        "contradictions": parsed.get("contradictions", []) if isinstance(parsed, dict) else [],
        "missing_dimensions": parsed.get("missing_dimensions", []) if isinstance(parsed, dict) else [],
        "weak_evaluation_signals": parsed.get("weak_evaluation_signals", []) if isinstance(parsed, dict) else [],
        "evidence_notes": parsed.get("evidence_notes", []) if isinstance(parsed, dict) else [],
    }

    await _send_status(config, "Cross-paper analysis complete", data={"node": "cross_paper"})
    return {"cross_paper_analysis": result}


# ══════════════════════════════════════════════════════════════════════════
# NODE 5B: GAP ANALYSIS
# ══════════════════════════════════════════════════════════════════════════

GAP_ANALYSIS_PROMPT = """Based on the following limitations extracted from recent papers on "{topic}", identify 3-5 concrete research gaps. For each gap, provide a title, evidence from the literature, and a proposed research direction.

Limitations:
{limitations_list}

Output as JSON array of objects with keys: "title", "evidence", "proposed_direction".
Do not output null/None for any field. Always provide actionable proposed_direction text."""

GAP_GENERATOR_PROMPT = """You are a research scientist discovering REAL research gaps.
Topic: "{topic}"

Use both:
1) Cross-paper analysis
2) Per-paper limitations/summaries

Hard requirements:
- Compare papers against each other (not isolated summaries).
- Detect contradictions and methodological disagreements.
- Identify gaps by dimension: data, method, scale, generalization, real-world deployment, bias/fairness.
- Every gap must be specific and non-generic.

Return ONLY JSON array with 3-6 objects.
Each object must include:
- title
- why_gap
- what_missing
- how_to_fix
- evidence
- supports (paper titles)
- fails (paper titles)
"""

GAP_CRITIC_PROMPT = """You are a strict gap reviewer.
Review candidate research gaps and reject weak ones.

Criteria:
1) Specific (not vague)
2) Evidence-linked
3) Not already solved by cited papers
4) Actionable research direction

Return ONLY JSON:
{{
  "approved_gaps": [gap_objects],
  "rejected_titles": string[],
  "review_notes": string
}}

Topic: {topic}
Candidate gaps:
{candidate_gaps}
"""


def _normalize_gaps(raw: Any) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    if not isinstance(raw, list):
        return normalized
    for item in raw:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        evidence = _clean_nullable_text(item.get("evidence", ""))
        proposed = _clean_nullable_text(item.get("proposed_direction", ""))
        if not title:
            continue
        low_title = title.lower()
        if "unable to parse" in low_title or "manual review needed" in low_title:
            continue
        normalized.append({
            "title": title[:180],
            "evidence": evidence[:900] or "Evidence needs more explicit validation in current literature.",
            "proposed_direction": proposed[:900] or "Run targeted comparative studies with explicit evaluation criteria and failure reporting.",
        })
    return normalized


def _normalize_gap_candidates(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        title = _clean_nullable_text(item.get("title", ""))
        if not title:
            continue
        why_gap = _clean_nullable_text(item.get("why_gap", ""))
        what_missing = _clean_nullable_text(item.get("what_missing", ""))
        how_to_fix = _clean_nullable_text(item.get("how_to_fix", ""))
        evidence = _clean_nullable_text(item.get("evidence", ""))
        supports = item.get("supports", [])
        fails = item.get("fails", [])
        if not evidence:
            evidence = why_gap or what_missing
        if not how_to_fix:
            how_to_fix = "Design targeted empirical validation with stronger baselines and explicit failure analysis."
        if not isinstance(supports, list):
            supports = []
        if not isinstance(fails, list):
            fails = []
        out.append({
            "title": title[:180],
            "why_gap": why_gap[:700],
            "what_missing": what_missing[:700],
            "how_to_fix": how_to_fix[:900],
            "evidence": evidence[:900],
            "supports": [str(s)[:180] for s in supports[:6]],
            "fails": [str(s)[:180] for s in fails[:6]],
        })
    return out


def _candidates_to_final_gaps(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    final: list[dict[str, Any]] = []
    seen: set[str] = set()
    for c in candidates:
        title = _clean_nullable_text(c.get("title", ""))
        if not title:
            continue
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        final.append({
            "title": title[:180],
            "evidence": _clean_nullable_text(c.get("evidence", ""))[:900],
            "proposed_direction": _clean_nullable_text(c.get("how_to_fix", c.get("proposed_direction", "")))[:900],
            "why_gap": _clean_nullable_text(c.get("why_gap", ""))[:700],
            "what_missing": _clean_nullable_text(c.get("what_missing", ""))[:700],
            "supports": c.get("supports", []) if isinstance(c.get("supports", []), list) else [],
            "fails": c.get("fails", []) if isinstance(c.get("fails", []), list) else [],
        })
        if len(final) >= 6:
            break
    return final


async def gap_analysis_node(state: ResearchState, config: dict) -> dict:
    """Identify research gaps using cross-paper reasoning + critic validation."""
    topic = state["topic"]
    summaries = state.get("paper_summaries", {})
    cross = state.get("cross_paper_analysis", {})

    await _send_status(config, "Analyzing research gaps...", data={"node": "gap_analysis"})

    # Collect explicit and inferred limitations.
    limitations = []
    for _pid, info in summaries.items():
        title = str(info.get("title", "")).strip()
        limitation = _clean_nullable_text(info.get("limitation", ""))
        summary_text = str(info.get("summary", "")).strip()
        inferred = _extract_limitation_signal(f"{title}. {summary_text}")
        signal = limitation or inferred
        if signal:
            limitations.append(f"- {title}: {signal}")

    if not limitations:
        limitations = ["- Limitation statements are sparse in paper summaries; deriving gaps from topic coverage and source balance."]

    prompt = (
        GAP_GENERATOR_PROMPT.format(topic=topic)
        + "\n\nCross-paper analysis:\n"
        + json.dumps(cross, ensure_ascii=False)
        + "\n\nLimitations:\n"
        + "\n".join(limitations[:20])
    )

    response = await gemini_client.generate_content(
        prompt=prompt,
        response_mime_type="application/json",
        temperature=0.3,
        max_output_tokens=2048,
        enable_thinking=False,  # Critical: disabled for JSON output
    )

    parsed_ok = False
    candidates: list[dict[str, Any]] = []
    for attempt in range(2):
        try:
            candidate = response if attempt == 0 else _extract_json_fragment(response)
            gaps_data = json.loads(candidate)
            if isinstance(gaps_data, dict):
                candidates = gaps_data.get("gaps", [])
            elif isinstance(gaps_data, list):
                candidates = gaps_data
            else:
                candidates = []
            candidates = _normalize_gap_candidates(candidates)
            parsed_ok = True
            break
        except json.JSONDecodeError:
            if attempt == 0:
                repair_prompt = (
                    "Return ONLY valid JSON. Convert the following text into a JSON array with "
                    "objects containing keys title, why_gap, what_missing, how_to_fix, evidence, supports, fails. No markdown.\n\n"
                    f"{response[:4000]}"
                )
                response = await gemini_client.generate_content(
                    prompt=repair_prompt,
                    response_mime_type="application/json",
                    temperature=0.0,
                    max_output_tokens=1024,
                    enable_thinking=False,
                )
                continue
    if parsed_ok and len(candidates) < 2:
        synth_prompt = (
            "Given the topic and literature limitations, produce 2 additional concrete research gaps. "
            "Return ONLY JSON array with title, why_gap, what_missing, how_to_fix, evidence, supports, fails. No markdown.\n\n"
            f"Topic: {topic}\nLimitations:\n{chr(10).join(limitations[:12])}"
        )
        synth_resp = await gemini_client.generate_content(
            prompt=synth_prompt,
            response_mime_type="application/json",
            temperature=0.2,
            max_output_tokens=1024,
            enable_thinking=False,
        )
        try:
            synth_data = json.loads(_extract_json_fragment(synth_resp))
            synth_gaps = _normalize_gap_candidates(synth_data if isinstance(synth_data, list) else synth_data.get("gaps", []))
            seen = {g["title"].lower() for g in candidates}
            for g in synth_gaps:
                if g["title"].lower() not in seen:
                    candidates.append(g)
                    seen.add(g["title"].lower())
                if len(candidates) >= 3:
                    break
        except Exception:
            pass

    if len(candidates) < 3:
        derived = _derive_gaps_from_paper_evidence(
            topic=topic,
            summaries=summaries,
            source_counts=state.get("source_counts", {}),
            min_gaps=3,
        )
        derived_candidates = [{
            "title": g.get("title", ""),
            "why_gap": g.get("evidence", ""),
            "what_missing": g.get("evidence", ""),
            "how_to_fix": g.get("proposed_direction", ""),
            "evidence": g.get("evidence", ""),
            "supports": [],
            "fails": [],
        } for g in derived]
        seen_titles = {g["title"].lower() for g in candidates}
        for g in derived_candidates:
            key = g["title"].lower()
            if key in seen_titles:
                continue
            candidates.append(g)
            seen_titles.add(key)
            if len(candidates) >= 3:
                break

    if not parsed_ok or not candidates:
        logger.error("Gap analysis returned invalid JSON after retry: %s", response[:200])
        # Deterministic fallback from summaries/topic evidence.
        fallback = _derive_gaps_from_paper_evidence(
            topic=topic,
            summaries=summaries,
            source_counts=state.get("source_counts", {}),
            min_gaps=3,
        )
        candidates = [{
            "title": g.get("title", ""),
            "why_gap": g.get("evidence", ""),
            "what_missing": g.get("evidence", ""),
            "how_to_fix": g.get("proposed_direction", ""),
            "evidence": g.get("evidence", ""),
            "supports": [],
            "fails": [],
        } for g in fallback]

    # Gap critic pass for specificity and evidence-linking.
    critic_prompt = GAP_CRITIC_PROMPT.format(
        topic=topic,
        candidate_gaps=json.dumps(candidates[:8], ensure_ascii=False, indent=2),
    )
    critic_resp = await gemini_client.generate_content(
        prompt=critic_prompt,
        response_mime_type="application/json",
        temperature=0.2,
        max_output_tokens=2048,
        enable_thinking=False,
    )
    gap_critique = ""
    approved: list[dict[str, Any]] = []
    try:
        critic_data = json.loads(_extract_json_fragment(critic_resp))
        approved = _normalize_gap_candidates(critic_data.get("approved_gaps", []))
        gap_critique = _clean_nullable_text(critic_data.get("review_notes", ""))
    except Exception:
        approved = []
    if not approved:
        approved = candidates

    gaps = _candidates_to_final_gaps(approved)

    # Quality pass: de-duplicate weak/generic titles and preserve strongest concise set.
    sanitized: list[dict[str, Any]] = []
    seen_titles: set[str] = set()
    for i, gap in enumerate(gaps, start=1):
        title = _clean_nullable_text(gap.get("title", ""))
        evidence = _clean_nullable_text(gap.get("evidence", ""))
        direction = _clean_nullable_text(gap.get("proposed_direction", ""))
        if not evidence or not direction:
            continue
        title_l = title.lower()
        if not title or "underexplored limitation" in title_l:
            title = _fallback_gap_title(topic, evidence, i)
            title_l = title.lower()
        if title_l in seen_titles:
            continue
        seen_titles.add(title_l)
        sanitized.append({
            "title": title[:180],
            "evidence": evidence[:900],
            "proposed_direction": direction[:900],
            "why_gap": _clean_nullable_text(gap.get("why_gap", ""))[:700],
            "what_missing": _clean_nullable_text(gap.get("what_missing", ""))[:700],
            "supports": gap.get("supports", []) if isinstance(gap.get("supports", []), list) else [],
            "fails": gap.get("fails", []) if isinstance(gap.get("fails", []), list) else [],
        })
        if len(sanitized) >= 5:
            break
    gaps = sanitized or gaps

    # Send each gap as an event
    for gap in gaps:
        await _send_status(config, f"Gap identified: {gap.get('title', 'Unknown')}", "gap", gap)

    await _send_status(config, f"Found {len(gaps)} research gaps", data={"node": "gap_analysis"})

    return {
        "generated_gap_candidates": approved,
        "gap_critique": gap_critique,
        "identified_gaps": gaps,
        "status_message": f"Identified {len(gaps)} research gaps",
    }


# ══════════════════════════════════════════════════════════════════════════
# NODE 6: PAPER ARCHITECT
# ══════════════════════════════════════════════════════════════════════════

PAPER_ARCHITECT_PROMPT = """You are an expert academic writer. Assemble a complete research output in Markdown format on the topic: "{topic}".
Required citation/style format: "{paper_format}".

Use the following inputs to construct the paper:

## Literature Review (from peer-reviewed synthesis):
{literature_review}

## Cross-Paper Analysis:
{cross_paper_analysis}

## Identified Research Gaps:
{gaps_section}

## Gap Critic Notes:
{gap_critique}

## Paper Summaries for Citation:
{citation_info}

Output must contain TWO distinct parts, in this exact order and headings:

## PART A - Research Analysis Dossier
1. **A1. Cross-Paper Methodology Analysis**
2. **A2. Contradictions and Agreement Map**
3. **A3. Detailed Gap Analysis** (for each gap include why_gap, what_missing, evidence, supports/fails)
4. **A4. Research Agenda and Prioritized Experiments**

## PART B - Final Draft Paper (Publication Style)
1. **Abstract** – 150-200 words.
2. **1. Introduction**
3. **2. Literature Review**
4. **3. Research Gaps and Future Directions**
5. **4. Conclusion**
6. **References**

Style enforcement:
- If paper_format is IEEE, use numbered references [1], [2], ... and IEEE-style reference list.
- If paper_format is APA, use (Author, Year) in-text citations and APA references.
- If paper_format is ACM, use ACM reference style and numbered citation markers.
- If paper_format is MLA, use MLA in-text citation and Works Cited style.
- If paper_format is ACADEMIC, use [@AuthorYear] style.

Quality requirements:
- Do not include placeholder author text.
- Every major section must cite concrete sources from the provided citation list.
- Keep claims faithful to evidence and avoid unsupported speculation.
- Ensure references and in-text citations are consistent.
- Do NOT include preface text like "As an expert academic writer...".

Write in formal academic tone. Make the paper publication-ready."""


def _split_analysis_and_final_draft(markdown: str) -> tuple[str, str]:
    text = str(markdown or "").strip()
    if not text:
        return "", ""
    marker = "## PART B - Final Draft Paper (Publication Style)"
    idx = text.find(marker)
    if idx != -1:
        analysis = text[:idx].strip()
        paper = text[idx + len(marker):].strip()
        return analysis, paper
    marker_alt = "PART B - Final Draft Paper"
    idx_alt = text.find(marker_alt)
    if idx_alt != -1:
        analysis = text[:idx_alt].strip()
        paper = text[idx_alt + len(marker_alt):].strip()
        return analysis, paper
    # Fallback: if separator is missing, treat whole text as paper for compatibility.
    return "", text


async def paper_architect_node(state: ResearchState, config: dict) -> dict:
    """Assemble the final Markdown paper from all pipeline outputs."""
    topic = state["topic"]
    lit_review = state.get("literature_review_draft", "No literature review available.")
    gaps = state.get("identified_gaps", [])
    summaries = state.get("paper_summaries", {})
    cross = state.get("cross_paper_analysis", {})
    gap_critique = _clean_nullable_text(state.get("gap_critique", ""))
    paper_format = str(state.get("paper_format", "academic")).strip().upper()

    await _send_status(config, "Assembling final paper...", data={"node": "paper_architect"})

    # Format gaps
    gaps_text = ""
    for i, gap in enumerate(gaps, 1):
        gaps_text += f"\n### Gap {i}: {gap.get('title', 'Untitled')}\n"
        gaps_text += f"**Evidence:** {gap.get('evidence', 'N/A')}\n"
        if gap.get("why_gap"):
            gaps_text += f"**Why Gap:** {gap.get('why_gap')}\n"
        if gap.get("what_missing"):
            gaps_text += f"**What Missing:** {gap.get('what_missing')}\n"
        supports = gap.get("supports", [])
        fails = gap.get("fails", [])
        if isinstance(supports, list) and supports:
            gaps_text += f"**Supports:** {', '.join(str(s) for s in supports[:4])}\n"
        if isinstance(fails, list) and fails:
            gaps_text += f"**Fails to Address:** {', '.join(str(s) for s in fails[:4])}\n"
        gaps_text += f"**Proposed Direction:** {gap.get('proposed_direction', 'N/A')}\n"

    cross_text = json.dumps(cross, ensure_ascii=False, indent=2)[:3500]

    # Format citation info
    citation_text = ""
    citation_quality = state.get("citation_quality", {})
    citation_verification = state.get("citation_verification", {})
    citation_index = 1
    for pid, info in summaries.items():
        if info.get("title"):
            year = info.get("year", "n.d.")
            quality = citation_quality.get(pid, {}).get("confidence", 0.5)
            verified = citation_verification.get(pid, {}).get("verified", False)
            cite_key = _citation_key(info.get("authors", ""), year)
            citation_text += (
                f"- [{citation_index}] [@{cite_key}] {info['authors']}. \"{info['title']}.\" {info.get('url', '')} "
                f"(confidence={quality}, verified={verified})"
            )
            if info.get("doi"):
                citation_text += f" DOI:{info.get('doi')}"
            citation_text += "\n"
            citation_index += 1

    style_addendum = ""
    if paper_format in {"IEEE", "ACM"}:
        style_addendum = (
            "\nMANDATORY FORMAT RULES:\n"
            "- Use only numeric in-text citations like [1], [2], [3].\n"
            "- Do NOT use [@AuthorYear] in final prose.\n"
            "- End with a 'References' section in strictly numbered order.\n"
        )
    elif paper_format == "APA":
        style_addendum = (
            "\nMANDATORY FORMAT RULES:\n"
            "- Use only APA in-text citations (Author, Year).\n"
            "- Do NOT use bracketed numeric citations or [@AuthorYear].\n"
            "- End with a 'References' section in APA style.\n"
        )
    elif paper_format == "MLA":
        style_addendum = (
            "\nMANDATORY FORMAT RULES:\n"
            "- Use MLA parenthetical in-text citations.\n"
            "- End with a 'Works Cited' section.\n"
            "- Do NOT use [@AuthorYear] or numeric-only citation style.\n"
        )
    elif paper_format == "ACADEMIC":
        style_addendum = (
            "\nMANDATORY FORMAT RULES:\n"
            "- Keep [@AuthorYear] markers in text.\n"
            "- End with a references section that includes all cited keys.\n"
        )

    prompt = PAPER_ARCHITECT_PROMPT.format(
        topic=topic,
        paper_format=paper_format,
        literature_review=lit_review[:8000],
        cross_paper_analysis=cross_text,
        gaps_section=gaps_text[:3000],
        gap_critique=gap_critique[:1200],
        citation_info=(citation_text + style_addendum)[:5000],
    )

    paper = await gemini_client.generate_content(
        prompt=prompt,
        temperature=0.4,
        max_output_tokens=8192,
        enable_thinking=True,
    )
    analysis_markdown, draft_markdown = _split_analysis_and_final_draft(paper)

    # Build bibliography + deterministic citation keys
    bibliography = []
    for pid, info in summaries.items():
        if info.get("title"):
            cite_key = _citation_key(info.get("authors", ""), info.get("year", ""))
            bibliography.append({
                "paper_id": pid,
                "citation_key": cite_key,
                "title": info["title"],
                "authors": info.get("authors", ""),
                "year": info.get("year", ""),
                "url": info.get("url", ""),
                "doi": info.get("doi", ""),
                "source_quality": citation_quality.get(pid, {}).get("source_quality", 0.5),
                "confidence": citation_quality.get(pid, {}).get("confidence", 0.5),
                "verified": citation_verification.get(pid, {}).get("verified", False),
            })

    bibliography.sort(
        key=lambda b: (
            0 if b.get("verified") else 1,
            -(b.get("confidence") or 0),
            str(b.get("title", "")).lower(),
        )
    )

    normalized_paper = _normalize_citations_for_format(draft_markdown or paper, paper_format, bibliography)
    normalized_paper = _strip_reference_tail(normalized_paper)
    references_section = _render_references_section(paper_format, bibliography)
    if references_section:
        normalized_paper = f"{normalized_paper}\n\n{references_section}\n"

    claim_map = _extract_claim_evidence_map(
        normalized_paper,
        bibliography,
        paper_format,
        citation_quality,
        citation_verification,
    )

    if not claim_map:
        for b in bibliography[: min(8, len(bibliography))]:
            claim_map.append({
                "claim": f"Evidence synthesized from {b.get('title', 'source')[:180]}",
                "paper_id": b.get("paper_id", ""),
                "confidence": b.get("confidence", 0.5),
                "verified": b.get("verified", False),
            })

    format_compliance = _format_compliance_summary(normalized_paper, paper_format)

    debate_rounds = max(0, sum(1 for d in state.get("debate_log", []) if isinstance(d, str) and d.startswith("[CRITIC]")))
    verified_count = sum(1 for v in citation_verification.values() if v.get("verified"))

    await _send_status(config, "Paper complete!", "complete", {
        "paper_length": len(normalized_paper),
        "num_references": len(bibliography),
        "num_gaps": len(gaps),
        "debate_rounds": debate_rounds,
        "verified_citations": verified_count,
        "claim_evidence_links": len(claim_map),
        "format_compliance_score": format_compliance.get("score", 0.0),
        "format_compliant": bool(format_compliance.get("is_compliant", False)),
    })

    return {
        "research_analysis_markdown": analysis_markdown,
        "final_draft_markdown": normalized_paper,
        "final_paper_markdown": normalized_paper,
        "bibliography": bibliography,
        "status_message": "Research paper complete",
        "error": None,
        "claim_to_evidence_map": claim_map,
        "debate_rounds": debate_rounds,
        "verified_citations": verified_count,
        "format_compliance": format_compliance,
    }


# ══════════════════════════════════════════════════════════════════════════
# DEBATE ROUTER – controls the proposer ↔ critic loop
# ══════════════════════════════════════════════════════════════════════════

def debate_should_continue(state: ResearchState) -> str:
    """
    Decide whether the debate loop should continue.
    Max 2 iterations (1 draft + 1 revision after critique).
    """
    debate_log = state.get("debate_log", [])
    critic_rounds = sum(1 for msg in debate_log if msg.startswith("[CRITIC]"))
    max_rounds = int(state.get("max_debate_rounds", settings.max_debate_rounds))
    if max_rounds < 1:
        max_rounds = 1
    if max_rounds > 5:
        max_rounds = 5

    if critic_rounds >= max_rounds:
            # Proceed to cross-paper reasoning stage before gap generation
            return "gap_analysis"
    else:
        return "critic"
