from __future__ import annotations

from pathlib import Path

from app.models.contracts import IndicatorPoint, IndicatorSeries, DataSourceConfig, RunConfig, StrategyArtifact
from app.services.bridge_service import bridge_service
from app.services.dataset_service import dataset_service
from app.services.run_service import run_service


FIXTURE_PATH = Path("backend/tests/fixtures/sample_ohlcv.csv")

PYTHON_ARTIFACT = StrategyArtifact(
    language="python",
    name="Replay strategy",
    source_code="""import pandas as pd\n\ndef run_strategy(frame: pd.DataFrame) -> pd.DataFrame:\n    frame = frame.copy()\n    frame['ema_fast'] = frame['close'].rolling(window=2, min_periods=1).mean()\n    frame['long_condition'] = frame['close'] >= frame['ema_fast']\n    return frame\n""",
    declared_outputs=["ema_fast", "long_condition"],
)

COMPANION_ARTIFACT = StrategyArtifact(
    language="python",
    name="External frame strategy",
    source_code="""import pandas as pd\n\ndef run_strategy(frame: pd.DataFrame, external_frames=None) -> pd.DataFrame:\n    frame = frame.copy()\n    vix = external_frames['CBOE:VIX'][['timestamp', 'close']].copy()\n    vix = vix.rename(columns={'close': 'vix_close'})\n    frame = frame.merge(vix, on='timestamp', how='left')\n    frame['long_condition'] = frame['vix_close'].fillna(0) >= 0\n    return frame\n""",
    declared_outputs=["vix_close", "long_condition"],
)

PINE_WITH_SECURITY = StrategyArtifact(
    language="pine",
    name="Needs bridge",
    source_code="""//@version=5\nindicator('Needs bridge')\nexternal = request.security('CBOE:VIX', 'D', close)\nplot(external, title='external')\n""",
    declared_outputs=["external"],
)


def save_dataset(name: str, symbol: str) -> str:
    dataset = dataset_service.save(
        DataSourceConfig(
            type="csv",
            name=name,
            file_path=str(FIXTURE_PATH),
            symbol=symbol,
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
    return dataset.dataset_id


def test_create_replay_run_returns_python_outputs() -> None:
    dataset_id = save_dataset("Replay source", "SBIN")
    run = run_service.create_replay_run(
        run_config=RunConfig(mode="local_compare", symbol="SBIN", timeframe="5m", warmup_bars=1, selected_outputs=["ema_fast", "long_condition"], timezone="UTC", companion_dataset_ids={}),
        python_artifact=PYTHON_ARTIFACT,
        dataset_id=dataset_id,
    )

    assert run.lifecycle == "completed"
    assert len(run.python_series) >= 1
    assert len(run.candles) == 3
    assert run.comparison is not None
    assert run.warnings
    assert "No Pine bridge artifact attached" in run.warnings[0]


def test_create_replay_run_supports_companion_datasets() -> None:
    primary_dataset_id = save_dataset("Primary source", "SBIN")
    companion_dataset_id = save_dataset("VIX source", "CBOE:VIX")

    run = run_service.create_replay_run(
        run_config=RunConfig(
            mode="local_compare",
            symbol="SBIN",
            timeframe="5m",
            warmup_bars=1,
            selected_outputs=["vix_close", "long_condition"],
            timezone="UTC",
            companion_dataset_ids={"CBOE:VIX": companion_dataset_id},
        ),
        python_artifact=COMPANION_ARTIFACT,
        dataset_id=primary_dataset_id,
    )

    assert any(series.name == "vix_close" for series in run.python_series)
    assert run.comparison is not None
    assert companion_dataset_id in run.comparison.artifact_refs
    assert run.companion_dataset_ids == {"CBOE:VIX": companion_dataset_id}


def test_create_replay_run_warns_when_pine_uses_request_security_without_bridge() -> None:
    dataset_id = save_dataset("Security source", "SBIN")

    run = run_service.create_replay_run(
        run_config=RunConfig(mode="local_compare", symbol="SBIN", timeframe="5m", warmup_bars=1, timezone="UTC", companion_dataset_ids={}),
        python_artifact=PYTHON_ARTIFACT,
        pine_artifact=PINE_WITH_SECURITY,
        dataset_id=dataset_id,
    )

    assert any("request.security" in warning for warning in run.warnings)


def test_create_replay_run_warns_when_bridge_artifact_mismatches_run_target() -> None:
    dataset_id = save_dataset("Mismatch source", "SBIN")
    bridge = bridge_service.create(
        name="Mismatch artifact",
        symbol="CBOE:VIX",
        timeframe="1D",
        source_code=PINE_WITH_SECURITY.source_code,
        indicator_series=[
            IndicatorSeries(
                name="external",
                values=[IndicatorPoint(timestamp="2026-03-10T14:15:00Z", value=20.0)],
            )
        ],
        trade_events=[],
        notes="Mismatch fixture",
    )

    run = run_service.create_replay_run(
        run_config=RunConfig(mode="pine_bridge", symbol="SBIN", timeframe="5m", warmup_bars=1, timezone="UTC", companion_dataset_ids={}),
        python_artifact=PYTHON_ARTIFACT,
        pine_artifact=PINE_WITH_SECURITY,
        dataset_id=dataset_id,
        bridge_artifact_id=bridge.artifact_id,
    )

    assert any("does not match current run symbol" in warning for warning in run.warnings)
    assert any("does not match current run timeframe" in warning for warning in run.warnings)