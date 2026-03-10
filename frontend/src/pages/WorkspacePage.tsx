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
  const candles = currentRun?.candles ?? [];
  const pineChartCandles = pineCandles.length > 0 ? pineCandles : candles;

  return (
    <div className="workspace-grid route-grid">
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
          <button className="action-button" type="button" onClick={onReplay}>{busy.replay ? "Running replay..." : "Run replay"}</button>
          <button className="action-button" type="button" onClick={onLive}>{busy.live ? "Starting live..." : "Start live run"}</button>
        </div>

        <div className="split-pane">
          <article className="surface workspace-card">
            <PineEditor artifact={pineArtifact} onChange={onPineArtifactChange} errors={pineExecutionState.errors} />
            <ChartPanel title="Pine screen" seriesName={pineSeries[0]?.name ?? "No Pine series"} tone="pine" candles={pineChartCandles} indicatorSeries={pineSeries} emptyMessage="Click 'Run Pine' to execute Pine Script with PineTS." />
            {pineExecutionState.lastRunAt && (
              <p className="chart-label" style={{ fontSize: "0.75rem", opacity: 0.7, padding: "0 0.5rem" }}>
                Last Pine run: {new Date(pineExecutionState.lastRunAt).toLocaleTimeString()}
                {pineExecutionState.trades.length > 0 ? ` | ${pineExecutionState.trades.length} trade events` : ""}
              </p>
            )}
          </article>
          <article className="surface workspace-card">
            <PythonEditor artifact={pythonArtifact} onChange={onPythonArtifactChange} />
            <ChartPanel title="Python screen" seriesName={pythonSeries[0]?.name ?? "No Python series"} tone="python" candles={candles} indicatorSeries={pythonSeries} emptyMessage="Run replay or live mode to populate Python outputs." />
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
