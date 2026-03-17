from __future__ import annotations

import logging
from datetime import UTC, datetime
import threading
from threading import Event, Thread
from time import sleep
from uuid import uuid4

_log = logging.getLogger(__name__)

from app.core.comparison_engine import ComparisonEngine
from app.core.data_manager import DataManager
from app.core.python_engine import PythonStrategyEngine
from app.models.contracts import BridgeArtifact, ComparisonResult, LiveBarEvent, RunLifecycle, RunStatus, StrategyArtifact
from app.services.bridge_service import bridge_service
from app.services.dataset_service import dataset_service
from app.services.storage import storage_service


class RunService:
    def __init__(self) -> None:
        self.dataset_service = dataset_service
        self.bridge_service = bridge_service
        self.data_manager = DataManager()
        self.python_engine = PythonStrategyEngine()
        self.comparison_engine = ComparisonEngine()
        self.storage = storage_service
        self._live_threads: dict[str, Thread] = {}
        self._stop_events: dict[str, Event] = {}
        self._run_cache: dict[str, RunStatus] = {}

    def create_replay_run(self, run_config, python_artifact: StrategyArtifact, pine_artifact: StrategyArtifact | None = None, dataset_id: str | None = None, bridge_artifact_id: str | None = None) -> RunStatus:
        if not dataset_id:
            raise ValueError("dataset_id is required")
        dataset = self.dataset_service.get_dataset(dataset_id)
        frame = self.dataset_service.load_frame(dataset_id)
        companion_frames, companion_warnings = self._load_companion_frames(run_config.companion_dataset_ids)
        python_series, trade_events, _ = self.python_engine.execute(python_artifact, frame, run_config, companion_frames=companion_frames)
        candles = self.data_manager.to_candles(frame)
        bridge_artifact = self._resolve_bridge(bridge_artifact_id)
        pine_series = bridge_artifact.indicator_series if bridge_artifact else []
        comparison, warnings = self._build_comparison(
            run_config,
            dataset_id,
            bridge_artifact_id,
            pine_artifact,
            bridge_artifact,
            pine_series,
            python_series,
            bridge_artifact.trade_events if bridge_artifact else [],
            trade_events,
            False,
            companion_dataset_ids=run_config.companion_dataset_ids,
            extra_warnings=companion_warnings,
        )
        run = RunStatus(
            run_id=f"run-{uuid4().hex[:8]}",
            lifecycle=RunLifecycle.COMPLETED,
            mode=run_config.mode,
            symbol=run_config.symbol,
            timeframe=run_config.timeframe,
            dataset_id=dataset_id,
            dataset_name=dataset.name,
            companion_dataset_ids=dict(run_config.companion_dataset_ids),
            bridge_artifact_id=bridge_artifact_id,
            python_artifact=python_artifact,
            pine_artifact=pine_artifact,
            candles=candles,
            python_series=python_series,
            pine_series=pine_series,
            trade_events=trade_events,
            comparison=comparison,
            warnings=warnings,
            live_progress=len(candles),
            live_total=len(candles),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        self._persist_run(run)
        return run

    def create_live_run(self, run_config, python_artifact: StrategyArtifact, pine_artifact: StrategyArtifact | None = None, dataset_id: str | None = None, bridge_artifact_id: str | None = None) -> RunStatus:
        if not dataset_id:
            raise ValueError("dataset_id is required")
        dataset = self.dataset_service.get_dataset(dataset_id)
        frame = self.dataset_service.load_frame(dataset_id)
        companion_frames, companion_warnings = self._load_companion_frames(run_config.companion_dataset_ids)
        initial_size = min(max(run_config.warmup_bars, 50), len(frame))
        initial_frame = frame.iloc[:initial_size].copy()
        python_series, trade_events, _ = self.python_engine.execute(python_artifact, initial_frame, run_config, companion_frames=companion_frames)
        candles = self.data_manager.to_candles(initial_frame)
        bridge_artifact = self._resolve_bridge(bridge_artifact_id)
        pine_series = self._slice_series(bridge_artifact.indicator_series, initial_size) if bridge_artifact else []
        comparison, warnings = self._build_comparison(
            run_config,
            dataset_id,
            bridge_artifact_id,
            pine_artifact,
            bridge_artifact,
            pine_series,
            python_series,
            self._slice_trades(bridge_artifact.trade_events, candles[-1].timestamp if candles else None) if bridge_artifact else [],
            trade_events,
            True,
            companion_dataset_ids=run_config.companion_dataset_ids,
            extra_warnings=companion_warnings,
        )
        run = RunStatus(
            run_id=f"run-{uuid4().hex[:8]}",
            lifecycle=RunLifecycle.LIVE,
            mode=run_config.mode,
            symbol=run_config.symbol,
            timeframe=run_config.timeframe,
            dataset_id=dataset_id,
            dataset_name=dataset.name,
            companion_dataset_ids=dict(run_config.companion_dataset_ids),
            bridge_artifact_id=bridge_artifact_id,
            python_artifact=python_artifact,
            pine_artifact=pine_artifact,
            candles=candles,
            python_series=python_series,
            pine_series=pine_series,
            trade_events=trade_events,
            comparison=comparison,
            warnings=warnings,
            live_progress=initial_size,
            live_total=len(frame),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        self._persist_run(run)
        stop_event = Event()
        self._stop_events[run.run_id] = stop_event
        thread = Thread(target=self._live_loop, args=(run.run_id, frame, companion_frames, run_config, bridge_artifact, python_artifact), daemon=True)
        self._live_threads[run.run_id] = thread
        thread.start()
        return run

    def list_runs(self) -> list[RunStatus]:
        rows = [RunStatus.model_validate(row) for row in self.storage.list_records(self.storage.runs_index)]
        return sorted(rows, key=lambda row: row.updated_at, reverse=True)

    def get_run(self, run_id: str) -> RunStatus:
        if run_id in self._run_cache:
            return self._run_cache[run_id]
        for run in self.list_runs():
            if run.run_id == run_id:
                return run
        raise KeyError(f"Unknown run: {run_id}")

    def latest_event(self, run_id: str) -> LiveBarEvent:
        run = self.get_run(run_id)
        latest_candle = run.candles[-1] if run.candles else None
        return LiveBarEvent(run_id=run.run_id, lifecycle=run.lifecycle, current_index=run.live_progress, total=run.live_total, latest_candle=latest_candle, comparison=run.comparison, updated_at=run.updated_at)

    def _persist_run(self, run: RunStatus) -> None:
        self._run_cache[run.run_id] = run
        self.storage.upsert_record(self.storage.runs_index, "run_id", run.run_id, run.model_dump(mode="json"))

    def _resolve_bridge(self, bridge_artifact_id: str | None) -> BridgeArtifact | None:
        if not bridge_artifact_id:
            return None
        return self.bridge_service.get(bridge_artifact_id)

    def _build_comparison(self, run_config, dataset_id: str, bridge_artifact_id: str | None, pine_artifact: StrategyArtifact | None, bridge_artifact: BridgeArtifact | None, pine_series, python_series, pine_trades, python_trades, live: bool, companion_dataset_ids: dict[str, str] | None = None, extra_warnings: list[str] | None = None) -> tuple[ComparisonResult, list[str]]:
        warnings: list[str] = list(extra_warnings or [])
        requires_bridge = bool(pine_artifact and "request.security" in pine_artifact.source_code)
        if requires_bridge and not bridge_artifact_id:
            warnings.append("Pine script uses request.security. Attach a Pine bridge artifact for exact Pine parity in this app.")
        if bridge_artifact and bridge_artifact.symbol != run_config.symbol:
            warnings.append(f"Selected Pine bridge artifact symbol '{bridge_artifact.symbol}' does not match current run symbol '{run_config.symbol}'.")
        if bridge_artifact and bridge_artifact.timeframe != run_config.timeframe:
            warnings.append(f"Selected Pine bridge artifact timeframe '{bridge_artifact.timeframe}' does not match current run timeframe '{run_config.timeframe}'.")
        if not pine_series:
            warnings.append("No Pine bridge artifact attached. Comparison is running without Pine source-of-truth data.")

        artifact_refs = [ref for ref in [dataset_id, bridge_artifact_id] if ref]
        if companion_dataset_ids:
            artifact_refs.extend(companion_dataset_ids.values())

        comparison = self.comparison_engine.compare_series(
            pine_series,
            python_series,
            run_config.tolerance,
            run_mode=run_config.mode,
            dataset_id=dataset_id,
            live=live,
            artifact_refs=artifact_refs,
        )
        comparison.trade_mismatches = self.comparison_engine.compare_trades(pine_trades, python_trades, run_config.tolerance)
        comparison.summary.total_trade_events = len(pine_trades)
        comparison.summary.mismatched_trade_events = len(comparison.trade_mismatches)
        if comparison.trade_mismatches and not comparison.first_mismatch:
            comparison.first_mismatch = comparison.trade_mismatches[0]
        if warnings:
            comparison.unsupported_feature_warnings.extend(warnings)
        return comparison, warnings

    def stop_live_run(self, run_id: str) -> RunStatus:
        run = self.get_run(run_id)
        if run.lifecycle != RunLifecycle.LIVE:
            raise ValueError(f"Run {run_id} is not live (lifecycle={run.lifecycle})")
        event = self._stop_events.get(run_id)
        if event is None:
            raise ValueError(f"Run {run_id} has no active stop handle (may have already finished)")
        event.set()
        return self.get_run(run_id)

    def _live_loop(self, run_id: str, frame, companion_frames, run_config, bridge_artifact: BridgeArtifact | None, python_artifact: StrategyArtifact) -> None:
        stop_event = self._stop_events.get(run_id, Event())
        try:
            while not stop_event.is_set():
                run = self.get_run(run_id)
                if run.live_progress >= len(frame):
                    run.lifecycle = RunLifecycle.COMPLETED
                    run.updated_at = datetime.now(UTC)
                    self._persist_run(run)
                    return
                next_progress = min(run.live_progress + 1, len(frame))
                active_frame = frame.iloc[:next_progress].copy()
                python_series, trade_events, _ = self.python_engine.execute(python_artifact, active_frame, run_config, companion_frames=companion_frames)
                run.candles = self.data_manager.to_candles(active_frame)
                run.python_series = python_series
                run.trade_events = trade_events
                run.live_progress = next_progress
                run.pine_series = self._slice_series(bridge_artifact.indicator_series, next_progress) if bridge_artifact else []
                pine_trades = self._slice_trades(bridge_artifact.trade_events, run.candles[-1].timestamp if run.candles and bridge_artifact else None) if bridge_artifact else []
                comparison, warnings = self._build_comparison(
                    run_config,
                    run.dataset_id or "",
                    run.bridge_artifact_id,
                    run.pine_artifact,
                    bridge_artifact,
                    run.pine_series,
                    run.python_series,
                    pine_trades,
                    run.trade_events,
                    True,
                    companion_dataset_ids=run.companion_dataset_ids,
                )
                run.comparison = comparison
                run.warnings = warnings
                run.updated_at = datetime.now(UTC)
                self._persist_run(run)
                sleep(1)
            # stop_event was set — mark as FAILED with a user-stop warning unless already complete
            try:
                run = self.get_run(run_id)
                if run.lifecycle == RunLifecycle.LIVE:
                    if run.live_progress >= run.live_total:
                        run.lifecycle = RunLifecycle.COMPLETED
                    else:
                        run.lifecycle = RunLifecycle.FAILED
                        run.warnings = list(run.warnings or []) + ["Stopped by user"]
                    run.updated_at = datetime.now(UTC)
                    self._persist_run(run)
            except Exception as stop_exc:
                _log.error("live_loop run=%s failed to persist stop state: %s", run_id, stop_exc)
        except Exception as exc:
            _log.error("live_loop run=%s crashed: %s", run_id, exc, exc_info=True)
            try:
                run = self.get_run(run_id)
                run.lifecycle = RunLifecycle.FAILED
                run.warnings = list(run.warnings or []) + [f"Live worker error: {exc}"]
                run.updated_at = datetime.now(UTC)
                self._persist_run(run)
            except Exception as persist_exc:
                _log.error("live_loop run=%s also failed to persist FAILED state: %s", run_id, persist_exc)
        finally:
            self._live_threads.pop(run_id, None)
            self._stop_events.pop(run_id, None)

    def _load_companion_frames(self, companion_dataset_ids: dict[str, str] | None) -> tuple[dict[str, object], list[str]]:
        frames: dict[str, object] = {}
        warnings: list[str] = []
        for alias, dataset_id in (companion_dataset_ids or {}).items():
            try:
                frames[alias] = self.dataset_service.load_frame(dataset_id)
            except KeyError:
                warnings.append(f"Companion dataset '{alias}' could not be loaded because dataset '{dataset_id}' was not found.")
        return frames, warnings

    @staticmethod
    def _slice_series(series_list, length: int):
        sliced = []
        for series in series_list:
            sliced.append(series.model_copy(update={"values": series.values[:length]}))
        return sliced

    @staticmethod
    def _slice_trades(trades, cutoff):
        if cutoff is None:
            return []
        return [trade for trade in trades if trade.timestamp <= cutoff]


run_service = RunService()