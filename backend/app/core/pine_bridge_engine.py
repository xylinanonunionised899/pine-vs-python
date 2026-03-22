from __future__ import annotations

from pathlib import Path
from typing import Any

from app.core.settings import settings


class PineBridgeEngine:
    def handshake(self) -> dict[str, Any]:
        session_file = Path(settings.tradingview_session_file)
        return {
            "mode": "pine_bridge",
            "session_file_exists": session_file.exists(),
            "export_contract": "TradingView export adapter must emit named series, signals, and trade events as JSON.",
            "status": "ready" if session_file.exists() else "missing_session",
        }
