from __future__ import annotations

import pytest

from app.services.dependency_service import dependency_service


@pytest.mark.asyncio
async def test_dependency_status_includes_backend_and_bridge() -> None:
    status = await dependency_service.status()

    assert status.backend.available is True
    assert status.tradingview_bridge.available is True
