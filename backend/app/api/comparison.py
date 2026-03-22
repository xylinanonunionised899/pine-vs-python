from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.comparison_engine import ComparisonEngine
from app.models.contracts import IndicatorPoint, IndicatorSeries, TradeEvent

router = APIRouter(prefix="/comparison", tags=["comparison"])
comparison_engine = ComparisonEngine()


class ComparisonPreviewRequest(BaseModel):
    tolerance: float = 1e-6


@router.post("/sample")
def sample_comparison(payload: ComparisonPreviewRequest):
    timestamps = [
        datetime(2026, 3, 9, 9, 15, tzinfo=UTC),
        datetime(2026, 3, 9, 9, 20, tzinfo=UTC),
    ]
    pine_series = [
        IndicatorSeries(
            name="ema_fast",
            values=[
                IndicatorPoint(timestamp=timestamps[0], value=245.5),
                IndicatorPoint(timestamp=timestamps[1], value=246.2),
            ],
        )
    ]
    python_series = [
        IndicatorSeries(
            name="ema_fast",
            values=[
                IndicatorPoint(timestamp=timestamps[0], value=245.5),
                IndicatorPoint(timestamp=timestamps[1], value=246.9),
            ],
        )
    ]
    result = comparison_engine.compare_series(pine_series, python_series, payload.tolerance)
    result.trade_mismatches = comparison_engine.compare_trades(
        pine_trades=[
            TradeEvent(
                timestamp=timestamps[0],
                side="long_entry",
                price=245.5,
                qty=1,
                reason="sample",
                source_engine="pine",
            )
        ],
        python_trades=[
            TradeEvent(
                timestamp=timestamps[0],
                side="long_entry",
                price=245.8,
                qty=1,
                reason="sample",
                source_engine="python",
            )
        ],
        tolerance=payload.tolerance,
    )
    return result
