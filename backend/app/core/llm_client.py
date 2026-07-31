"""
Anthropic Messages API Client
──────────────────────────────
Async HTTP client for Claude models over the Anthropic Messages API.

Key behaviours:
  • Auth via x-api-key header, with automatic fallback to Authorization: Bearer
  • Exponential backoff on 429 / 5xx errors
  • Extended thinking disabled for JSON requests so the whole budget goes to output
"""

import asyncio
import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger("orion.llm")

# Anthropic requires max_tokens > thinking budget, and a minimum budget of 1024.
_MIN_THINKING_BUDGET = 1024


class AnthropicClient:
    """Async wrapper around the Anthropic Messages API."""

    def __init__(self):
        self._url = settings.messages_url
        self._client: Optional[httpx.AsyncClient] = None
        self._client_lock = asyncio.Lock()
        # Some gateways expect Bearer instead of x-api-key. Probed on first failure.
        self._use_bearer = False

    def _build_headers(self) -> dict:
        auth = (
            {"Authorization": f"Bearer {settings.llm_api_key}"}
            if self._use_bearer
            else {"x-api-key": settings.llm_api_key}
        )
        return {
            **auth,
            "anthropic-version": settings.anthropic_version,
            "Content-Type": "application/json",
        }

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            async with self._client_lock:
                # Re-check inside the lock in case another coroutine created it.
                if self._client is None or self._client.is_closed:
                    self._client = httpx.AsyncClient(timeout=httpx.Timeout(120.0))
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ── Image Generation ──────────────────────────────────────────────────

    async def generate_image(self, prompt: str) -> str:
        """
        Image generation is not offered by the Anthropic API. Callers treat an
        empty string as "unavailable" and fall back to a text figure caption.
        """
        return ""

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
        Send a prompt to Claude and return the text response.

        Args:
            prompt: The user prompt text.
            response_mime_type: "text/plain" or "application/json".
            temperature: Sampling temperature (0.0 – 1.0).
            max_output_tokens: Max tokens in the response.
            enable_thinking: Whether to enable extended thinking.
                             Auto-disabled when JSON output is requested.
        """
        return await self._generate(
            system_prompt=None,
            user_prompt=prompt,
            response_mime_type=response_mime_type,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            enable_thinking=enable_thinking,
        )

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
        return await self._generate(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_mime_type=response_mime_type,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            enable_thinking=enable_thinking,
        )

    async def _generate(
        self,
        system_prompt: Optional[str],
        user_prompt: str,
        response_mime_type: str,
        temperature: float,
        max_output_tokens: int,
        enable_thinking: bool,
    ) -> str:
        if response_mime_type == "application/json":
            # Callers parse with helpers that already strip markdown fences and
            # accept either an object or an array, so no output steering is needed.
            enable_thinking = False

        payload: dict = {
            "model": settings.llm_model,
            "max_tokens": max_output_tokens,
            "messages": [{"role": "user", "content": user_prompt}],
            "temperature": temperature,
        }

        if system_prompt:
            payload["system"] = system_prompt

        if enable_thinking:
            budget = max(_MIN_THINKING_BUDGET, min(2048, max_output_tokens - 1))
            if budget < max_output_tokens:
                payload["thinking"] = {"type": "enabled", "budget_tokens": budget}
                # Extended thinking requires the default temperature.
                payload.pop("temperature", None)

        return await self._send_with_retry(payload)

    # ── API Key Validation ────────────────────────────────────────────────

    async def validate_api_key(self) -> bool:
        """
        Validate the API key with a minimal call. Retries once with a Bearer
        header so either gateway auth convention works.
        Returns True if the key is accepted.
        """
        payload = {
            "model": settings.llm_model,
            "max_tokens": 16,
            "messages": [{"role": "user", "content": "OK"}],
        }

        try:
            client = await self._get_client()
            for use_bearer in (self._use_bearer, not self._use_bearer):
                self._use_bearer = use_bearer
                resp = await client.post(self._url, json=payload, headers=self._build_headers())

                if resp.status_code == 200:
                    scheme = "Authorization: Bearer" if use_bearer else "x-api-key"
                    logger.info("LLM API key validated successfully (auth via %s).", scheme)
                    return True

                if resp.status_code not in (401, 403):
                    logger.error(
                        "API key validation failed: HTTP %s - %s",
                        resp.status_code, resp.text[:300],
                    )
                    return False

            logger.error("API key rejected with both x-api-key and Bearer auth.")
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
        """Send request with exponential backoff on 429/5xx and timeouts."""
        client = await self._get_client()
        last_error = None

        for attempt in range(max_retries):
            try:
                resp = await client.post(self._url, json=payload, headers=self._build_headers())

                if resp.status_code == 429 or resp.status_code >= 500:
                    last_error = f"HTTP {resp.status_code}"
                    if attempt < max_retries - 1:
                        wait = 2 ** attempt
                        logger.warning(
                            "LLM API %s – retrying in %ds (attempt %d/%d)",
                            resp.status_code, wait, attempt + 1, max_retries,
                        )
                        await asyncio.sleep(wait)
                    continue

                if resp.status_code != 200:
                    error_text = resp.text[:500]
                    raise RuntimeError(
                        f"LLM API error {resp.status_code}: {error_text}"
                    )

                return self._extract_text(resp.json())

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

        raise RuntimeError(f"LLM API failed after {max_retries} retries: {last_error}")

    @staticmethod
    def _extract_text(response_data: dict) -> str:
        """Extract text from an Anthropic Messages API response.

        Content is a list of blocks; `thinking` blocks are skipped so only the
        visible answer is returned.
        """
        try:
            blocks = response_data.get("content", [])
            if not blocks:
                logger.debug("No content blocks in API response")
                return ""

            text_parts = [
                block.get("text", "")
                for block in blocks
                if block.get("type") == "text" and block.get("text")
            ]

            result = "".join(text_parts).strip()

            if not result:
                stop_reason = response_data.get("stop_reason", "")
                logger.warning(
                    "Response contained no text blocks (stop_reason=%s).", stop_reason
                )

            return result

        except (KeyError, IndexError, AttributeError) as exc:
            logger.debug("Error extracting text from response: %s", exc)
            return ""


# Singleton instance
llm_client = AnthropicClient()
