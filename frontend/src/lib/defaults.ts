import type { BridgeArtifact, DataSourceConfig, RunConfig, StrategyArtifact } from "@shared/contracts";

export const defaultPineArtifact: StrategyArtifact = {
  language: "pine",
  name: "EMA Crossover (21/50)",
  source_code: `//@version=5
indicator("EMA Crossover (21/50)", overlay=true)
ema_fast = ta.ema(close, 21)
ema_slow = ta.ema(close, 50)
long_condition = ema_fast > ema_slow
plot(ema_fast, color=color.orange, linewidth=2)
plot(ema_slow, color=color.blue, linewidth=2)
`,
  declared_outputs: ["ema_fast", "ema_slow", "long_condition"],
  permissions: { read_allowed: true, write_allowed: false },
  adapter_metadata: { export_contract: "series + trades" },
};

export const defaultPythonArtifact: StrategyArtifact = {
  language: "python",
  name: "EMA Crossover (21/50)",
  source_code: `import pandas as pd

def run_strategy(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    frame["ema_fast"] = frame["close"].ewm(span=21, adjust=False).mean()
    frame["ema_slow"] = frame["close"].ewm(span=50, adjust=False).mean()
    frame["long_condition"] = frame["ema_fast"] > frame["ema_slow"]
    return frame
`,
  declared_outputs: ["ema_fast", "ema_slow", "long_condition"],
  permissions: { read_allowed: true, write_allowed: false },
  adapter_metadata: { engine: "local-python" },
};

export const defaultDataSource: DataSourceConfig = {
  type: "excel",
  name: "",
  file_path: "",
  symbol: "",
  timeframe: "5m",
  timezone: "Asia/Calcutta",
  mapping: {
    timestamp: "dt",
    open: "o",
    high: "h",
    low: "l",
    close: "c",
    volume: "v",
  },
  session: { timezone: "Asia/Calcutta" },
  extra: {},
};

export const defaultRunConfig: RunConfig = {
  mode: "local_compare",
  symbol: "DEMO",
  timeframe: "5m",
  one_open_position: true,
  tolerance: 0.001,
  warmup_bars: 50,
  selected_outputs: [],
  timezone: "Asia/Calcutta",
  companion_dataset_ids: {},
};

export const defaultBridgeJson = JSON.stringify(
  {
    indicator_series: [
      {
        name: "ema_fast",
        pane: "main",
        style: { color: "#f4b942" },
        warmup_bars: 100,
        values: [
          { timestamp: "2025-02-27T03:45:00Z", value: 713.95 },
          { timestamp: "2025-02-27T03:50:00Z", value: 713.72 }
        ]
      }
    ],
    trade_events: []
  },
  null,
  2,
);

export const emptyBridgePayload = (symbol: string, timeframe: string): Omit<BridgeArtifact, "artifact_id" | "created_at"> => ({
  name: `${symbol} bridge artifact`,
  symbol,
  timeframe,
  source_code: defaultPineArtifact.source_code,
  indicator_series: [],
  trade_events: [],
  notes: "Manual TradingView export artifact",
});
