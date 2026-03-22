import type { ComparisonResult, DataSourceConfig, RunConfig, StrategyArtifact } from "@shared/contracts";
import type { CandlestickData, SingleValueData, Time } from "lightweight-charts";

export const samplePineArtifact: StrategyArtifact = {
  language: "pine",
  name: "Complex Pine Strategy",
  source_code: `//@version=5
strategy("Complex Pine Strategy", overlay=true)
emaFast = ta.ema(close, 21)
plot(emaFast, color=color.orange)
longCondition = close > emaFast
if longCondition
    strategy.entry("L", strategy.long)
`,
  declared_outputs: ["ema_fast", "longCondition"],
  permissions: { read_allowed: true, write_allowed: false },
  adapter_metadata: { export_contract: "series + trades" },
};

export const samplePythonArtifact: StrategyArtifact = {
  language: "python",
  name: "Python EMA Strategy",
  source_code: `import pandas as pd

def run_strategy(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    frame["ema_fast"] = frame["close"].ewm(span=21, adjust=False).mean()
    frame["long_condition"] = frame["close"] > frame["ema_fast"]
    return frame
`,
  declared_outputs: ["ema_fast", "long_condition"],
  permissions: { read_allowed: true, write_allowed: false },
  adapter_metadata: { engine: "local-python" },
};

export const sampleDataSource: DataSourceConfig = {
  type: "excel",
  name: "",
  file_path: "",
  symbol: "",
  timeframe: "5m",
  timezone: "Asia/Calcutta",
  mapping: { timestamp: "dt", open: "o", high: "h", low: "l", close: "c", volume: "v" },
  session: { timezone: "Asia/Calcutta" },
  extra: {},
};

export const sampleRunConfig: RunConfig = {
  mode: "local_compare",
  symbol: "DEMO",
  timeframe: "5m",
  one_open_position: true,
  tolerance: 0.001,
  warmup_bars: 100,
  selected_outputs: ["ema_fast"],
  timezone: "Asia/Calcutta",
  companion_dataset_ids: {},
};

export const sampleComparison: ComparisonResult = {
  summary: {
    aligned: false,
    total_series: 2,
    mismatched_series: 1,
    total_trade_events: 1,
    mismatched_trade_events: 0,
  },
  series_mismatches: [
    {
      classification: "python_implementation",
      series_name: "ema_fast",
      timestamp: "2026-03-09T09:15:00Z",
      expected: 245.51,
      actual: 244.84,
      delta: 0.67,
      message: "Python EMA diverged after the warmup window.",
      suspected_region: "python: indicators/ema_fast",
    },
  ],
  trade_mismatches: [],
  first_mismatch: {
    classification: "python_implementation",
    series_name: "ema_fast",
    timestamp: "2026-03-09T09:15:00Z",
    expected: 245.51,
    actual: 244.84,
    delta: 0.67,
    message: "Python EMA diverged after the warmup window.",
    suspected_region: "python: indicators/ema_fast",
  },
  unsupported_feature_warnings: [],
  suggested_next_action: "Inspect EMA seed and warmup handling in the Python script.",
  live: false,
  artifact_refs: [],
};

export const sampleCandles: CandlestickData<Time>[] = [
  { time: "2026-03-09", open: 243.2, high: 246.1, low: 242.8, close: 245.5 },
  { time: "2026-03-10", open: 245.5, high: 247.8, low: 244.9, close: 246.2 },
  { time: "2026-03-11", open: 246.2, high: 248.1, low: 245.4, close: 247.6 },
  { time: "2026-03-12", open: 247.6, high: 249.2, low: 246.7, close: 248.9 },
  { time: "2026-03-13", open: 248.9, high: 250.5, low: 247.8, close: 249.7 },
];

export const sampleIndicator: SingleValueData<Time>[] = [
  { time: "2026-03-09", value: 244.1 },
  { time: "2026-03-10", value: 244.8 },
  { time: "2026-03-11", value: 245.6 },
  { time: "2026-03-12", value: 246.5 },
  { time: "2026-03-13", value: 247.4 },
];
