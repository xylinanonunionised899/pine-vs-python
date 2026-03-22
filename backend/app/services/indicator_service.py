from __future__ import annotations

import json
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.settings import settings


def _sanitize_folder_name(name: str) -> str:
    """Convert indicator name to filesystem-safe folder name."""
    cleaned = re.sub(r"[^a-z0-9_\-]", "-", name.lower().strip())
    cleaned = re.sub(r"-+", "-", cleaned).strip("-")
    return cleaned or "indicator"


class IndicatorService:
    def __init__(self) -> None:
        self.indicators_dir: Path = settings.data_root / "indicators"
        self.indicators_dir.mkdir(parents=True, exist_ok=True)
        self.index_path: Path = self.indicators_dir / "index.json"
        if not self.index_path.exists():
            self.index_path.write_text("[]", encoding="utf-8")
        self._seed_builtins()

    # ── CRUD ──────────────────────────────────────────────

    def list_indicators(self) -> list[dict[str, Any]]:
        return json.loads(self.index_path.read_text(encoding="utf-8"))

    def get(self, indicator_id: str) -> dict[str, Any] | None:
        for row in self.list_indicators():
            if row.get("indicator_id") == indicator_id:
                return row
        return None

    def save(self, entry: dict[str, Any]) -> dict[str, Any]:
        if not entry.get("indicator_id"):
            entry["indicator_id"] = f"ind-{uuid.uuid4().hex[:8]}"
        now = datetime.now(UTC).isoformat()
        entry.setdefault("created_at", now)
        entry["updated_at"] = now

        # Write actual code files
        folder_name = _sanitize_folder_name(entry["name"])
        folder_path = self.indicators_dir / folder_name
        folder_path.mkdir(parents=True, exist_ok=True)
        (folder_path / "indicator.pine").write_text(entry.get("pine_code", ""), encoding="utf-8")
        (folder_path / "indicator.py").write_text(entry.get("python_code", ""), encoding="utf-8")
        entry["folder_path"] = str(folder_path)

        # Upsert into index
        rows = self.list_indicators()
        rows = [r for r in rows if r.get("indicator_id") != entry["indicator_id"]]
        rows.append(entry)
        self._write_index(rows)
        return entry

    def delete(self, indicator_id: str) -> bool:
        rows = self.list_indicators()
        target = None
        for r in rows:
            if r.get("indicator_id") == indicator_id:
                target = r
                break
        if not target:
            return False
        if target.get("is_builtin", False):
            return False  # Cannot delete built-in indicators
        rows = [r for r in rows if r.get("indicator_id") != indicator_id]
        self._write_index(rows)
        return True

    def _write_index(self, rows: list[dict[str, Any]]) -> None:
        self.index_path.write_text(json.dumps(rows, indent=2, default=str), encoding="utf-8")

    # ── Seed built-in indicators ──────────────────────────

    def _seed_builtins(self) -> None:
        existing = self.list_indicators()
        if len(existing) > 0:
            return  # Already seeded

        for entry in BUILTIN_INDICATORS:
            self.save(entry)

    # ── Re-seed (force) ──────────────────────────────────

    def reseed_builtins(self) -> None:
        existing = self.list_indicators()
        existing_ids = {r["indicator_id"] for r in existing}
        for entry in BUILTIN_INDICATORS:
            if entry["indicator_id"] not in existing_ids:
                self.save(entry)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 6 PRE-BUILT INDICATORS — Pine v5 + Python, 100% aligned
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BUILTIN_INDICATORS: list[dict[str, Any]] = [
    # ── 1. EMA Crossover ──
    {
        "indicator_id": "ind-ema-crossover",
        "name": "EMA Crossover",
        "description": "Fast/slow EMA crossover strategy. Long when fast EMA > slow EMA.",
        "category": "trend",
        "series_names": ["ema_fast", "ema_slow", "long_condition"],
        "is_builtin": True,
        "pine_code": """//@version=5
indicator("EMA Crossover", overlay=true)

ema_fast = ta.ema(close, 9)
ema_slow = ta.ema(close, 21)
long_cond = ema_fast > ema_slow

plot(ema_fast, title="ema_fast", color=color.blue)
plot(ema_slow, title="ema_slow", color=color.red)
plot(long_cond ? 1 : 0, title="long_condition", display=display.none)
""",
        "python_code": """import pandas as pd

def run_strategy(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    frame["ema_fast"] = frame["close"].ewm(span=9, adjust=False).mean()
    frame["ema_slow"] = frame["close"].ewm(span=21, adjust=False).mean()
    frame["long_condition"] = frame["ema_fast"] > frame["ema_slow"]
    return frame
""",
    },

    # ── 2. RSI ──
    {
        "indicator_id": "ind-rsi",
        "name": "RSI",
        "description": "Relative Strength Index (14). Long when RSI crosses above 30, short when crosses below 70.",
        "category": "momentum",
        "series_names": ["rsi", "long_condition", "short_condition"],
        "is_builtin": True,
        "pine_code": """//@version=5
indicator("RSI Strategy", overlay=false)

rsi_val = ta.rsi(close, 14)
long_cond = ta.crossover(rsi_val, 30)
short_cond = ta.crossunder(rsi_val, 70)

plot(rsi_val, title="rsi", color=color.purple)
plot(long_cond ? 1 : 0, title="long_condition", display=display.none)
plot(short_cond ? 1 : 0, title="short_condition", display=display.none)
""",
        "python_code": """import pandas as pd
import numpy as np

def run_strategy(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    delta = frame["close"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/14, min_periods=14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/14, min_periods=14, adjust=False).mean()
    rs = avg_gain / avg_loss
    frame["rsi"] = 100.0 - (100.0 / (1.0 + rs))
    # Crossover/crossunder conditions
    prev_rsi = frame["rsi"].shift(1)
    frame["long_condition"] = (frame["rsi"] > 30) & (prev_rsi <= 30)
    frame["short_condition"] = (frame["rsi"] < 70) & (prev_rsi >= 70)
    return frame
""",
    },

    # ── 3. MACD ──
    {
        "indicator_id": "ind-macd",
        "name": "MACD",
        "description": "MACD (12, 26, 9). Long when MACD line crosses above signal line.",
        "category": "momentum",
        "series_names": ["macd_line", "signal_line", "histogram", "long_condition"],
        "is_builtin": True,
        "pine_code": """//@version=5
indicator("MACD Strategy", overlay=false)

fast_ma = ta.ema(close, 12)
slow_ma = ta.ema(close, 26)
macd_val = fast_ma - slow_ma
signal_val = ta.ema(macd_val, 9)
hist_val = macd_val - signal_val
long_cond = ta.crossover(macd_val, signal_val)

plot(macd_val, title="macd_line", color=color.blue)
plot(signal_val, title="signal_line", color=color.orange)
plot(hist_val, title="histogram", color=color.gray, style=plot.style_histogram)
plot(long_cond ? 1 : 0, title="long_condition", display=display.none)
""",
        "python_code": """import pandas as pd

def run_strategy(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    ema12 = frame["close"].ewm(span=12, adjust=False).mean()
    ema26 = frame["close"].ewm(span=26, adjust=False).mean()
    frame["macd_line"] = ema12 - ema26
    frame["signal_line"] = frame["macd_line"].ewm(span=9, adjust=False).mean()
    frame["histogram"] = frame["macd_line"] - frame["signal_line"]
    # Crossover: macd crosses above signal
    prev_macd = frame["macd_line"].shift(1)
    prev_signal = frame["signal_line"].shift(1)
    frame["long_condition"] = (frame["macd_line"] > frame["signal_line"]) & (prev_macd <= prev_signal)
    return frame
""",
    },

    # ── 4. Super Trend ──
    {
        "indicator_id": "ind-supertrend",
        "name": "Super Trend",
        "description": "Super Trend (factor=3, ATR period=10). Long when price is above supertrend.",
        "category": "trend",
        "series_names": ["supertrend", "direction", "long_condition"],
        "is_builtin": True,
        "pine_code": """//@version=5
indicator("Super Trend Strategy", overlay=true)

atr_val = ta.atr(10)
hl2_val = (high + low) / 2

upper_band = hl2_val + 3.0 * atr_val
lower_band = hl2_val - 3.0 * atr_val

var float st = na
var float dir = 1.0

prev_st = nz(st)
prev_dir = nz(dir)

lower_band := lower_band > nz(lower_band[1]) or close[1] < nz(lower_band[1]) ? lower_band : nz(lower_band[1])
upper_band := upper_band < nz(upper_band[1]) or close[1] > nz(upper_band[1]) ? upper_band : nz(upper_band[1])

if prev_st == nz(upper_band[1])
    dir := close > upper_band ? -1.0 : 1.0
else
    dir := close < lower_band ? 1.0 : -1.0

st := dir == -1.0 ? lower_band : upper_band

plot(st, title="supertrend", color=dir == -1.0 ? color.green : color.red)
plot(dir, title="direction", display=display.none)
plot(dir == -1.0 ? 1 : 0, title="long_condition", display=display.none)
""",
        "python_code": """import pandas as pd
import numpy as np

def run_strategy(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    factor = 3.0
    atr_period = 10

    # ATR calculation
    tr = pd.concat([
        frame["high"] - frame["low"],
        (frame["high"] - frame["close"].shift(1)).abs(),
        (frame["low"] - frame["close"].shift(1)).abs(),
    ], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1/atr_period, min_periods=atr_period, adjust=False).mean()

    hl2 = (frame["high"] + frame["low"]) / 2
    upper_band = hl2 + factor * atr
    lower_band = hl2 - factor * atr

    n = len(frame)
    st = np.full(n, np.nan)
    direction = np.full(n, 1.0)
    final_upper = upper_band.values.copy()
    final_lower = lower_band.values.copy()

    # Initialize first bar
    if n > 0:
        st[0] = final_upper[0]
        direction[0] = 1.0

    for i in range(1, n):
        if np.isnan(final_lower[i]) or np.isnan(final_lower[i - 1]):
            final_lower[i] = final_lower[i] if not np.isnan(final_lower[i]) else final_lower[i - 1]
        elif not (final_lower[i] > final_lower[i - 1] or frame["close"].iloc[i - 1] < final_lower[i - 1]):
            final_lower[i] = final_lower[i - 1]

        if np.isnan(final_upper[i]) or np.isnan(final_upper[i - 1]):
            final_upper[i] = final_upper[i] if not np.isnan(final_upper[i]) else final_upper[i - 1]
        elif not (final_upper[i] < final_upper[i - 1] or frame["close"].iloc[i - 1] > final_upper[i - 1]):
            final_upper[i] = final_upper[i - 1]

        if st[i - 1] == final_upper[i - 1]:
            direction[i] = -1.0 if frame["close"].iloc[i] > final_upper[i] else 1.0
        else:
            direction[i] = 1.0 if frame["close"].iloc[i] < final_lower[i] else -1.0

        st[i] = final_lower[i] if direction[i] == -1.0 else final_upper[i]

    frame["supertrend"] = st
    frame["direction"] = direction
    frame["long_condition"] = direction == -1.0
    return frame
""",
    },

    # ── 5. Bollinger Bands ──
    {
        "indicator_id": "ind-bollinger-bands",
        "name": "Bollinger Bands",
        "description": "Bollinger Bands (20, 2.0). Long when close crosses below lower band (mean reversion).",
        "category": "volatility",
        "series_names": ["bb_middle", "bb_upper", "bb_lower", "long_condition"],
        "is_builtin": True,
        "pine_code": """//@version=5
indicator("Bollinger Bands Strategy", overlay=true)

length = 20
mult = 2.0

bb_mid = ta.sma(close, length)
bb_std = ta.stdev(close, length)
bb_up = bb_mid + mult * bb_std
bb_lo = bb_mid - mult * bb_std

long_cond = ta.crossover(close, bb_lo)

plot(bb_mid, title="bb_middle", color=color.blue)
plot(bb_up, title="bb_upper", color=color.red)
plot(bb_lo, title="bb_lower", color=color.green)
plot(long_cond ? 1 : 0, title="long_condition", display=display.none)
""",
        "python_code": """import pandas as pd

def run_strategy(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    length = 20
    mult = 2.0
    frame["bb_middle"] = frame["close"].rolling(window=length).mean()
    bb_std = frame["close"].rolling(window=length).std()
    frame["bb_upper"] = frame["bb_middle"] + mult * bb_std
    frame["bb_lower"] = frame["bb_middle"] - mult * bb_std
    # Crossover: close crosses above bb_lower
    prev_close = frame["close"].shift(1)
    prev_lower = frame["bb_lower"].shift(1)
    frame["long_condition"] = (frame["close"] > frame["bb_lower"]) & (prev_close <= prev_lower)
    return frame
""",
    },

    # ── 6. VWAP with 3 Bands ──
    {
        "indicator_id": "ind-vwap-bands",
        "name": "VWAP 3-Band",
        "description": "VWAP with 1x, 2x, 3x standard deviation bands. Long when close is below VWAP lower band 1.",
        "category": "volume",
        "series_names": [
            "vwap", "vwap_upper1", "vwap_lower1",
            "vwap_upper2", "vwap_lower2",
            "vwap_upper3", "vwap_lower3",
            "long_condition",
        ],
        "is_builtin": True,
        "pine_code": """//@version=5
indicator("VWAP 3-Band Strategy", overlay=true)

typical = (high + low + close) / 3.0
cum_vol = ta.cum(volume)
cum_tp_vol = ta.cum(typical * volume)
vwap_val = cum_tp_vol / cum_vol

vwap_dev = math.sqrt(ta.cum(math.pow(typical - vwap_val, 2) * volume) / cum_vol)

up1 = vwap_val + 1.0 * vwap_dev
lo1 = vwap_val - 1.0 * vwap_dev
up2 = vwap_val + 2.0 * vwap_dev
lo2 = vwap_val - 2.0 * vwap_dev
up3 = vwap_val + 3.0 * vwap_dev
lo3 = vwap_val - 3.0 * vwap_dev

long_cond = close < lo1

plot(vwap_val, title="vwap", color=color.yellow)
plot(up1, title="vwap_upper1", color=color.green)
plot(lo1, title="vwap_lower1", color=color.green)
plot(up2, title="vwap_upper2", color=color.blue)
plot(lo2, title="vwap_lower2", color=color.blue)
plot(up3, title="vwap_upper3", color=color.red)
plot(lo3, title="vwap_lower3", color=color.red)
plot(long_cond ? 1 : 0, title="long_condition", display=display.none)
""",
        "python_code": """import pandas as pd
import numpy as np

def run_strategy(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    typical = (frame["high"] + frame["low"] + frame["close"]) / 3.0
    cum_vol = frame["volume"].cumsum()
    cum_tp_vol = (typical * frame["volume"]).cumsum()
    frame["vwap"] = cum_tp_vol / cum_vol

    # Cumulative standard deviation of typical price around VWAP
    vwap_dev = np.sqrt(
        ((typical - frame["vwap"]) ** 2 * frame["volume"]).cumsum() / cum_vol
    )

    frame["vwap_upper1"] = frame["vwap"] + 1.0 * vwap_dev
    frame["vwap_lower1"] = frame["vwap"] - 1.0 * vwap_dev
    frame["vwap_upper2"] = frame["vwap"] + 2.0 * vwap_dev
    frame["vwap_lower2"] = frame["vwap"] - 2.0 * vwap_dev
    frame["vwap_upper3"] = frame["vwap"] + 3.0 * vwap_dev
    frame["vwap_lower3"] = frame["vwap"] - 3.0 * vwap_dev

    frame["long_condition"] = frame["close"] < frame["vwap_lower1"]
    return frame
""",
    },
]


indicator_service = IndicatorService()
