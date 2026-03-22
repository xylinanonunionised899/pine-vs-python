import type { DatasetArtifact, DatasetPreview, DataSourceConfig } from "@shared/contracts";

const TRADINGVIEW_VIX_PRESET = "tradingview_vix";
const DEFAULT_GENERIC_MAPPING = { timestamp: "dt", open: "o", high: "h", low: "l", close: "c", volume: "v" };
const DEFAULT_TRADINGVIEW_MAPPING = { timestamp: "time", open: "open", high: "high", low: "low", close: "close", volume: "Volume" };

type ImportsPageProps = {
  dataSource: DataSourceConfig;
  preview: DatasetPreview | null;
  datasets: DatasetArtifact[];
  selectedDatasetId: string | null;
  companionDatasetIds: Record<string, string>;
  busy: Record<string, boolean>;
  onDataSourceChange: (dataSource: DataSourceConfig) => void;
  onPreview: () => void;
  onSave: () => void;
  onSelectDataset: (datasetId: string) => void;
  onAttachCompanion: (dataset: DatasetArtifact) => void;
  onDetachCompanion: (alias: string) => void;
};

export function ImportsPage({
  dataSource,
  preview,
  datasets,
  selectedDatasetId,
  companionDatasetIds,
  busy,
  onDataSourceChange,
  onPreview,
  onSave,
  onSelectDataset,
  onAttachCompanion,
  onDetachCompanion,
}: ImportsPageProps) {
  const importPreset = typeof dataSource.extra.import_preset === "string" ? dataSource.extra.import_preset : "generic";
  const isTradingViewVixPreset = importPreset === TRADINGVIEW_VIX_PRESET;
  const mapping = dataSource.mapping ?? (isTradingViewVixPreset ? DEFAULT_TRADINGVIEW_MAPPING : DEFAULT_GENERIC_MAPPING);
  const companionEntries = Object.entries(companionDatasetIds);

  const updateMapping = (key: keyof typeof mapping, value: string) => {
    onDataSourceChange({ ...dataSource, mapping: { ...mapping, [key]: value } });
  };

  const handlePresetChange = (value: string) => {
    if (value === TRADINGVIEW_VIX_PRESET) {
      onDataSourceChange({
        ...dataSource,
        type: "csv",
        name: dataSource.name === "SBIN local workbook" || dataSource.name.trim() === "" ? "TradingView VIX export" : dataSource.name,
        symbol: "CBOE:VIX",
        timezone: dataSource.timezone === "Asia/Calcutta" ? "America/New_York" : dataSource.timezone,
        mapping: DEFAULT_TRADINGVIEW_MAPPING,
        extra: { ...dataSource.extra, import_preset: TRADINGVIEW_VIX_PRESET },
      });
      return;
    }

    const nextExtra = { ...dataSource.extra };
    delete nextExtra.import_preset;
    onDataSourceChange({
      ...dataSource,
      mapping: DEFAULT_GENERIC_MAPPING,
      extra: nextExtra,
    });
  };

  return (
    <div className="page-grid two-column">
      <section className="surface page-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Dataset ingestion</p>
            <h2>Import and map source data</h2>
          </div>
          <span className="pill">Hybrid replay ready</span>
        </div>
        <div className="field-grid two-up">
          <label className="field">
            <span>Import preset</span>
            <select value={importPreset} onChange={(event) => handlePresetChange(event.target.value)}>
              <option value="generic">Generic file import</option>
              <option value={TRADINGVIEW_VIX_PRESET}>TradingView VIX export</option>
            </select>
          </label>
          <label className="field">
            <span>Source type</span>
            <select value={dataSource.type} disabled={isTradingViewVixPreset} onChange={(event) => onDataSourceChange({ ...dataSource, type: event.target.value as DataSourceConfig["type"] })}>
              <option value="excel">Excel</option>
              <option value="csv">CSV</option>
              <option value="polygon">Polygon API</option>
            </select>
          </label>
        </div>
        {isTradingViewVixPreset ? (
          <div className="banner warning" style={{ marginBottom: 12 }}>
            TradingView VIX export mode expects a CSV export with symbol fixed to CBOE:VIX. Use this for the companion series required by Pine scripts that call request.security on VIX.
          </div>
        ) : null}
        <div className="field-grid two-up">
          <label className="field">
            <span>Name</span>
            <input value={dataSource.name} onChange={(event) => onDataSourceChange({ ...dataSource, name: event.target.value })} />
          </label>
          <label className="field">
            <span>Local file path</span>
            <input value={dataSource.file_path ?? ""} onChange={(event) => onDataSourceChange({ ...dataSource, file_path: event.target.value })} />
          </label>
        </div>
        <div className="field-grid three-up">
          <label className="field">
            <span>Symbol</span>
            <input value={isTradingViewVixPreset ? "CBOE:VIX" : dataSource.symbol ?? ""} readOnly={isTradingViewVixPreset} onChange={(event) => onDataSourceChange({ ...dataSource, symbol: event.target.value })} />
          </label>
          <label className="field">
            <span>Timeframe</span>
            <input value={dataSource.timeframe} onChange={(event) => onDataSourceChange({ ...dataSource, timeframe: event.target.value })} />
          </label>
          <label className="field">
            <span>Timezone</span>
            <input value={dataSource.timezone} onChange={(event) => onDataSourceChange({ ...dataSource, timezone: event.target.value })} />
          </label>
        </div>
        <div className="mapping-grid">
          {(["timestamp", "open", "high", "low", "close", "volume"] as const).map((key) => (
            <label className="field" key={key}>
              <span>{key}</span>
              <input value={(mapping[key] ?? "") as string} onChange={(event) => updateMapping(key, event.target.value)} />
            </label>
          ))}
        </div>
        <div className="action-row">
          <button className="action-button" type="button" onClick={onPreview}>{busy.preview ? "Previewing..." : "Preview source"}</button>
          <button className="action-button secondary" type="button" onClick={onSave}>{busy.saveDataset ? "Saving..." : "Save mapping"}</button>
        </div>
        {preview ? (
          <div className="preview-box">
            {typeof preview.preview.preset_label === "string" ? <p><strong>Preset:</strong> {preview.preview.preset_label}</p> : null}
            {typeof preview.preview.required_symbol === "string" ? <p><strong>Required symbol:</strong> {preview.preview.required_symbol}</p> : null}
            <p><strong>Rows:</strong> {String(preview.preview.row_count ?? "n/a")}</p>
            <p><strong>Columns:</strong> {Array.isArray(preview.preview.columns) ? (preview.preview.columns as string[]).join(", ") : "n/a"}</p>
            <p><strong>Sheet:</strong> {String(preview.preview.active_sheet ?? "n/a")}</p>
            <pre>{JSON.stringify(preview.preview.sample_rows ?? [], null, 2)}</pre>
          </div>
        ) : null}
      </section>

      <section className="surface page-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Saved datasets</p>
            <h2>Reusable local sources</h2>
          </div>
          <span className="pill">{companionEntries.length} companions attached</span>
        </div>

        {companionEntries.length > 0 ? (
          <div className="preview-box" style={{ marginBottom: 16 }}>
            <p><strong>Attached companion datasets</strong></p>
            {companionEntries.map(([alias, datasetId]) => {
              const dataset = datasets.find((entry) => entry.dataset_id === datasetId);
              return (
                <div key={alias} className="action-row" style={{ justifyContent: "space-between" }}>
                  <span>{alias} - {dataset?.name ?? datasetId}</span>
                  <button className="action-button secondary" type="button" onClick={() => onDetachCompanion(alias)}>
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="stack-list">
          {datasets.map((dataset) => {
            const attachedAlias = Object.entries(companionDatasetIds).find(([, datasetId]) => datasetId === dataset.dataset_id)?.[0] ?? null;
            const isPrimary = dataset.dataset_id === selectedDatasetId;
            const isVixDataset = dataset.symbol === "CBOE:VIX";
            return (
              <article className="list-card" key={dataset.dataset_id}>
                <div>
                  <strong>{dataset.name}</strong>
                  <p>{dataset.symbol ?? "No symbol"} | {dataset.timeframe} | {dataset.row_count} rows</p>
                  {isPrimary ? <p>Primary dataset selected</p> : null}
                  {attachedAlias ? <p>Attached as companion: {attachedAlias}</p> : null}
                  {isVixDataset ? <p>TradingView-ready VIX companion candidate</p> : null}
                </div>
                <div className="action-row" style={{ justifyContent: "flex-end" }}>
                  <button className="action-button secondary" type="button" onClick={() => onSelectDataset(dataset.dataset_id)}>Use dataset</button>
                  {attachedAlias ? (
                    <button className="action-button secondary" type="button" onClick={() => onDetachCompanion(attachedAlias)}>
                      Remove companion
                    </button>
                  ) : (
                    <button className="action-button" type="button" onClick={() => onAttachCompanion(dataset)}>
                      {isVixDataset ? "Attach as VIX companion" : "Attach as companion"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {datasets.length === 0 ? <p className="muted-copy">No saved datasets yet.</p> : null}
        </div>
      </section>
    </div>
  );
}