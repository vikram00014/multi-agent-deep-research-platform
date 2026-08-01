"""
Delve Vector Store Service
───────────────────────────
ChromaDB client for storing and querying PDF chunks.
Uses the default all-MiniLM-L6-v2 embedding model.
"""

import logging
import uuid
from typing import Any

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.core.config import settings

logger = logging.getLogger("delve.vectorstore")


class VectorStoreService:
    """Manages ChromaDB collections for uploaded PDF chunks."""

    def __init__(self):
        self._client = chromadb.Client(ChromaSettings(
            anonymized_telemetry=False,
            is_persistent=True,
            persist_directory=settings.chroma_persist_dir,
        ))
        self._collection = self._client.get_or_create_collection(
            name="delve_papers",
            metadata={"hnsw:space": "cosine"},
        )
        logger.info("ChromaDB initialized at %s", settings.chroma_persist_dir)

    def add_chunks(
        self,
        chunks: list[str],
        file_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> int:
        """
        Add text chunks from a PDF to the vector store.

        Args:
            chunks: List of text chunks.
            file_id: Unique identifier for the uploaded file.
            metadata: Optional metadata (filename, upload_time, etc).

        Returns:
            Number of chunks stored.
        """
        if not chunks:
            return 0

        ids = [f"{file_id}_chunk_{i}" for i in range(len(chunks))]
        metadatas = [
            {**(metadata or {}), "file_id": file_id, "chunk_index": i}
            for i in range(len(chunks))
        ]

        self._collection.add(
            documents=chunks,
            ids=ids,
            metadatas=metadatas,
        )

        logger.info("Stored %d chunks for file %s", len(chunks), file_id)
        return len(chunks)

    def query(self, query_text: str, n_results: int = 5, file_ids: list[str] | None = None) -> list[dict]:
        """
        Query the vector store for similar chunks.

        Args:
            query_text: The search query.
            n_results: Max results to return.
            file_ids: Optional filter by file IDs.

        Returns:
            List of dicts with 'text', 'metadata', 'distance'.
        """
        where_filter = None
        if file_ids:
            where_filter = {"file_id": {"$in": file_ids}}

        results = self._collection.query(
            query_texts=[query_text],
            n_results=n_results,
            where=where_filter,
        )

        output = []
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        dists = results.get("distances", [[]])[0]

        for doc, meta, dist in zip(docs, metas, dists):
            output.append({
                "text": doc,
                "metadata": meta,
                "distance": dist,
            })

        return output


# Singleton
vector_store = VectorStoreService()
