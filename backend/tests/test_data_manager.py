from __future__ import annotations

from app.core.data_manager import DataManager


def test_normalize_column_mapping_prefers_standard_names() -> None:
    manager = DataManager()
    mapping = manager.normalize_column_mapping(["Timestamp", "Open", "High", "Low", "Close", "Volume"])

    assert mapping.timestamp == "Timestamp"
    assert mapping.open == "Open"
    assert mapping.volume == "Volume"


def test_normalize_column_mapping_supports_shorthand_market_columns() -> None:
    manager = DataManager()
    mapping = manager.normalize_column_mapping(["t", "o", "h", "l", "c", "v", "dt"])

    assert mapping.timestamp == "dt"
    assert mapping.open == "o"
    assert mapping.high == "h"
    assert mapping.low == "l"
    assert mapping.close == "c"
    assert mapping.volume == "v"


def test_normalize_column_mapping_supports_tradingview_vix_preset() -> None:
    manager = DataManager()
    mapping = manager.normalize_column_mapping(
        ["time", "open", "high", "low", "close", "Volume"],
        import_preset=manager.TRADINGVIEW_VIX_PRESET,
    )

    assert mapping.timestamp == "time"
    assert mapping.open == "open"
    assert mapping.high == "high"
    assert mapping.low == "low"
    assert mapping.close == "close"
    assert mapping.volume == "Volume"