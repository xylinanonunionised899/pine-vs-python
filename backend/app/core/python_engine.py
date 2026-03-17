from __future__ import annotations

import inspect
import math
import statistics
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from types import MappingProxyType
from typing import Any

import numpy as np
import pandas as pd

from app.models.contracts import IndicatorPoint, IndicatorSeries, RunConfig, StrategyArtifact, TradeEvent


def _infer_pane(values: list[float | None], candle_close: list[float]) -> str:
    """Infer whether a series belongs on the main price pane or a sub-pane.

    Mirrors Pine Script's overlay=true/false logic using data characteristics:
    - Boolean/signal (0/1) → sub
    - Bounded 0–100 oscillators (RSI, Stoch) → sub
    - Centered-near-zero with small range relative to price (MACD, histogram) → sub
    - Tracks the price range → main (EMA, SMA, Bollinger)
    - Unknown → sub (safe default, avoids cluttering price chart)
    """
    clean = [v for v in values if v is not None and not (isinstance(v, float) and v != v)]
    if not clean or not candle_close:
        return "main"

    vmin, vmax = min(clean), max(clean)
    vmid = (vmin + vmax) / 2
    vrange = vmax - vmin

    # Boolean / signal series (0 and 1 only)
    if vmax <= 1.5 and vmin >= -0.5:
        return "sub"

    # Bounded 0–100 oscillators: RSI, Stochastic, %K, %D, Williams %R (0 to -100)
    if vmin >= -105 and vmax <= 105 and vrange > 2:
        return "sub"

    cmin, cmax = min(candle_close), max(candle_close)
    cprice_range = max(cmax - cmin, 1.0)

    # Centered-near-zero oscillators: MACD line, signal, histogram, momentum
    # Range is much smaller than price range and midpoint is near zero
    if abs(vmid) < cprice_range * 0.15 and vrange < cprice_range * 0.4:
        return "sub"

    # Series midpoint tracks the price range → overlay on main pane
    if (cmin - cprice_range * 0.5 <= vmid <= cmax + cprice_range * 0.5
            and vmax >= cmin - cprice_range
            and vmin <= cmax + cprice_range):
        return "main"

    # Default: anything far from price scale goes to sub-pane
    return "sub"


class PythonStrategyEngine:
    _ALLOWED_IMPORTS = MappingProxyType(
        {
            "math": math,
            "statistics": statistics,
            "numpy": np,
            "pandas": pd,
        }
    )
    _EXECUTION_TIMEOUT_SECONDS: int = 30

    def execute(
        self,
        artifact: StrategyArtifact,
        frame: pd.DataFrame,
        run_config: RunConfig,
        companion_frames: dict[str, pd.DataFrame] | None = None,
    ) -> tuple[list[IndicatorSeries], list[TradeEvent], pd.DataFrame]:
        base_frame = frame.copy()
        external_frames = {
            name: companion.copy()
            for name, companion in (companion_frames or {}).items()
        }

        def safe_import(name: str, globals_: Any = None, locals_: Any = None, fromlist: Any = (), level: int = 0):
            if name in self._ALLOWED_IMPORTS:
                return self._ALLOWED_IMPORTS[name]
            raise ImportError(f"Import '{name}' is not allowed in local strategy execution")

        def get_external_frame(name: str) -> pd.DataFrame:
            if name not in external_frames:
                available = ", ".join(sorted(external_frames.keys())) or "none"
                raise KeyError(f"Unknown companion dataset '{name}'. Available companion datasets: {available}")
            return external_frames[name].copy()

        safe_builtins = {
            "__import__": safe_import,
            "abs": abs,
            "min": min,
            "max": max,
            "len": len,
            "range": range,
            "sum": sum,
            "float": float,
            "int": int,
            "bool": bool,
            "enumerate": enumerate,
            "zip": zip,
        }
        namespace: dict[str, Any] = {
            "__builtins__": safe_builtins,
            "pd": pd,
            "pandas": pd,
            "np": np,
            "numpy": np,
            "math": math,
            "statistics": statistics,
            "external_frames": external_frames,
            "companion_frames": external_frames,
            "get_external_frame": get_external_frame,
        }
        context = {
            "external_frames": external_frames,
            "companion_frames": external_frames,
            "run_config": run_config.model_dump(mode="json"),
        }

        # Inspect signature before entering thread so errors surface on the main thread
        # We need to exec first to get run_strategy, but we do that inside _run().
        # Instead we do a dry exec here only to inspect the signature, then discard it.
        _probe_ns: dict[str, Any] = dict(namespace)
        exec(artifact.source_code, _probe_ns, _probe_ns)  # noqa: S102
        _probe_fn = _probe_ns.get("run_strategy")
        if not callable(_probe_fn):
            raise ValueError("Python strategy must define run_strategy(frame)")
        strategy_signature = inspect.signature(_probe_fn)
        strategy_kwargs: dict[str, Any] = {}
        if "context" in strategy_signature.parameters:
            strategy_kwargs["context"] = context
        if "external_frames" in strategy_signature.parameters:
            strategy_kwargs["external_frames"] = external_frames
        if "companion_frames" in strategy_signature.parameters:
            strategy_kwargs["companion_frames"] = external_frames
        if "run_config" in strategy_signature.parameters:
            strategy_kwargs["run_config"] = run_config

        def _run() -> pd.DataFrame:
            exec(artifact.source_code, namespace, namespace)  # noqa: S102
            fn = namespace.get("run_strategy")
            if not callable(fn):
                raise ValueError("Python strategy must define run_strategy(frame)")
            return fn(base_frame.copy(), **strategy_kwargs)

        # Use shutdown(wait=False) so a timed-out thread is abandoned rather than
        # blocking __exit__ indefinitely. Python has no safe thread-kill primitive;
        # the orphaned thread will run to completion (or forever) in the background,
        # but the caller receives the TimeoutError immediately.
        pool = ThreadPoolExecutor(max_workers=1)
        future = pool.submit(_run)
        try:
            result = future.result(timeout=self._EXECUTION_TIMEOUT_SECONDS)
        except FuturesTimeoutError:
            pool.shutdown(wait=False)
            raise TimeoutError(
                f"Strategy execution exceeded {self._EXECUTION_TIMEOUT_SECONDS}s timeout. "
                "Check for infinite loops or excessive computation."
            )
        finally:
            pool.shutdown(wait=False)

        if not isinstance(result, pd.DataFrame):
            raise ValueError("run_strategy(frame) must return a pandas DataFrame")

        indicator_series = self._build_indicator_series(result, run_config)
        trade_events = self._build_trade_events(result, run_config)
        return indicator_series, trade_events, result

    def _build_indicator_series(self, frame: pd.DataFrame, run_config: RunConfig) -> list[IndicatorSeries]:
        base_columns = {"timestamp", "open", "high", "low", "close", "volume"}
        allowed = set(run_config.selected_outputs) if run_config.selected_outputs else None
        candle_close = frame["close"].dropna().tolist() if "close" in frame.columns else []
        series: list[IndicatorSeries] = []
        for column in frame.columns:
            if column in base_columns:
                continue
            if allowed and column not in allowed:
                continue
            if not (pd.api.types.is_numeric_dtype(frame[column]) or pd.api.types.is_bool_dtype(frame[column])):
                continue
            values = []
            for item in frame[["timestamp", column]].itertuples(index=False):
                raw_value = getattr(item, column)
                if pd.isna(raw_value):
                    value = None
                elif isinstance(raw_value, (bool, np.bool_)):
                    value = 1.0 if raw_value else 0.0
                else:
                    value = float(raw_value)
                values.append(IndicatorPoint(timestamp=item.timestamp.to_pydatetime() if hasattr(item.timestamp, "to_pydatetime") else item.timestamp, value=value))
            raw_floats = [v.value for v in values]
            pane = _infer_pane(raw_floats, candle_close)
            series.append(
                IndicatorSeries(
                    name=column,
                    pane=pane,
                    style={"color": "#58a6ff"},
                    warmup_bars=run_config.warmup_bars,
                    values=values,
                )
            )
        return series

    def _build_trade_events(self, frame: pd.DataFrame, run_config: RunConfig) -> list[TradeEvent]:
        events: list[TradeEvent] = []
        in_long = False
        if "long_condition" not in frame.columns:
            return events
        for row in frame[["timestamp", "close", "long_condition"]].itertuples(index=False):
            is_long = bool(row.long_condition)
            if is_long and not in_long:
                events.append(TradeEvent(timestamp=row.timestamp.to_pydatetime() if hasattr(row.timestamp, "to_pydatetime") else row.timestamp, side="long_entry", price=float(row.close), qty=1, reason="long_condition", source_engine="python"))
                in_long = True
            elif not is_long and in_long:
                events.append(TradeEvent(timestamp=row.timestamp.to_pydatetime() if hasattr(row.timestamp, "to_pydatetime") else row.timestamp, side="long_exit", price=float(row.close), qty=1, reason="long_condition", source_engine="python"))
                in_long = False
            if run_config.one_open_position and in_long:
                continue
        return events