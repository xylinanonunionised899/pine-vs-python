import { useState } from "react";

import type { DataSourceConfig, RunConfig } from "@shared/contracts";
import { previewDataSource } from "@/services/api";

type DataControlPanelProps = {
  dataSource: DataSourceConfig;
  runConfig: RunConfig;
  onDataSourceChange: (next: DataSourceConfig) => void;
  onRunConfigChange: (next: RunConfig) => void;
};

export function DataControlPanel({ dataSource, runConfig, onDataSourceChange, onRunConfigChange }: DataControlPanelProps) {
  const [previewState, setPreviewState] = useState<{
    loading: boolean;
    error: string | null;
    data: Record<string, unknown> | null;
  }>({
    loading: false,
    error: null,
    data: null,
  });

  const handlePreview = async () => {
    setPreviewState({ loading: true, error: null, data: null });
    try {
      const response = await previewDataSource(dataSource);
      setPreviewState({ loading: false, error: null, data: response.preview as Record<string, unknown> });
    } catch (error) {
      setPreviewState({
        loading: false,
        error: error instanceof Error ? error.message : "Preview failed",
        data: null,
      });
    }
  };

  const sampleRows = Array.isArray(previewState.data?.sample_rows)
    ? (previewState.data?.sample_rows as Array<Record<string, unknown>>)
    : [];

  return (
    <section className="surface sidebar-card">
      <div className="sidebar-header">
        <div>
          <p className="eyebrow">Data and settings</p>
          <h2>Control panel</h2>
        </div>
      </div>
      <label className="field">
        <span>Source type</span>
        <select
          value={dataSource.type}
          onChange={(event) => onDataSourceChange({ ...dataSource, type: event.target.value as DataSourceConfig["type"] })}
        >
          <option value="excel">Excel</option>
          <option value="csv">CSV</option>
          <option value="polygon">Polygon API</option>
        </select>
      </label>
      <label className="field">
        <span>Local file path</span>
        <input
          value={dataSource.file_path ?? ""}
          onChange={(event) => onDataSourceChange({ ...dataSource, file_path: event.target.value })}
          placeholder="C:\\path\\to\\your\\data.xlsx"
        />
      </label>
      <label className="field">
        <span>Symbol</span>
        <input
          value={runConfig.symbol}
          onChange={(event) => {
            const value = event.target.value;
            onRunConfigChange({ ...runConfig, symbol: value });
            onDataSourceChange({ ...dataSource, symbol: value });
          }}
        />
      </label>
      <label className="field">
        <span>Timeframe</span>
        <select
          value={runConfig.timeframe}
          onChange={(event) => {
            const value = event.target.value;
            onRunConfigChange({ ...runConfig, timeframe: value });
            onDataSourceChange({ ...dataSource, timeframe: value });
          }}
        >
          <option value="5m">5m</option>
          <option value="15m">15m</option>
          <option value="1H">1H</option>
          <option value="1D">1D</option>
        </select>
      </label>
      <label className="field">
        <span>Mode</span>
        <select
          value={runConfig.mode}
          onChange={(event) => onRunConfigChange({ ...runConfig, mode: event.target.value as RunConfig["mode"] })}
        >
          <option value="local_compare">Local compare</option>
          <option value="pine_bridge">Pine bridge</option>
        </select>
      </label>
      <label className="field">
        <span>Tolerance</span>
        <input
          type="number"
          step="0.0001"
          value={runConfig.tolerance}
          onChange={(event) => onRunConfigChange({ ...runConfig, tolerance: Number(event.target.value) })}
        />
      </label>
      <button className="action-button" onClick={() => void handlePreview()} type="button">
        {previewState.loading ? "Previewing..." : "Preview source"}
      </button>
      <div className="summary-box">
        <p>Default import is local file mapping with deterministic replay. Switch to Pine bridge when exact TradingView parity matters.</p>
      </div>
      {previewState.error ? <p className="error-text">{previewState.error}</p> : null}
      {previewState.data ? (
        <div className="preview-box">
          <p><strong>Rows:</strong> {String(previewState.data.row_count ?? "n/a")}</p>
          <p><strong>Columns:</strong> {Array.isArray(previewState.data.columns) ? previewState.data.columns.join(", ") : "n/a"}</p>
          <p><strong>Sheet:</strong> {String(previewState.data.active_sheet ?? "n/a")}</p>
          {sampleRows.length > 0 ? (
            <pre>{JSON.stringify(sampleRows, null, 2)}</pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
