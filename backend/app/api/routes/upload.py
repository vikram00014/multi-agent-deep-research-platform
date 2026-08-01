"""
Delve PDF Upload Route
───────────────────────
POST /upload/pdf – Upload a PDF, extract text, chunk, and store in ChromaDB.
"""

import logging
import uuid

from fastapi import APIRouter, File, UploadFile, HTTPException
from pydantic import BaseModel

from app.services.parsing import extract_text_from_pdf, chunk_text
from app.services.vector_store import vector_store

logger = logging.getLogger("delve.api.upload")

router = APIRouter(prefix="/upload", tags=["upload"])
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
READ_CHUNK_BYTES = 1024 * 1024


class UploadResponse(BaseModel):
    file_id: str
    filename: str
    chunks_stored: int
    total_characters: int


@router.post("/pdf", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload a PDF file.

    Extracts text, splits into overlapping chunks, and stores
    in ChromaDB for later retrieval during research.
    """
    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    contents = bytearray()
    while True:
        chunk = await file.read(READ_CHUNK_BYTES)
        if not chunk:
            break
        if len(contents) + len(chunk) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail="File too large (max 50MB)")
        contents.extend(chunk)

    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="File is empty")
    if not bytes(contents[:5]).startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="File does not look like a PDF")

    # Generate file ID
    file_id = str(uuid.uuid4())

    try:
        # Extract text from PDF
        text = extract_text_from_pdf(bytes(contents))

        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF")

        # Chunk the text
        chunks = chunk_text(text)

        if not chunks:
            raise HTTPException(status_code=400, detail="No text chunks generated from PDF")

        # Store in ChromaDB
        metadata = {
            "filename": file.filename,
            "file_size": len(contents),
        }
        chunks_stored = vector_store.add_chunks(chunks, file_id, metadata)

        logger.info("Uploaded PDF '%s' -> %d chunks stored (id: %s)", file.filename, chunks_stored, file_id)

        return UploadResponse(
            file_id=file_id,
            filename=file.filename,
            chunks_stored=chunks_stored,
            total_characters=len(text),
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("PDF upload failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)[:200]}")
