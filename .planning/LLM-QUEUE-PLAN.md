# LLM Request Queue/Lock — Implementation Plan

## Problem

Single RTX 5050 (8GB VRAM) can only run one Ollama inference at a time. If multiple `POST /chat` requests arrive concurrently, they compete for GPU memory, causing OOM errors or degraded performance. Need a queue so requests execute sequentially.

## Current Call Chain

```
POST /chat (chat.py:24)
  → chat_service.respond(request) (chat_service.py:18)
    → self.ollama.chat(request) (ollama_client.py:113)
      → httpx POST http://127.0.0.1:11434/api/generate (180s timeout)
```

- `chat_service` = module-level singleton (line 116)
- `OllamaClient` in `chat.py:10` is for healthcheck/list_models only (no GPU, skip)
- Settings define 3 models: `chat`, `code`, `embed` — future callers expected

## Solution: `asyncio.Lock` in a New `LLMGateway` Service

### Why a New Service (Not Modifying Existing)

1. **Single Responsibility** — `OllamaClient` handles HTTP, `ChatService` handles chat logic, `LLMGateway` handles resource serialization
2. **Reusable** — When future code-gen or embedding callers arrive, they use the same gateway
3. **Testable** — Lock behavior tested independently from chat logic
4. **Minimal invasion** — Only 1 line changes in `chat_service.py`

### Architecture

```
POST /chat
  → chat_service.respond(request)
    → llm_gateway.acquire()          # NEW: wait for lock
      → self.ollama.chat(request)    # existing inference call
    → llm_gateway.release()          # NEW: free lock
```

## Files to Create / Modify

### 1. CREATE: `backend/app/services/llm_gateway.py`

```python
"""LLM inference gateway — serializes all GPU-bound Ollama calls."""

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
```

**Key decisions:**
- `asyncio.Lock` (not `Semaphore`) — exactly 1 concurrent inference, FIFO ordering guaranteed by asyncio
- `asynccontextmanager` — clean acquire/release even on exceptions
- `max_queue_wait=300s` — a queued request waiting 5 minutes means something is stuck; fail rather than hang forever
- `queue_depth` counter — observability for logging and optional API exposure
- The `TimeoutError` from queue waiting is **separate** from the 180s httpx timeout inside `OllamaClient.chat()`. Total worst-case wait = 300s queue + 180s inference = 480s

### 2. MODIFY: `backend/app/services/chat_service.py`

Only change: wrap the `self.ollama.chat()` call with the gateway context manager.

**Before** (line 43-46):
```python
        try:
            result = await self.ollama.chat(request)
            sanitized = result.sanitized
            response = result.response
```

**After:**
```python
        try:
            from app.services.llm_gateway import llm_gateway
            async with llm_gateway.inference():
                result = await self.ollama.chat(request)
            sanitized = result.sanitized
            response = result.response
```

Also add a `TimeoutError` catch for queue timeout (after the existing `except OllamaChatError`):
```python
        except TimeoutError as exc:
            fallback_used = True
            error_class = ChatErrorClass.TIMEOUT
            response = self._fallback_response(
                request,
                OllamaChatError(ChatErrorClass.TIMEOUT, str(exc)),
            )
```

**Total changes to chat_service.py**: 4 lines added, 0 lines removed.

### 3. OPTIONAL: Add queue status to health endpoint

**Modify** `backend/app/api/chat.py` — add gateway status to healthcheck:

```python
@router.get("/health")
def chat_health() -> dict[str, object]:
    from app.services.llm_gateway import llm_gateway
    health = client.healthcheck()
    health["llm_busy"] = llm_gateway.is_busy
    health["llm_queue_depth"] = llm_gateway.queue_depth
    return health
```

This lets the frontend show "LLM busy" status if desired (no contract change — just extra fields).

### 4. CREATE: `backend/tests/test_llm_gateway.py`

```python
"""Tests for LLM inference gateway."""

import asyncio
import pytest

from app.services.llm_gateway import LLMGateway


@pytest.mark.asyncio
async def test_single_request_passes_through():
    gw = LLMGateway()
    async with gw.inference():
        assert gw.is_busy
    assert not gw.is_busy


@pytest.mark.asyncio
async def test_concurrent_requests_serialize():
    gw = LLMGateway()
    order: list[int] = []

    async def task(task_id: int, delay: float):
        async with gw.inference():
            order.append(task_id)
            await asyncio.sleep(delay)

    # Task 1 holds lock for 0.1s, task 2 waits
    await asyncio.gather(task(1, 0.1), task(2, 0.0))
    assert order == [1, 2]  # FIFO


@pytest.mark.asyncio
async def test_queue_depth_tracking():
    gw = LLMGateway()
    assert gw.queue_depth == 0

    async def hold_lock():
        async with gw.inference():
            await asyncio.sleep(0.2)

    async def check_depth():
        await asyncio.sleep(0.05)  # Let hold_lock acquire first
        assert gw.is_busy
        assert gw.queue_depth >= 1  # We're waiting
        async with gw.inference():
            pass

    await asyncio.gather(hold_lock(), check_depth())


@pytest.mark.asyncio
async def test_queue_timeout_raises():
    gw = LLMGateway(max_queue_wait=0.1)

    async with gw.inference():
        with pytest.raises(TimeoutError, match="queue wait exceeded"):
            await asyncio.wait_for(
                gw.inference().__aenter__(),
                timeout=0.5,
            )


@pytest.mark.asyncio
async def test_error_in_inference_releases_lock():
    gw = LLMGateway()

    with pytest.raises(ValueError):
        async with gw.inference():
            raise ValueError("simulated crash")

    # Lock should be released despite error
    assert not gw.is_busy
    async with gw.inference():
        pass  # Should not deadlock
```

## Timeout Interaction

```
Timeline for a queued request:
├── Queue wait (max 300s) ──── asyncio.wait_for(lock.acquire(), 300)
│   └── If exceeded → TimeoutError → fallback response
└── Inference (max 180s) ──── httpx timeout=180
    └── If exceeded → httpx.TimeoutException → OllamaChatError(TIMEOUT)
```

- Queue timeout (300s) is **independent** of inference timeout (180s)
- Total worst-case: 300 + 180 = 480s (8 minutes)
- The 300s queue wait is configurable via `LLMGateway(max_queue_wait=...)`
- If you want frontend feedback, poll `GET /chat/health` for `llm_busy` and `llm_queue_depth`

## What Does NOT Change

- `POST /chat` request/response contract — identical
- `OllamaClient` class — untouched
- Frontend code — no changes needed
- `GET /chat/health` and `GET /chat/models` — not GPU-bound, no queueing
- Settings — no new config (max_queue_wait is hardcoded, can be moved to settings later)

## Execution Order

1. Create `backend/app/services/llm_gateway.py` (new file, zero risk)
2. Create `backend/tests/test_llm_gateway.py` (new file, zero risk)
3. Run gateway tests: `python -m pytest backend/tests/test_llm_gateway.py -v`
4. Modify `chat_service.py` (4 lines added)
5. Modify `chat.py` health endpoint (3 lines added, optional)
6. Run full test suite: `python -m pytest backend/tests/ -v`
7. Manual test: open 2 browser tabs, send chat messages simultaneously, confirm sequential execution in logs

## Future Extensibility

When `ollama_default_code_model` or `ollama_embed_model` callers are added:

```python
from app.services.llm_gateway import llm_gateway

async with llm_gateway.inference():
    result = await ollama.generate(code_request)
```

Same singleton, same lock, same queue. No additional infrastructure needed.
