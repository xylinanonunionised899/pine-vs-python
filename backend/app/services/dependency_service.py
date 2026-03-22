from __future__ import annotations

import httpx

from app.core.settings import settings
from app.models.contracts import DependencyStatus, DependencyStatusItem


class DependencyService:
    async def status(self) -> DependencyStatus:
        ollama_available = settings.ollama_bin.exists()
        ollama_detail = f"Binary found at {settings.ollama_bin}" if ollama_available else "Ollama binary not found"
        if ollama_available:
            try:
                async with httpx.AsyncClient(timeout=2) as client:
                    response = await client.get("http://127.0.0.1:11434/api/version")
                    if response.is_success:
                        ollama_detail = f"Ollama API reachable: {response.text}"
                    else:
                        ollama_detail = "Ollama binary exists but API is not responding"
                        ollama_available = False
            except Exception:
                ollama_detail = "Ollama binary exists but API is not responding"
                ollama_available = False
        return DependencyStatus(
            backend=DependencyStatusItem(name="backend", available=True, detail="API process supports replay, live, and bridge workflows."),
            ollama=DependencyStatusItem(name="ollama", available=ollama_available, detail=ollama_detail),
            tradingview_bridge=DependencyStatusItem(name="tradingview_bridge", available=True, detail="Manual bridge artifact upload is supported. Session automation can be added later."),
            market_provider=DependencyStatusItem(name="market_provider", available=bool(settings.polygon_api_key), detail="Polygon API key configured" if settings.polygon_api_key else "No market API key configured; dataset-driven live mode remains available."),
        )


dependency_service = DependencyService()
