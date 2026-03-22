from __future__ import annotations

from typing import Any

from app.models.contracts import StrategyArtifact


class PineLocalEngine:
    SUPPORTED_KEYWORDS = {
        "indicator",
        "strategy",
        "plot",
        "plotshape",
        "ta.ema",
        "ta.sma",
        "ta.rsi",
        "ta.macd",
    }

    def validate(self, artifact: StrategyArtifact) -> dict[str, Any]:
        source = artifact.source_code
        unsupported = [
            token for token in ["request.security", "strategy.order", "array.new_float"] if token in source
        ]
        return {
            "language": artifact.language.value,
            "supported_subset": not unsupported,
            "unsupported_tokens": unsupported,
            "status": "ready" if not unsupported else "needs_bridge_mode",
        }
