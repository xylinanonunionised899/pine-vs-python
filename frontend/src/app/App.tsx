import type {
  BridgeArtifact,
  CandlePoint,
  ChatResponse,
  DatasetArtifact,
  DatasetPreview,
  DataSourceConfig,
  DependencyStatus,
  OllamaModelInfo,
  PermissionGrant,
  RunConfig,
  RunStatus,
  StrategyArtifact,
} from "@shared/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";

import { defaultBridgeJson, defaultDataSource, defaultPineArtifact, defaultPythonArtifact, defaultRunConfig } from "@/lib/defaults";
import { usePineExecution } from "@/hooks/usePineExecution";
import { ImportsPage } from "@/pages/ImportsPage";
import { RunsPage } from "@/pages/RunsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { WorkspacePage } from "@/pages/WorkspacePage";
import {
  chatWithOllama,
  createBridgeArtifact,
  createLiveRun,
  createReplayRun,
  getDatasetCandles,
  getDependencyStatus,
  getRun,
  grantPermission,
  listBridgeArtifacts,
  listDatasets,
  listOllamaModels,
  listPermissions,
  listRuns,
  previewDataSource,
  saveDataset,
} from "@/services/api";
import { connectRunStream } from "@/services/websocket";

type AppState = {
  dependencies: DependencyStatus | null;
  datasets: DatasetArtifact[];
  runs: RunStatus[];
  permissions: PermissionGrant[];
  bridgeArtifacts: BridgeArtifact[];
  dataSource: DataSourceConfig;
  runConfig: RunConfig;
  pineArtifact: StrategyArtifact;
  pythonArtifact: StrategyArtifact;
  preview: DatasetPreview | null;
  selectedDatasetId: string | null;
  selectedBridgeArtifactId: string | null;
  selectedRunId: string | null;
  backendNotice: string | null;
  llmResponse: ChatResponse | null;
  bridgeJson: string;
  availableModels: OllamaModelInfo[];
  selectedChatModel: string;
};

function describeUiError(action: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : "Unexpected error";
  return `${action}: ${detail}`;
}

function getChatCapableModels(models: OllamaModelInfo[]): OllamaModelInfo[] {
  return models.filter((model) => model.chat_capable !== false);
}

function pickDefaultChatModel(models: OllamaModelInfo[], currentSelection: string): string {
  const chatModels = getChatCapableModels(models);
  if (chatModels.some((model) => model.name === currentSelection)) {
    return currentSelection;
  }
  return chatModels.find((model) => model.name === "qwen3.5-9b-claude:latest")?.name ?? chatModels[0]?.name ?? "offline-fallback";
}

function AppRoutes() {
  const navigate = useNavigate();
  const [state, setState] = useState<AppState>({
    dependencies: null,
    datasets: [],
    runs: [],
    permissions: [],
    bridgeArtifacts: [],
    dataSource: defaultDataSource,
    runConfig: defaultRunConfig,
    pineArtifact: defaultPineArtifact,
    pythonArtifact: defaultPythonArtifact,
    preview: null,
    selectedDatasetId: null,
    selectedBridgeArtifactId: null,
    selectedRunId: null,
    backendNotice: null,
    llmResponse: null,
    bridgeJson: defaultBridgeJson,
    availableModels: [],
    selectedChatModel: "offline-fallback",
  });
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const pineExecution = usePineExecution();
  const [pineCandles, setPineCandles] = useState<CandlePoint[]>([]);

  const currentRun = useMemo(
    () => state.runs.find((run) => run.run_id === state.selectedRunId) ?? state.runs[0] ?? null,
    [state.runs, state.selectedRunId],
  );

  const currentDataset = useMemo(
    () => state.datasets.find((dataset) => dataset.dataset_id === state.selectedDatasetId) ?? state.datasets[0] ?? null,
    [state.datasets, state.selectedDatasetId],
  );

  const preferredChatModel = pickDefaultChatModel(state.availableModels, state.selectedChatModel);

  const refreshCore = async () => {
    const results = await Promise.allSettled([
      getDependencyStatus(),
      listDatasets(),
      listRuns(),
      listPermissions(),
      listBridgeArtifacts(),
      listOllamaModels(),
    ]);

    const [dependenciesResult, datasetsResult, runsResult, permissionsResult, bridgeResult, modelsResult] = results;
    const dependencyFailure = results.find((result) => result.status === "rejected");

    setState((current) => {
      const datasets = datasetsResult.status === "fulfilled" ? datasetsResult.value : current.datasets;
      const runs = runsResult.status === "fulfilled" ? runsResult.value : current.runs;
      const permissions = permissionsResult.status === "fulfilled" ? permissionsResult.value : current.permissions;
      const bridgeArtifacts = bridgeResult.status === "fulfilled" ? bridgeResult.value : current.bridgeArtifacts;
      const availableModels = modelsResult.status === "fulfilled" ? modelsResult.value : current.availableModels;
      const selectedChatModel = pickDefaultChatModel(availableModels, current.selectedChatModel);

      return {
        ...current,
        dependencies: dependenciesResult.status === "fulfilled" ? dependenciesResult.value : current.dependencies,
        datasets,
        runs,
        permissions,
        bridgeArtifacts,
        availableModels,
        selectedChatModel,
        selectedDatasetId: current.selectedDatasetId ?? ([...datasets].sort((a, b) => b.row_count - a.row_count)[0]?.dataset_id ?? null),
        selectedRunId: current.selectedRunId ?? runs[0]?.run_id ?? null,
        selectedBridgeArtifactId: current.selectedBridgeArtifactId ?? bridgeArtifacts[0]?.artifact_id ?? null,
        backendNotice: dependencyFailure && current.datasets.length === 0 && current.runs.length === 0
          ? describeUiError("Backend status", dependencyFailure.reason)
          : null,
      };
    });
  };

  useEffect(() => {
    void refreshCore();
  }, []);

  // Auto-run PineTS once a dataset is available (after refreshCore loads datasets).
  // Fires only once so the Pine chart shows indicators immediately on first load.
  const autoRunPineFired = useRef(false);
  useEffect(() => {
    if (
      !autoRunPineFired.current &&
      state.selectedDatasetId &&
      !pineExecution.lastRunAt &&
      !pineExecution.isRunning
    ) {
      autoRunPineFired.current = true;
      void handleRunPine();
    }
  }, [state.selectedDatasetId, pineExecution.lastRunAt, pineExecution.isRunning]);

  useEffect(() => {
    if (!currentRun || currentRun.lifecycle !== "live") {
      return;
    }
    const socket = connectRunStream(currentRun.run_id, (event) => {
      void getRun(event.run_id)
        .then((freshRun) => {
          setState((current) => ({
            ...current,
            runs: current.runs.map((run) => (run.run_id === freshRun.run_id ? freshRun : run)),
          }));
        })
        .catch((error) => {
          setState((current) => ({ ...current, backendNotice: describeUiError("Run stream refresh", error) }));
        });
    });
    return () => socket.close();
  }, [currentRun?.run_id, currentRun?.lifecycle]);

  const runTask = async (key: string, task: () => Promise<void>) => {
    setBusy((current) => ({ ...current, [key]: true }));
    try {
      await task();
    } catch (error) {
      setState((current) => ({ ...current, backendNotice: describeUiError(`Action ${key}`, error) }));
    } finally {
      setBusy((current) => ({ ...current, [key]: false }));
    }
  };

  const previewSource = async () => {
    await runTask("preview", async () => {
      const preview = await previewDataSource(state.dataSource);
      const inferred = preview.preview.inferred_mapping as DataSourceConfig["mapping"] | undefined;
      setState((current) => ({
        ...current,
        preview,
        dataSource: inferred ? { ...current.dataSource, mapping: inferred } : current.dataSource,
        backendNotice: null,
      }));
    });
  };

  const saveCurrentDataset = async () => {
    await runTask("saveDataset", async () => {
      const artifact = await saveDataset(state.dataSource);
      await refreshCore();
      setState((current) => ({ ...current, selectedDatasetId: artifact.dataset_id, backendNotice: null }));
      navigate("/workspace");
    });
  };

  const createRun = async (kind: "replay" | "live") => {
    await runTask(kind, async () => {
      const datasetId = state.selectedDatasetId ?? currentDataset?.dataset_id;
      if (!datasetId) {
        setState((current) => ({ ...current, backendNotice: "Save a dataset before running replay or live comparison." }));
        return;
      }
      const payload = {
        dataset_id: datasetId,
        run_config: state.runConfig,
        python_artifact: state.pythonArtifact,
        pine_artifact: state.pineArtifact,
        bridge_artifact_id: state.selectedBridgeArtifactId,
      };
      const run = kind === "replay" ? await createReplayRun(payload) : await createLiveRun(payload);
      setState((current) => ({ ...current, selectedRunId: run.run_id, backendNotice: null }));
      await refreshCore();
      navigate("/workspace");
    });
  };

  const submitBridgeArtifact = async () => {
    await runTask("bridge", async () => {
      const parsed = JSON.parse(state.bridgeJson) as { indicator_series: BridgeArtifact["indicator_series"]; trade_events: BridgeArtifact["trade_events"] };
      await createBridgeArtifact({
        name: `${state.runConfig.symbol} bridge artifact`,
        symbol: state.runConfig.symbol,
        timeframe: state.runConfig.timeframe,
        source_code: state.pineArtifact.source_code,
        indicator_series: parsed.indicator_series ?? [],
        trade_events: parsed.trade_events ?? [],
        notes: "Manual TradingView export artifact",
      });
      await refreshCore();
      setState((current) => ({ ...current, backendNotice: null }));
    });
  };

  const askLlm = async (prompt: string) => {
    setState((current) => ({ ...current, llmResponse: null }));
    await runTask("chat", async () => {
      const response = await chatWithOllama({
        model: preferredChatModel,
        intent: "analysis",
        messages: [{ role: "user", content: prompt }],
        include_targets: ["pine_code", "python_code", "run_artifacts"],
        run_id: currentRun?.run_id ?? null,
      });
      setState((current) => ({ ...current, llmResponse: response, backendNotice: null }));
    });
  };

  const togglePermission = async (grant: PermissionGrant) => {
    await runTask("permissions", async () => {
      await grantPermission({
        target: grant.target,
        access: grant.access,
        scope: grant.scope,
        approved: !grant.approved,
        ttl_minutes: 15,
        audit_note: grant.approved ? `Revoked ${grant.target} ${grant.access}` : `Approved ${grant.target} ${grant.access}`,
      });
      await refreshCore();
      setState((current) => ({ ...current, backendNotice: null }));
    });
  };

  const selectRun = (runId: string) => {
    setState((current) => ({ ...current, selectedRunId: runId }));
    navigate("/workspace");
  };

  const loadPineCandles = async () => {
    const datasetId = state.selectedDatasetId ?? currentDataset?.dataset_id;
    if (!datasetId) {
      setState((current) => ({ ...current, backendNotice: "Save a dataset first to run Pine Script." }));
      return [];
    }
    try {
      const candles = await getDatasetCandles(datasetId);
      setPineCandles(candles);
      return candles;
    } catch (error) {
      setState((current) => ({ ...current, backendNotice: describeUiError("Load candles", error) }));
      return [];
    }
  };

  const handleRunPine = async () => {
    let candles = pineCandles;
    if (candles.length === 0) {
      candles = await loadPineCandles();
    }
    if (candles.length === 0) return;

    await pineExecution.runPine(
      state.pineArtifact.source_code,
      candles,
      state.runConfig.warmup_bars,
    );
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Hybrid parity lab</p>
          <h1>Trading Strategy Comparator</h1>
        </div>
        <div className="status-pills">
          <span className="pill">{state.dependencies?.ollama.available ? "Ollama ready" : "Ollama optional"}</span>
          <span className="pill">{state.selectedDatasetId ? "Dataset linked" : "No dataset saved"}</span>
          <span className="pill accent">{state.runConfig.symbol} ? {state.runConfig.timeframe} ? {state.runConfig.mode}</span>
        </div>
      </header>

      <nav className="nav-tabs">
        <NavLink to="/imports">Imports</NavLink>
        <NavLink to="/workspace">Workspace</NavLink>
        <NavLink to="/runs">Runs</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>

      {state.backendNotice ? <div className="banner warning">{state.backendNotice}</div> : null}

      <Routes>
        <Route
          path="/imports"
          element={
            <ImportsPage
              dataSource={state.dataSource}
              preview={state.preview}
              datasets={state.datasets}
              busy={busy}
              onDataSourceChange={(dataSource) => setState((current) => ({ ...current, dataSource }))}
              onPreview={previewSource}
              onSave={saveCurrentDataset}
              onSelectDataset={(datasetId) => setState((current) => ({ ...current, selectedDatasetId: datasetId, backendNotice: null }))}
            />
          }
        />
        <Route
          path="/workspace"
          element={
            <WorkspacePage
              runConfig={state.runConfig}
              pineArtifact={state.pineArtifact}
              pythonArtifact={state.pythonArtifact}
              currentRun={currentRun}
              bridgeArtifacts={state.bridgeArtifacts}
              selectedBridgeArtifactId={state.selectedBridgeArtifactId}
              permissions={state.permissions}
              busy={busy}
              onRunConfigChange={(runConfig) => setState((current) => ({ ...current, runConfig }))}
              onPineArtifactChange={(pineArtifact) => setState((current) => ({ ...current, pineArtifact }))}
              onPythonArtifactChange={(pythonArtifact) => setState((current) => ({ ...current, pythonArtifact }))}
              onBridgeSelectionChange={(artifactId) => setState((current) => ({ ...current, selectedBridgeArtifactId: artifactId }))}
              onReplay={() => void createRun("replay")}
              onLive={() => void createRun("live")}
              onRefreshArtifacts={() => void refreshCore()}
              onTogglePermission={(grant) => void togglePermission(grant)}
              onAskLlm={(prompt) => void askLlm(prompt)}
              availableModels={state.availableModels}
              chatModel={preferredChatModel}
              onChatModelChange={(model) => setState((current) => ({ ...current, selectedChatModel: model }))}
              onRefreshModels={() => void refreshCore()}
              llmResponse={state.llmResponse}
              pineCandles={pineCandles}
              onRunPine={() => void handleRunPine()}
              pineExecutionState={{
                isRunning: pineExecution.isRunning,
                indicators: pineExecution.indicators,
                trades: pineExecution.trades,
                errors: pineExecution.errors,
                lastRunAt: pineExecution.lastRunAt,
              }}
            />
          }
        />
        <Route path="/runs" element={<RunsPage runs={state.runs} selectedRunId={state.selectedRunId} onSelectRun={selectRun} />} />
        <Route
          path="/settings"
          element={
            <SettingsPage
              dependencies={state.dependencies}
              bridgeArtifacts={state.bridgeArtifacts}
              bridgeJson={state.bridgeJson}
              availableModels={state.availableModels}
              selectedChatModel={preferredChatModel}
              busy={busy}
              onBridgeJsonChange={(bridgeJson) => setState((current) => ({ ...current, bridgeJson }))}
              onChatModelChange={(model) => setState((current) => ({ ...current, selectedChatModel: model }))}
              onRefreshModels={() => void refreshCore()}
              onSubmitBridge={() => void submitBridgeArtifact()}
              pineSource={state.pineArtifact.source_code}
            />
          }
        />
        <Route path="*" element={<Navigate to="/imports" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

