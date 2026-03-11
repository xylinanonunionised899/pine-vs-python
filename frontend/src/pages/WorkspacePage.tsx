import type { BridgeArtifact, CandlePoint, ChatResponse, IndicatorSeries, OllamaModelInfo, PermissionGrant, RunConfig, RunStatus, StrategyArtifact, TradeEvent } from "@shared/contracts";
import type { PineError } from "@/services/pineExecutionService";
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
  pineCandles: CandlePoint[];
  onRunPine: () => void;
  pineExecutionState: {
    isRunning: boolean;
    indicators: IndicatorSeries[];
    trades: TradeEvent[];
    errors: PineError[];
    lastRunAt: string | null;
  };
};

export function WorkspacePage({ runConfig, pineArtifact, pythonArtifact, currentRun, bridgeArtifacts, selectedBridgeArtifactId, permissions, busy, onRunConfigChange, onPineArtifactChange, onPythonArtifactChange, onBridgeSelectionChange, onReplay, onLive, onRefreshArtifacts, onTogglePermission, onAskLlm, availableModels, chatModel, onChatModelChange, onRefreshModels, llmResponse, pineCandles, onRunPine, pineExecutionState }: WorkspacePageProps) {
  const pineSeries = pineExecutionState.indicators.length > 0
    ? pineExecutionState.indicators
    : currentRun?.pine_series ?? [];
  const pythonSeries = currentRun?.python_series ?? [];
  const runCandles = currentRun?.candles ?? [];

  // Unified candle source: after Pine runs (loads from selected dataset), BOTH charts
  // use the same candles so they stay aligned. Falls back to currentRun candles.
  const chartCandles = pineCandles.length > 0 ? pineCandles : runCandles;

  return (
    <div className="workspace-grid route-grid">
      <style>{`@keyframes pine-spin { to { transform: rotate(360deg); } }`}</style>
      <section className="pane pane-main">
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
        </div>

        <div className="split-pane">
          <article className="surface workspace-card">
            <PineEditor artifact={pineArtifact} onChange={onPineArtifactChange} errors={pineExecutionState.errors} />
            <ChartPanel title="Pine screen" seriesName={pineSeries[0]?.name ?? "No Pine series"} tone="pine" candles={chartCandles} indicatorSeries={pineSeries} emptyMessage="Click 'Run Pine' to execute Pine Script with PineTS." trades={pineExecutionState.trades} />
            {pineExecutionState.lastRunAt && (
              <p className="chart-label" style={{ fontSize: "0.75rem", opacity: 0.7, padding: "0 0.5rem" }}>
                Last run: {new Date(pineExecutionState.lastRunAt).toLocaleTimeString()}
              </p>
            )}
          </article>
          <article className="surface workspace-card">
            <PythonEditor artifact={pythonArtifact} onChange={onPythonArtifactChange} />
            <ChartPanel title="Python screen" seriesName={pythonSeries[0]?.name ?? "No Python series"} tone="python" candles={chartCandles} indicatorSeries={pythonSeries} emptyMessage="Run replay or live mode to populate Python outputs." />
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
