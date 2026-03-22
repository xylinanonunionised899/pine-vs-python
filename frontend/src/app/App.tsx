import type {
  BridgeArtifact,
  CandlePoint,
  ChatResponse,
  DatasetArtifact,
  DatasetPreview,
  DataSourceConfig,
  DependencyStatus,
  IndicatorCategory,
  IndicatorLibraryEntry,
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
import { AlignmentPage } from "@/pages/AlignmentPage";
import { ImportsPage } from "@/pages/ImportsPage";
import { IndicatorLibraryPage } from "@/pages/IndicatorLibraryPage";
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
  listIndicators,
  listRuns,
  previewDataSource,
  saveDataset,
  saveIndicator,
  deleteIndicator,
} from "@/services/api";
import { connectRunStream } from "@/services/websocket";

type AppState = {
  dependencies: DependencyStatus | null;
  datasets: DatasetArtifact[];
  runs: RunStatus[];
  permissions: PermissionGrant[];
  bridgeArtifacts: BridgeArtifact[];
  indicators: IndicatorLibraryEntry[];
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

function pickInitialDatasetId(datasets: DatasetArtifact[], currentSelection: string | null): string | null {
  if (currentSelection && datasets.some((dataset) => dataset.dataset_id === currentSelection)) {
    return currentSelection;
  }
  return datasets.find((dataset) => dataset.dataset_id === "dataset-demo-5m")?.dataset_id
    ?? [...datasets].sort((a, b) => b.row_count - a.row_count)[0]?.dataset_id
    ?? null;
}

function pickInitialRunId(runs: RunStatus[], currentSelection: string | null): string | null {
  if (currentSelection && runs.some((run) => run.run_id === currentSelection)) {
    return currentSelection;
  }
  return runs.find((run) => run.run_id === "run-demo-ema")?.run_id
    ?? runs[0]?.run_id
    ?? null;
}

function AppRoutes() {
  const navigate = useNavigate();
  const [state, setState] = useState<AppState>({
    dependencies: null,
    datasets: [],
    runs: [],
    permissions: [],
    bridgeArtifacts: [],
    indicators: [],
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

  const attachCompanionDataset = (dataset: DatasetArtifact) => {
    const alias = dataset.symbol?.trim() || dataset.name.trim() || dataset.dataset_id;
    setState((current) => {
      if (dataset.dataset_id === current.selectedDatasetId) {
        return {
          ...current,
          backendNotice: "Primary dataset is already available to the run. Attach a different dataset as a companion series.",
        };
      }
      return {
        ...current,
        runConfig: {
          ...current.runConfig,
          companion_dataset_ids: {
            ...current.runConfig.companion_dataset_ids,
            [alias]: dataset.dataset_id,
          },
        },
        backendNotice: null,
      };
    });
  };

  const detachCompanionDataset = (alias: string) => {
    setState((current) => {
      const nextCompanions = { ...current.runConfig.companion_dataset_ids };
      delete nextCompanions[alias];
      return {
        ...current,
        runConfig: {
          ...current.runConfig,
          companion_dataset_ids: nextCompanions,
        },
        backendNotice: null,
      };
    });
  };

  const refreshCore = async () => {
    const results = await Promise.allSettled([
      getDependencyStatus(),
      listDatasets(),
      listRuns(),
      listPermissions(),
      listBridgeArtifacts(),
      listOllamaModels(),
      listIndicators(),
    ]);

    const [dependenciesResult, datasetsResult, runsResult, permissionsResult, bridgeResult, modelsResult, indicatorsResult] = results;
    const dependencyFailure = results.find((result) => result.status === "rejected");

    setState((current) => {
      const datasets = datasetsResult.status === "fulfilled" ? datasetsResult.value : current.datasets;
      const runs = runsResult.status === "fulfilled" ? runsResult.value : current.runs;
      const permissions = permissionsResult.status === "fulfilled" ? permissionsResult.value : current.permissions;
      const bridgeArtifacts = bridgeResult.status === "fulfilled" ? bridgeResult.value : current.bridgeArtifacts;
      const indicators = indicatorsResult.status === "fulfilled" ? indicatorsResult.value : current.indicators;
      const availableModels = modelsResult.status === "fulfilled" ? modelsResult.value : current.availableModels;
      const selectedChatModel = pickDefaultChatModel(availableModels, current.selectedChatModel);

      return {
        ...current,
        dependencies: dependenciesResult.status === "fulfilled" ? dependenciesResult.value : current.dependencies,
        datasets,
        runs,
        permissions,
        bridgeArtifacts,
        indicators,
        availableModels,
        selectedChatModel,
        selectedDatasetId: pickInitialDatasetId(datasets, current.selectedDatasetId),
        selectedRunId: pickInitialRunId(runs, current.selectedRunId),
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
      // Immediately inject the returned run so the chart updates without waiting for refreshCore
      setState((current) => ({
        ...current,
        selectedRunId: run.run_id,
        runs: [run, ...current.runs.filter((r) => r.run_id !== run.run_id)],
        backendNotice: null,
      }));
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

  const handleSaveToLibrary = async (name: string, description: string, category: IndicatorCategory) => {
    await runTask("saveLibrary", async () => {
      // Derive series names: runtime Pine → runtime Python run → declared outputs fallback.
      const pineNames = pineExecution.indicators.map((s) => s.name);
      const pythonNames = (currentRun?.python_series ?? []).map((s) => s.name);
      const declaredNames = [
        ...(state.pineArtifact.declared_outputs ?? []),
        ...(state.pythonArtifact.declared_outputs ?? []),
      ];
      const seriesNames = [...new Set([...pineNames, ...pythonNames, ...declaredNames].filter(Boolean))];

      await saveIndicator({
        name,
        description,
        category,
        pine_code: state.pineArtifact.source_code,
        python_code: state.pythonArtifact.source_code,
        series_names: seriesNames,
        is_builtin: false,
      });
      await refreshCore();
      setState((current) => ({ ...current, backendNotice: null }));
    });
  };

  const handleLoadIndicator = (entry: IndicatorLibraryEntry) => {
    setState((current) => ({
      ...current,
      pineArtifact: { ...current.pineArtifact, source_code: entry.pine_code, name: entry.name },
      pythonArtifact: { ...current.pythonArtifact, source_code: entry.python_code, name: entry.name },
    }));
    navigate("/workspace");
  };

  const handleDeleteIndicator = async (indicatorId: string) => {
    await runTask("deleteIndicator", async () => {
      await deleteIndicator(indicatorId);
      await refreshCore();
    });
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
          <span className="pill">{Object.keys(state.runConfig.companion_dataset_ids).length > 0 ? `${Object.keys(state.runConfig.companion_dataset_ids).length} companion series` : "No companion series"}</span>
          <span className="pill accent">{state.runConfig.symbol} ? {state.runConfig.timeframe} ? {state.runConfig.mode}</span>
        </div>
      </header>

      <nav className="nav-tabs">
        <NavLink to="/imports">Imports</NavLink>
        <NavLink to="/workspace">Workspace</NavLink>
        <NavLink to="/runs">Runs</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <NavLink to="/alignment">Alignment</NavLink>
        <NavLink to="/library">Library</NavLink>
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
              selectedDatasetId={state.selectedDatasetId}
              companionDatasetIds={state.runConfig.companion_dataset_ids}
              busy={busy}
              onDataSourceChange={(dataSource) => setState((current) => ({ ...current, dataSource }))}
              onPreview={previewSource}
              onSave={saveCurrentDataset}
              onSelectDataset={(datasetId) => setState((current) => ({ ...current, selectedDatasetId: datasetId, backendNotice: null }))}
              onAttachCompanion={attachCompanionDataset}
              onDetachCompanion={detachCompanionDataset}
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
              isDemoDataset={currentDataset?.source?.extra?.seeded_demo === true}
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
              companionDatasetIds={state.runConfig.companion_dataset_ids}
              pineExecutionState={{
                isRunning: pineExecution.isRunning,
                indicators: pineExecution.indicators,
                trades: pineExecution.trades,
                errors: pineExecution.errors,
                lastRunAt: pineExecution.lastRunAt,
              }}
              onSaveToLibrary={(name, desc, cat) => void handleSaveToLibrary(name, desc, cat)}
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
              runConfig={state.runConfig}
            />
          }
        />
        <Route
          path="/alignment"
          element={
            <AlignmentPage
              currentRun={currentRun}
              pineCandles={pineCandles}
              pineExecutionState={{
                isRunning: pineExecution.isRunning,
                indicators: pineExecution.indicators,
                trades: pineExecution.trades,
                errors: pineExecution.errors,
                lastRunAt: pineExecution.lastRunAt,
              }}
              runs={state.runs}
              selectedRunId={state.selectedRunId}
              onSelectRun={(runId) => setState((current) => ({ ...current, selectedRunId: runId }))}
              pineArtifact={state.pineArtifact}
              pythonArtifact={state.pythonArtifact}
            />
          }
        />
        <Route
          path="/library"
          element={
            <IndicatorLibraryPage
              indicators={state.indicators}
              onLoadToWorkspace={handleLoadIndicator}
              onDelete={(id) => void handleDeleteIndicator(id)}
              onRefresh={() => void refreshCore()}
            />
          }
        />
        <Route path="*" element={<Navigate to="/workspace" replace />} />
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
