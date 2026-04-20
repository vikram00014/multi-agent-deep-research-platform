"""
Vertex AI Gemini 2.5 Flash Client
──────────────────────────────────
Async HTTP client for Google Vertex AI Express Mode.

Key behaviours:
  • Auth via API key as query parameter (no project ID needed)
  • Exponential backoff on 429 / 5xx errors
  • Automatic empty-response retry with thinkingBudget=0
  • JSON output mode disables thinking to prevent token consumption
"""

import asyncio
import json
import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger("orion.llm")


class VertexGeminiClient:
    """Async wrapper around Vertex AI Gemini 2.5 Flash REST API."""

    def __init__(self):
        self._url = settings.generate_content_url
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(120.0))
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ── Core Generation Method ────────────────────────────────────────────

    async def generate_content(
        self,
        prompt: str,
        response_mime_type: str = "text/plain",
        temperature: float = 0.4,
        max_output_tokens: int = 2048,
        enable_thinking: bool = True,
    ) -> str:
        """
        Send a prompt to Gemini 2.5 Flash and return the text response.

        Args:
            prompt: The user prompt text.
            response_mime_type: "text/plain" or "application/json".
            temperature: Sampling temperature (0.0 – 2.0).
            max_output_tokens: Max tokens in the response.
            enable_thinking: Whether to let the model use thinking budget.
                             Auto-disabled when response_mime_type is JSON.
        """
        # CRITICAL: Disable thinking for JSON output to prevent token consumption
        if response_mime_type == "application/json":
            enable_thinking = False

        payload = {
            "contents": [
                {"role": "user", "parts": [{"text": prompt}]}
            ],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_output_tokens,
                "responseMimeType": response_mime_type,
            },
        }

        # Some models/endpoints reject explicit thinking_budget=0.
        # Only include thinkingConfig when thinking is intentionally enabled.
        if enable_thinking:
            payload["generationConfig"]["thinkingConfig"] = {
                "includeThoughts": False,
                "thinkingBudget": 2048,
            }

        return await self._send_with_retry(payload)

    # ── Multi-turn / System Prompt Generation ─────────────────────────────

    async def generate_with_system(
        self,
        system_prompt: str,
        user_prompt: str,
        response_mime_type: str = "text/plain",
        temperature: float = 0.4,
        max_output_tokens: int = 4096,
        enable_thinking: bool = True,
    ) -> str:
        """Generate content with a system instruction."""
        if response_mime_type == "application/json":
            enable_thinking = False

        payload = {
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": [
                {"role": "user", "parts": [{"text": user_prompt}]}
            ],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_output_tokens,
                "responseMimeType": response_mime_type,
            },
        }

        if enable_thinking:
            payload["generationConfig"]["thinkingConfig"] = {
                "includeThoughts": False,
                "thinkingBudget": 2048,
            }

        return await self._send_with_retry(payload)

    # ── API Key Validation ────────────────────────────────────────────────

    async def validate_api_key(self) -> bool:
        """
        Validate the Vertex API key with a minimal test call.
        Returns True if the key is valid (HTTP 200 + at least one candidate).
        """
        # Keep validation payload minimal for broad model compatibility.
        payload = {
            "contents": [
                {"role": "user", "parts": [{"text": "OK"}]}
            ],
            "generationConfig": {
                "temperature": 0,
                "maxOutputTokens": 16,
                "responseMimeType": "text/plain",
            },
        }

        try:
            client = await self._get_client()
            resp = await client.post(self._url, json=payload)

            if resp.status_code != 200:
                logger.error("API key validation failed: HTTP %s - %s", resp.status_code, resp.text[:300])
                return False

            data = resp.json()
            candidates = data.get("candidates", [])
            if len(candidates) > 0:
                logger.info("Vertex AI API key validated successfully.")
                return True

            logger.error("API key validation: 200 but no candidates.")
            return False

        except Exception as e:
            logger.error("API key validation exception: %s", e)
            return False

    # ── Internal: Retry Logic ─────────────────────────────────────────────

    async def _send_with_retry(
        self,
        payload: dict,
        max_retries: int = 3,
    ) -> str:
        """
        Send request with exponential backoff.
        On empty response (thinking consumed tokens), retry with thinkingBudget=0.
        """
        client = await self._get_client()
        last_error = None

        for attempt in range(max_retries):
            try:
                resp = await client.post(self._url, json=payload)

                if resp.status_code == 429 or resp.status_code >= 500:
                    wait = 2 ** attempt
                    logger.warning(
                        "Gemini API %s – retrying in %ds (attempt %d/%d)",
                        resp.status_code, wait, attempt + 1, max_retries,
                    )
                    await asyncio.sleep(wait)
                    continue

                if resp.status_code != 200:
                    error_text = resp.text[:500]
                    raise RuntimeError(
                        f"Gemini API error {resp.status_code}: {error_text}"
                    )

                data = resp.json()
                text = self._extract_text(data)

                # Handle empty response: retry with thinking config removed
                if not text and attempt < max_retries - 1:
                    logger.warning(
                        "Empty response (thinking may have consumed tokens). "
                        "Retrying with thinkingConfig removed."
                    )
                    payload.get("generationConfig", {}).pop("thinkingConfig", None)
                    await asyncio.sleep(1)
                    continue

                return text

            except httpx.TimeoutException:
                last_error = "Request timed out"
                logger.warning("Timeout on attempt %d/%d", attempt + 1, max_retries)
                await asyncio.sleep(2 ** attempt)

            except RuntimeError:
                raise

            except Exception as e:
                last_error = str(e)
                logger.error("Unexpected error: %s", e)
                await asyncio.sleep(2 ** attempt)

        raise RuntimeError(f"Gemini API failed after {max_retries} retries: {last_error}")

    @staticmethod
    def _extract_text(response_data: dict) -> str:
        """Extract text from the Gemini API response JSON."""
        try:
            candidates = response_data.get("candidates", [])
            if not candidates:
                return ""

            parts = candidates[0].get("content", {}).get("parts", [])
            text_parts = [p.get("text", "") for p in parts if "text" in p]
            return "".join(text_parts).strip()

        except (KeyError, IndexError):
            return ""


# Singleton instance
gemini_client = VertexGeminiClient()
