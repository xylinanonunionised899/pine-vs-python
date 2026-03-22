import type { BridgeArtifact, CandlePoint, ChatResponse, IndicatorCategory, IndicatorSeries, OllamaModelInfo, PermissionGrant, RunConfig, RunStatus, StrategyArtifact, TradeEvent } from "@shared/contracts";
import type { PineError } from "@/services/pineExecutionService";
import { useCallback, useMemo, useState } from "react";
import { ApprovalQueue } from "@/components/comparison/ApprovalQueue";
import { DiffPanel } from "@/components/comparison/DiffPanel";
import { LLMChat } from "@/components/chat/LLMChat";
import { ChartPanel } from "@/components/charts/ChartPanel";
import { PineEditor } from "@/components/editors/PineEditor";
import { PythonEditor } from "@/components/editors/PythonEditor";

type WorkspacePageProps = {
  runConfig: RunConfig;
  pineArtifact: StrategyArtifact;
  pythonArtifact: StrategyArtifact;
  currentRun: RunStatus | null;
  bridgeArtifacts: BridgeArtifact[];
  selectedBridgeArtifactId: string | null;
  permissions: PermissionGrant[];
  busy: Record<string, boolean>;
  onRunConfigChange: (runConfig: RunConfig) => void;
  onPineArtifactChange: (artifact: StrategyArtifact) => void;
  onPythonArtifactChange: (artifact: StrategyArtifact) => void;
  onBridgeSelectionChange: (artifactId: string | null) => void;
  onReplay: () => void;
  onLive: () => void;
  onRefreshArtifacts: () => void;
  onTogglePermission: (grant: PermissionGrant) => void;
  onAskLlm: (prompt: string) => void;
  availableModels: OllamaModelInfo[];
  chatModel: string;
  onChatModelChange: (model: string) => void;
  onRefreshModels: () => void;
  llmResponse: ChatResponse | null;
  isDemoDataset: boolean;
  pineCandles: CandlePoint[];
  onRunPine: () => void;
  companionDatasetIds: Record<string, string>;
  pineExecutionState: {
    isRunning: boolean;
    indicators: IndicatorSeries[];
    trades: TradeEvent[];
    errors: PineError[];
    lastRunAt: string | null;
  };
  onSaveToLibrary: (name: string, description: string, category: IndicatorCategory) => void;
};

export function WorkspacePage({ runConfig, pineArtifact, pythonArtifact, currentRun, bridgeArtifacts, selectedBridgeArtifactId, permissions, busy, onRunConfigChange, onPineArtifactChange, onPythonArtifactChange, onBridgeSelectionChange, onReplay, onLive, onRefreshArtifacts, onTogglePermission, onAskLlm, availableModels, chatModel, onChatModelChange, onRefreshModels, llmResponse, isDemoDataset, pineCandles, onRunPine, companionDatasetIds, pineExecutionState, onSaveToLibrary }: WorkspacePageProps) {
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [saveCat, setSaveCat] = useState<IndicatorCategory>("custom");

  const handleSave = useCallback(() => {
    if (!saveName.trim()) return;
    onSaveToLibrary(saveName.trim(), saveDesc.trim(), saveCat);
    setShowSaveForm(false);
    setSaveName("");
    setSaveDesc("");
    setSaveCat("custom");
  }, [saveName, saveDesc, saveCat, onSaveToLibrary]);

  const pineSeries = pineExecutionState.indicators.length > 0
    ? pineExecutionState.indicators
    : currentRun?.pine_series ?? [];
  const pythonSeries = currentRun?.python_series ?? [];
  const runCandles = currentRun?.candles ?? [];
  const companionAliases = Object.keys(companionDatasetIds);
  const requiresBridge = pineArtifact.source_code.includes("request.security");
  const selectedBridgeArtifact = useMemo(
    () => bridgeArtifacts.find((artifact) => artifact.artifact_id === selectedBridgeArtifactId) ?? null,
    [bridgeArtifacts, selectedBridgeArtifactId],
  );
  const hasBridgeMismatch = !!selectedBridgeArtifact && (
    selectedBridgeArtifact.symbol !== runConfig.symbol || selectedBridgeArtifact.timeframe !== runConfig.timeframe
  );

  const pineChartCandles = pineCandles.length > 0 ? pineCandles : runCandles;
  const pythonChartCandles = runCandles.length > 0 ? runCandles : pineChartCandles;

  return (
    <div className="workspace-grid route-grid">
      <style>{`@keyframes pine-spin { to { transform: rotate(360deg); } }`}</style>
      <section className="pane pane-main">
        {isDemoDataset ? (
          <div className="banner" style={{ marginBottom: 12, background: "rgba(32, 201, 151, 0.08)", borderLeft: "3px solid #20c997", padding: "0.5rem 0.75rem", borderRadius: "4px", fontSize: "0.85rem", color: "#a8e6cf" }}>
            Showing bundled demo data. Import your own file in Imports to replace it.
          </div>
        ) : null}
        {requiresBridge ? (
          <div className="banner warning" style={{ marginBottom: 12 }}>
            This Pine script uses request.security. Python replay can run, but exact Pine parity is incomplete until you attach a matching TradingView bridge artifact.
          </div>
        ) : null}
        {hasBridgeMismatch ? (
          <div className="banner warning" style={{ marginBottom: 12 }}>
            Selected bridge artifact does not match the current run target ({runConfig.symbol} {runConfig.timeframe}). Use Settings or the artifact selector to attach a matching export.
          </div>
        ) : null}
        <div className="action-row surface toolbar-card">
          <label className="field compact-field">
            <span>Mode</span>
            <select value={runConfig.mode} onChange={(event) => onRunConfigChange({ ...runConfig, mode: event.target.value as RunConfig["mode"] })}>
              <option value="local_compare">Local compare</option>
              <option value="pine_bridge">Pine bridge</option>
            </select>
          </label>
          <label className="field compact-field">
            <span>Timeframe</span>
            <input value={runConfig.timeframe} onChange={(event) => onRunConfigChange({ ...runConfig, timeframe: event.target.value })} />
          </label>
          <label className="field compact-field grow-field">
            <span>Pine bridge artifact</span>
            <select value={selectedBridgeArtifactId ?? ""} onChange={(event) => onBridgeSelectionChange(event.target.value || null)}>
              <option value="">No artifact</option>
              {bridgeArtifacts.map((artifact) => (
                <option key={artifact.artifact_id} value={artifact.artifact_id}>{artifact.name}</option>
              ))}
            </select>
          </label>
          <button className="action-button secondary" type="button" onClick={onRefreshArtifacts}>Refresh Pine export</button>
          <button className="action-button" type="button" onClick={onRunPine} disabled={pineExecutionState.isRunning}>
            {pineExecutionState.isRunning ? "Running Pine..." : "Run Pine"}
          </button>
          {companionAliases.length > 0 ? (
            <span className="pill" title="Datasets exposed to Python strategies as companion series">
              Companions: {companionAliases.join(", ")}
            </span>
          ) : null}
          {pineExecutionState.isRunning && (
            <span className="pine-status pine-status--running" title="Executing Pine Script..." style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.15rem 0.5rem", borderRadius: "0.25rem", display: "inline-flex", alignItems: "center", gap: "0.25rem", marginLeft: "0.25rem", color: "#f4b942", background: "rgba(244, 185, 66, 0.1)" }}>
              <span style={{ animation: "pine-spin 1s linear infinite", display: "inline-block" }}>&#x27F3;</span> Running
            </span>
          )}
          {!pineExecutionState.isRunning && pineExecutionState.errors.length > 0 && (
            <span className="pine-status pine-status--error" title={pineExecutionState.errors[0].message} style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.15rem 0.5rem", borderRadius: "0.25rem", display: "inline-flex", alignItems: "center", gap: "0.25rem", marginLeft: "0.25rem", color: "#ff6b6b", background: "rgba(255, 107, 107, 0.1)" }}>
              &#x2715; Error
            </span>
          )}
          {!pineExecutionState.isRunning && pineExecutionState.errors.length === 0 && pineExecutionState.lastRunAt !== null && (
            <span className="pine-status pine-status--success" title="Pine Script executed successfully" style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.15rem 0.5rem", borderRadius: "0.25rem", display: "inline-flex", alignItems: "center", gap: "0.25rem", marginLeft: "0.25rem", color: "#20c997", background: "rgba(32, 201, 151, 0.1)" }}>
              &#x2713; Done
            </span>
          )}
          <button className="action-button" type="button" onClick={onReplay}>{busy.replay ? "Running replay..." : "Run replay"}</button>
          <button className="action-button" type="button" onClick={onLive}>{busy.live ? "Starting live..." : "Start live run"}</button>
          <button className="action-button secondary" type="button" onClick={() => setShowSaveForm((v) => !v)} style={{ marginLeft: "auto" }}>
            {showSaveForm ? "Cancel" : "Save to Library"}
          </button>
        </div>

        {showSaveForm && (
          <div className="surface toolbar-card" style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <label className="field compact-field" style={{ flex: 1, minWidth: "150px" }}>
              <span>Name</span>
              <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. My EMA Strategy" />
            </label>
            <label className="field compact-field" style={{ flex: 2, minWidth: "200px" }}>
              <span>Description</span>
              <input value={saveDesc} onChange={(e) => setSaveDesc(e.target.value)} placeholder="Short description..." />
            </label>
            <label className="field compact-field">
              <span>Category</span>
              <select value={saveCat} onChange={(e) => setSaveCat(e.target.value as IndicatorCategory)}>
                <option value="trend">Trend</option>
                <option value="momentum">Momentum</option>
                <option value="volatility">Volatility</option>
                <option value="volume">Volume</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <button className="action-button" type="button" onClick={handleSave} disabled={!saveName.trim()}>
              Save
            </button>
          </div>
        )}

        <div className="split-pane">
          <article className="surface workspace-card">
            <PineEditor artifact={pineArtifact} onChange={onPineArtifactChange} errors={pineExecutionState.errors} />
            <ChartPanel title="Pine screen" seriesName={pineSeries[0]?.name ?? "No Pine series"} tone="pine" candles={pineChartCandles} indicatorSeries={pineSeries} emptyMessage="Run Pine to render indicators — or import a dataset in Imports first." trades={pineExecutionState.trades} />
            {pineExecutionState.lastRunAt && (
              <p className="chart-label" style={{ fontSize: "0.75rem", opacity: 0.7, padding: "0 0.5rem" }}>
                Last run: {new Date(pineExecutionState.lastRunAt).toLocaleTimeString()}
              </p>
            )}
          </article>
          <article className="surface workspace-card">
            <PythonEditor artifact={pythonArtifact} onChange={onPythonArtifactChange} />
            <div style={{ display: "flex", gap: "0.5rem", padding: "0.25rem 0.5rem" }}>
              <button className="action-button" type="button" onClick={onReplay} disabled={busy.replay}>
                {busy.replay ? "Running Python..." : "Run Python"}
              </button>
              {currentRun && !busy.replay && (
                <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.15rem 0.5rem", borderRadius: "0.25rem", display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "#20c997", background: "rgba(32, 201, 151, 0.1)" }}>
                  &#x2713; Done
                </span>
              )}
            </div>
            <ChartPanel title="Python screen" seriesName={pythonSeries[0]?.name ?? "No Python series"} tone="python" candles={pythonChartCandles} indicatorSeries={pythonSeries} emptyMessage="Run Python to generate indicator series — or import a dataset in Imports first." />
          </article>
        </div>

        <div className="bottom-dock">
          <DiffPanel comparison={currentRun?.comparison ?? null} warnings={currentRun?.warnings ?? []} lifecycle={currentRun?.lifecycle ?? "draft"} />
          <ApprovalQueue approvals={permissions} onToggle={onTogglePermission} />
        </div>
      </section>

      <aside className="pane pane-sidebar">
        <LLMChat approvals={permissions} pineArtifact={pineArtifact} pythonArtifact={pythonArtifact} comparison={currentRun?.comparison ?? null} onAsk={onAskLlm} busy={busy.chat ?? false} availableModels={availableModels} model={chatModel} onModelChange={onChatModelChange} onRefreshModels={onRefreshModels} response={llmResponse} />
      </aside>
    </div>
  );
}