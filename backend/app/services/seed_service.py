from __future__ import annotations

import logging
from datetime import UTC, datetime
from pathlib import Path

_log = logging.getLogger(__name__)

DEMO_DATASET_ID = "dataset-demo-5m"
DEMO_RUN_ID = "run-demo-ema"
DEMO_SYMBOL = "DEMO"
DEMO_TIMEFRAME = "5m"


class SeedService:
    def seed_if_needed(self) -> None:
        """Seed demo data on first launch.

        Logic:
        - If no datasets exist at all → create dataset + run.
        - If dataset-demo-5m exists but run-demo-ema is missing → create run only.
        - If user has non-demo datasets → skip entirely (don't inject demo data).
        - If both demo artifacts exist → no-op.
        """
        from app.services.storage import storage_service

        all_datasets = storage_service.list_records(storage_service.datasets_index)
        non_demo = [d for d in all_datasets if d.get("dataset_id") != DEMO_DATASET_ID]
        has_demo_dataset = any(d.get("dataset_id") == DEMO_DATASET_ID for d in all_datasets)

        if non_demo:
            # User has real data — leave everything alone.
            return

        if not has_demo_dataset:
            self._seed_demo_dataset()

        all_runs = storage_service.list_records(storage_service.runs_index)
        has_demo_run = any(r.get("run_id") == DEMO_RUN_ID for r in all_runs)
        if not has_demo_run:
            self._seed_demo_run()

    # ── Dataset ────────────────────────────────────────────────────────────────

    def _seed_demo_dataset(self) -> None:
        from app.models.contracts import (
            ColumnMapping,
            DatasetArtifact,
            DataSourceConfig,
            DataSourceType,
            SessionConfig,
        )
        from app.services.storage import storage_service

        dest_path = storage_service.datasets_dir / f"{DEMO_DATASET_ID}.csv"
        row_count = _generate_demo_csv(dest_path)
        mapping = ColumnMapping(
            timestamp="timestamp",
            open="open",
            high="high",
            low="low",
            close="close",
            volume="volume",
        )

        artifact = DatasetArtifact(
            dataset_id=DEMO_DATASET_ID,
            name="Demo Dataset (EMA 5m · 300 bars)",
            source=DataSourceConfig(
                type=DataSourceType.CSV,
                name="Demo Dataset (EMA 5m · 300 bars)",
                file_path=str(dest_path),
                symbol=DEMO_SYMBOL,
                timeframe=DEMO_TIMEFRAME,
                timezone="UTC",
                mapping=mapping,
                session=SessionConfig(timezone="UTC"),
                extra={"seeded_demo": True},
            ),
            mapping=mapping,
            symbol=DEMO_SYMBOL,
            timeframe=DEMO_TIMEFRAME,
            timezone="UTC",
            row_count=row_count,
            columns=["timestamp", "open", "high", "low", "close", "volume"],
            data_path=str(dest_path),
        )
        storage_service.upsert_record(
            storage_service.datasets_index,
            "dataset_id",
            DEMO_DATASET_ID,
            artifact.model_dump(mode="json"),
        )
        _log.info("Demo dataset seeded: %s (%d bars)", DEMO_DATASET_ID, row_count)

    # ── Run ────────────────────────────────────────────────────────────────────

    def _seed_demo_run(self) -> None:
        import pandas as pd

        from app.core.comparison_engine import ComparisonEngine
        from app.core.data_manager import DataManager
        from app.core.python_engine import PythonStrategyEngine
        from app.models.contracts import (
            RunConfig,
            RunLifecycle,
            RunStatus,
            StrategyArtifact,
        )
        from app.services.storage import storage_service

        data_path = storage_service.datasets_dir / f"{DEMO_DATASET_ID}.csv"
        if not data_path.exists():
            _log.warning("Demo CSV not found at %s — skipping run seed", data_path)
            return

        frame = pd.read_csv(data_path)
        frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)

        python_artifact = StrategyArtifact(
            language="python",
            name="EMA Crossover (21/50)",
            source_code=_PYTHON_EMA_CODE,
            declared_outputs=["ema_fast", "ema_slow", "long_condition"],
            adapter_metadata={"engine": "local-python"},
        )
        run_config = RunConfig(
            mode="local_compare",
            symbol=DEMO_SYMBOL,
            timeframe=DEMO_TIMEFRAME,
            one_open_position=True,
            tolerance=0.001,
            warmup_bars=50,
            selected_outputs=["ema_fast", "ema_slow"],
            timezone="UTC",
        )

        # Execute — if this fails we log and abort rather than persisting a fake run.
        try:
            python_series, trade_events, _ = PythonStrategyEngine().execute(
                python_artifact, frame, run_config
            )
        except Exception as e:
            _log.warning("Demo Python execution failed — run seed aborted: %s", e, exc_info=True)
            return

        candles = DataManager().to_candles(frame)
        comparison = ComparisonEngine().compare_series(
            [],
            python_series,
            run_config.tolerance,
            run_mode=run_config.mode,
            dataset_id=DEMO_DATASET_ID,
            live=False,
            artifact_refs=[DEMO_DATASET_ID],
        )

        now = datetime.now(UTC)
        run = RunStatus(
            run_id=DEMO_RUN_ID,
            lifecycle=RunLifecycle.COMPLETED,
            mode=run_config.mode,
            symbol=DEMO_SYMBOL,
            timeframe=DEMO_TIMEFRAME,
            dataset_id=DEMO_DATASET_ID,
            dataset_name="Demo Dataset (EMA 5m · 300 bars)",
            python_artifact=python_artifact,
            candles=candles,
            python_series=python_series,
            trade_events=trade_events,
            comparison=comparison,
            warnings=[
                "Showing bundled demo data. Import your own file in Imports to replace it."
            ],
            live_progress=len(candles),
            live_total=len(candles),
            created_at=now,
            updated_at=now,
        )
        storage_service.upsert_record(
            storage_service.runs_index,
            "run_id",
            DEMO_RUN_ID,
            run.model_dump(mode="json"),
        )
        _log.info(
            "Demo run seeded: %s (%d candles, %d series)",
            DEMO_RUN_ID, len(candles), len(python_series),
        )


# ── CSV generator ──────────────────────────────────────────────────────────────

def _generate_demo_csv(dest_path: Path) -> int:
    """Write 300 deterministic synthetic 5-minute OHLCV bars to dest_path."""
    import numpy as np
    import pandas as pd

    rng = np.random.default_rng(42)
    start = pd.Timestamp("2026-01-05 09:00:00", tz="UTC")
    timestamps = pd.date_range(start, periods=300, freq="5min")

    price = 100.0
    rows = []
    for ts in timestamps:
        change = float(rng.normal(0.0002, 0.003))
        open_ = round(price * (1 + float(rng.normal(0, 0.0005))), 2)
        close = round(open_ * (1 + change), 2)
        high = round(max(open_, close) * (1 + abs(float(rng.normal(0, 0.001)))), 2)
        low = round(min(open_, close) * (1 - abs(float(rng.normal(0, 0.001)))), 2)
        volume = int(rng.integers(50_000, 300_000))
        rows.append(
            {
                "timestamp": ts.isoformat(),
                "open": open_,
                "high": high,
                "low": low,
                "close": close,
                "volume": volume,
            }
        )
        price = close

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(dest_path, index=False)
    return len(rows)


# ── Strategy code ──────────────────────────────────────────────────────────────

_PYTHON_EMA_CODE = """\
import pandas as pd

def run_strategy(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    frame["ema_fast"] = frame["close"].ewm(span=21, adjust=False).mean()
    frame["ema_slow"] = frame["close"].ewm(span=50, adjust=False).mean()
    frame["long_condition"] = frame["ema_fast"] > frame["ema_slow"]
    return frame
"""

seed_service = SeedService()
