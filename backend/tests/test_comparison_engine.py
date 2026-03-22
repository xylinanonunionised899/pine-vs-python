from __future__ import annotations

from datetime import UTC, datetime

from app.core.comparison_engine import ComparisonEngine
from app.models.contracts import IndicatorPoint, IndicatorSeries


def test_compare_series_detects_mismatch() -> None:
    engine = ComparisonEngine()
    timestamp = datetime(2026, 3, 9, 9, 15, tzinfo=UTC)
    pine_series = [
        IndicatorSeries(
            name="ema_fast",
            values=[IndicatorPoint(timestamp=timestamp, value=100.0)],
        )
    ]
    python_series = [
        IndicatorSeries(
            name="ema_fast",
            values=[IndicatorPoint(timestamp=timestamp, value=101.0)],
        )
    ]

    result = engine.compare_series(pine_series, python_series, tolerance=1e-6)

    assert result.summary.aligned is False
    assert result.summary.mismatched_series == 1
    assert result.first_mismatch is not None
    assert result.first_mismatch.series_name == "ema_fast"


def test_compare_series_allows_close_values() -> None:
    engine = ComparisonEngine()
    timestamp = datetime(2026, 3, 9, 9, 15, tzinfo=UTC)
    pine_series = [
        IndicatorSeries(
            name="ema_fast",
            values=[IndicatorPoint(timestamp=timestamp, value=100.0)],
        )
    ]
    python_series = [
        IndicatorSeries(
            name="ema_fast",
            values=[IndicatorPoint(timestamp=timestamp, value=100.00000001)],
        )
    ]

    result = engine.compare_series(pine_series, python_series, tolerance=1e-3)

    assert result.summary.aligned is True
    assert result.summary.mismatched_series == 0
