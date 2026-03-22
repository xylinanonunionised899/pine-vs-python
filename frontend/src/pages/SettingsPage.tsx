import type { BridgeArtifact, DependencyStatus, OllamaModelInfo, RunConfig } from "@shared/contracts";
import { useMemo, useRef, type ChangeEvent } from "react";

type SettingsPageProps = {
  dependencies: DependencyStatus | null;
  bridgeArtifacts: BridgeArtifact[];
  bridgeJson: string;
  availableModels: OllamaModelInfo[];
  selectedChatModel: string;
  busy: Record<string, boolean>;
  onBridgeJsonChange: (bridgeJson: string) => void;
  onChatModelChange: (model: string) => void;
  onRefreshModels: () => void;
  onSubmitBridge: () => void;
  pineSource: string;
  runConfig: RunConfig;
};

export function SettingsPage({ dependencies, bridgeArtifacts, bridgeJson, availableModels, selectedChatModel, busy, onBridgeJsonChange, onChatModelChange, onRefreshModels, onSubmitBridge, pineSource, runConfig }: SettingsPageProps) {
  const chatModels = availableModels.filter((model) => model.chat_capable);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requiresBridge = pineSource.includes("request.security");
  const hasMatchingArtifact = useMemo(
    () => bridgeArtifacts.some((artifact) => artifact.symbol === runConfig.symbol && artifact.timeframe === runConfig.timeframe),
    [bridgeArtifacts, runConfig.symbol, runConfig.timeframe],
  );

  const handleBridgeFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    onBridgeJsonChange(content);
    event.target.value = "";
  };

  return (
    <div className="page-grid two-column">
      <section className="surface page-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Dependencies</p>
            <h2>Runtime readiness</h2>
          </div>
        </div>
        <div className="stack-list">
          {dependencies ? Object.values(dependencies).map((item) => (
            <article className="list-card" key={item.name}>
              <div>
                <strong>{item.name}</strong>
                <p>{item.available ? "Available" : "Unavailable"}</p>
                <p>{item.detail}</p>
              </div>
            </article>
          )) : <p className="muted-copy">Backend dependency status has not loaded yet.</p>}
        </div>
        <div className="field" style={{ marginTop: 16 }}>
          <span>Ollama model connection</span>
          <div className="action-row">
            <select value={selectedChatModel} onChange={(event) => onChatModelChange(event.target.value)}>
              {chatModels.length > 0 ? chatModels.map((model) => (
                <option key={model.name} value={model.name}>{model.name}</option>
              )) : <option value="offline-fallback">offline-fallback</option>}
            </select>
            <button className="action-button secondary" type="button" onClick={onRefreshModels}>Refresh models</button>
          </div>
        </div>
        <div className="stack-list compact-list">
          {availableModels.length > 0 ? availableModels.map((model) => (
            <article className="list-card" key={model.name}>
              <div>
                <strong>{model.name}</strong>
                <p>{model.size ? `${(model.size / (1024 ** 3)).toFixed(1)} GB` : "Size unavailable"}</p>
                <p>{model.chat_capable ? "Chat-capable" : "Embedding / non-chat"}</p>
              </div>
            </article>
          )) : <p className="muted-copy">No local Ollama models found yet.</p>}
        </div>
      </section>
      <section className="surface page-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">TradingView bridge</p>
            <h2>Manual export artifact</h2>
          </div>
        </div>
        {requiresBridge ? (
          <div className="banner warning" style={{ marginBottom: 12 }}>
            This Pine script requires a TradingView bridge artifact for exact parity. Expected run target: {runConfig.symbol} {runConfig.timeframe}. {hasMatchingArtifact ? "A matching artifact already exists below." : "No matching artifact has been saved yet."}
          </div>
        ) : null}
        <label className="field">
          <span>Current Pine source</span>
          <textarea rows={8} value={pineSource} readOnly />
        </label>
        <div className="action-row" style={{ marginBottom: 8 }}>
          <button className="action-button secondary" type="button" onClick={() => fileInputRef.current?.click()}>
            Import bridge JSON file
          </button>
          <span className="muted-copy">Saved artifacts will use the current run target: {runConfig.symbol} {runConfig.timeframe}</span>
        </div>
        <input ref={fileInputRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={handleBridgeFileImport} />
        <label className="field">
          <span>Bridge JSON payload</span>
          <textarea rows={14} value={bridgeJson} onChange={(event) => onBridgeJsonChange(event.target.value)} />
        </label>
        <button className="action-button" type="button" onClick={onSubmitBridge}>{busy.bridge ? "Saving artifact..." : "Save bridge artifact"}</button>
        <div className="stack-list compact-list">
          {bridgeArtifacts.map((artifact) => {
            const matchesCurrentRun = artifact.symbol === runConfig.symbol && artifact.timeframe === runConfig.timeframe;
            return (
              <article className="list-card" key={artifact.artifact_id}>
                <div>
                  <strong>{artifact.name}</strong>
                  <p>{artifact.symbol} | {artifact.timeframe} | {artifact.indicator_series.length} series</p>
                  <p>{matchesCurrentRun ? "Matches current run target" : `Mismatch: expected ${runConfig.symbol} ${runConfig.timeframe}`}</p>
                </div>
              </article>
            );
          })}
          {bridgeArtifacts.length === 0 ? <p className="muted-copy">No bridge artifacts saved yet.</p> : null}
        </div>
      </section>
    </div>
  );
}