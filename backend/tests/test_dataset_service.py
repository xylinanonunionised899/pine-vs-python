from __future__ import annotations

from pathlib import Path

import pytest

from app.models.contracts import DataSourceConfig
from app.services.dataset_service import dataset_service


def test_save_dataset_persists_metadata_and_rows() -> None:
    artifact = dataset_service.save(
        DataSourceConfig(
            type="csv",
            name="Fixture dataset",
            file_path=str(Path("backend/tests/fixtures/sample_ohlcv.csv")),
            symbol="SBIN",
            timeframe="5m",
            timezone="UTC",
            mapping={
                "timestamp": "timestamp",
                "open": "open",
                "high": "high",
                "low": "low",
                "close": "close",
                "volume": "volume",
            },
        )
    )

    assert artifact.dataset_id.startswith("dataset-")
    assert artifact.row_count == 3
    assert Path(artifact.data_path).exists()
    assert any(dataset.dataset_id == artifact.dataset_id for dataset in dataset_service.list_datasets())


def test_save_dataset_supports_tradingview_vix_export_preset() -> None:
    artifact = dataset_service.save(
        DataSourceConfig(
            type="csv",
            name="TradingView VIX export",
            file_path=str(Path("backend/tests/fixtures/tradingview_vix_export.csv")),
            symbol="CBOE:VIX",
            timeframe="5m",
            timezone="America/New_York",
            extra={"import_preset": "tradingview_vix"},
        )
    )

    assert artifact.symbol == "CBOE:VIX"
    assert artifact.row_count == 3
    assert artifact.mapping.timestamp == "time"


def test_save_dataset_rejects_wrong_symbol_for_tradingview_vix_preset() -> None:
    with pytest.raises(ValueError, match="CBOE:VIX"):
        dataset_service.save(
            DataSourceConfig(
                type="csv",
                name="TradingView VIX export",
                file_path=str(Path("backend/tests/fixtures/tradingview_vix_export.csv")),
                symbol="SBIN",
                timeframe="5m",
                timezone="America/New_York",
                extra={"import_preset": "tradingview_vix"},
            )
        )