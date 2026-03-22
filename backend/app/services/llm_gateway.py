"""LLM inference gateway — serializes all GPU-bound Ollama calls.

Single RTX 5050 (8GB VRAM) can only run one inference at a time.
This module provides an async lock so concurrent requests queue up
instead of competing for GPU memory.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

logger = logging.getLogger(__name__)


class LLMGateway:
    """Process-wide async lock for Ollama GPU inference.

    Usage:
        async with llm_gateway.inference():
            result = await ollama.chat(request)
    """

    def __init__(self, max_queue_wait: float = 300.0) -> None:
        self._lock = asyncio.Lock()
        self._queue_depth = 0
        self._max_queue_wait = max_queue_wait  # seconds

    @asynccontextmanager
    async def inference(self) -> AsyncGenerator[None, None]:
        """Acquire exclusive GPU access. FIFO ordering via asyncio.Lock."""
        self._queue_depth += 1
        position = self._queue_depth
        if self._lock.locked():
            logger.info("llm_gateway queue_position=%d waiting for GPU", position)

        try:
            await asyncio.wait_for(self._lock.acquire(), timeout=self._max_queue_wait)
        except asyncio.TimeoutError:
            self._queue_depth -= 1
            logger.warning("llm_gateway queue_timeout after %.0fs position=%d", self._max_queue_wait, position)
            raise TimeoutError(
                f"LLM queue wait exceeded {self._max_queue_wait}s. "
                f"Another inference is still running."
            )

        self._queue_depth -= 1
        logger.info("llm_gateway acquired queue_remaining=%d", self._queue_depth)
        try:
            yield
        finally:
            self._lock.release()
            logger.info("llm_gateway released queue_remaining=%d", self._queue_depth)

    @property
    def is_busy(self) -> bool:
        return self._lock.locked()

    @property
    def queue_depth(self) -> int:
        return self._queue_depth


# Module-level singleton — process-wide lock
llm_gateway = LLMGateway()
