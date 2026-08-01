"""
Delve PDF Parsing Service
──────────────────────────
Extracts text from uploaded PDFs and splits into chunks.
"""

import logging
import io
from typing import BinaryIO

from pypdf import PdfReader

logger = logging.getLogger("delve.parsing")

# ── Constants ─────────────────────────────────────────────────────────────
CHUNK_SIZE = 1000       # characters per chunk
CHUNK_OVERLAP = 200     # overlap between consecutive chunks


def extract_text_from_pdf(file_data: bytes) -> str:
    """
    Extract all text content from a PDF file.

    Args:
        file_data: Raw PDF bytes.

    Returns:
        Full text content of the PDF.
    """
    try:
        reader = PdfReader(io.BytesIO(file_data))
        text_parts = []

        for page_num, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

        full_text = "\n\n".join(text_parts)
        logger.info("Extracted %d characters from PDF (%d pages)", len(full_text), len(reader.pages))
        return full_text

    except Exception as e:
        logger.error("PDF extraction failed: %s", e)
        raise ValueError(f"Could not extract text from PDF: {e}")


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """
    Split text into overlapping chunks.

    Args:
        text: Full text to split.
        chunk_size: Target size for each chunk.
        overlap: Number of overlapping characters between chunks.

    Returns:
        List of text chunks.
    """
    if not text.strip():
        return []

    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size

        # Try to break at a sentence boundary
        if end < len(text):
            # Look for a period, newline, or other break near the boundary
            for sep in [". ", ".\n", "\n\n", "\n", " "]:
                idx = text.rfind(sep, start + chunk_size // 2, end + 100)
                if idx != -1:
                    end = idx + len(sep)
                    break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        start = end - overlap
        if start >= len(text):
            break

    logger.info("Split text into %d chunks (size=%d, overlap=%d)", len(chunks), chunk_size, overlap)
    return chunks
