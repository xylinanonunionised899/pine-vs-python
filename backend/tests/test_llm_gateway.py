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
    depth_while_waiting: list[int] = []

    async def hold_lock():
        async with gw.inference():
            await asyncio.sleep(0.2)

    async def queued_task():
        await asyncio.sleep(0.05)  # Let hold_lock acquire first
        assert gw.is_busy
        async with gw.inference():
            depth_while_waiting.append(gw.queue_depth)

    await asyncio.gather(hold_lock(), queued_task())
    # After everything completes, depth is back to 0
    assert gw.queue_depth == 0


@pytest.mark.asyncio
async def test_queue_timeout_raises():
    gw = LLMGateway(max_queue_wait=0.1)

    async def blocked_request():
        async with gw.inference():
            with pytest.raises(TimeoutError, match="queue wait exceeded"):
                async with gw.inference():
                    pass  # Should never reach here

    await blocked_request()


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
