import type {
  BridgeArtifact,
  CandlePoint,
  ChatRequest,
  ChatResponse,
  DatasetArtifact,
  DatasetPreview,
  DataSourceConfig,
  DependencyStatus,
  IndicatorLibraryEntry,
  OllamaModelInfo,
  PermissionGrant,
  RunConfig,
  RunStatus,
  StrategyArtifact,
} from "@shared/contracts";

const API_ROOT = "http://127.0.0.1:8000";

function describeNetworkError(error: unknown): Error {
  if (error instanceof Error && error.name === "TypeError") {
    return new Error("Backend unavailable at http://127.0.0.1:8000. Start backend\\run-backend.ps1 and retry.");
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error("Unexpected API error.");
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = (await response.text()).trim();
    let message = text || `Request failed with ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      if (parsed.detail) {
        message = parsed.detail;
      }
    } catch {
      // Keep the raw text when the response body is not JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_ROOT}${path}`, init);
    return await readJson<T>(response);
  } catch (error) {
    throw describeNetworkError(error);
  }
}

export async function getDependencyStatus(): Promise<DependencyStatus> {
  return apiFetch<DependencyStatus>("/dependencies/status");
}

export async function previewDataSource(payload: DataSourceConfig): Promise<DatasetPreview> {
  return apiFetch<DatasetPreview>("/data-sources/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function saveDataset(payload: DataSourceConfig): Promise<DatasetArtifact> {
  return apiFetch<DatasetArtifact>("/data-sources/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function listDatasets(): Promise<DatasetArtifact[]> {
  return apiFetch<DatasetArtifact[]>("/data-sources");
}

export async function listRuns(): Promise<RunStatus[]> {
  return apiFetch<RunStatus[]>("/runs");
}

export async function getRun(runId: string): Promise<RunStatus> {
  return apiFetch<RunStatus>(`/runs/${runId}`);
}

export async function createReplayRun(payload: {
  dataset_id: string;
  run_config: RunConfig;
  python_artifact: StrategyArtifact;
  pine_artifact?: StrategyArtifact | null;
  bridge_artifact_id?: string | null;
}): Promise<RunStatus> {
  return apiFetch<RunStatus>("/runs/replay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function createLiveRun(payload: {
  dataset_id: string;
  run_config: RunConfig;
  python_artifact: StrategyArtifact;
  pine_artifact?: StrategyArtifact | null;
  bridge_artifact_id?: string | null;
}): Promise<RunStatus> {
  return apiFetch<RunStatus>("/runs/live", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function listBridgeArtifacts(): Promise<BridgeArtifact[]> {
  return apiFetch<BridgeArtifact[]>("/pine-bridge/artifacts");
}

export async function createBridgeArtifact(payload: Omit<BridgeArtifact, "artifact_id" | "created_at">): Promise<BridgeArtifact> {
  return apiFetch<BridgeArtifact>("/pine-bridge/artifacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function chatWithOllama(payload: ChatRequest): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function listOllamaModels(): Promise<OllamaModelInfo[]> {
  return apiFetch<OllamaModelInfo[]>("/chat/models");
}

export async function listPermissions(): Promise<PermissionGrant[]> {
  return apiFetch<PermissionGrant[]>("/permissions");
}

export async function grantPermission(payload: {
  target: PermissionGrant["target"];
  access: PermissionGrant["access"];
  scope: PermissionGrant["scope"];
  approved: boolean;
  ttl_minutes?: number;
  audit_note?: string;
}): Promise<PermissionGrant> {
  return apiFetch<PermissionGrant>("/permissions/grant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getDatasetCandles(datasetId: string): Promise<CandlePoint[]> {
  return apiFetch<CandlePoint[]>(`/data-sources/${datasetId}/candles`);
}

// ── Indicator Library ──────────────────────────────────

export async function listIndicators(): Promise<IndicatorLibraryEntry[]> {
  return apiFetch<IndicatorLibraryEntry[]>("/indicators");
}

export async function getIndicator(indicatorId: string): Promise<IndicatorLibraryEntry> {
  return apiFetch<IndicatorLibraryEntry>(`/indicators/${indicatorId}`);
}

export async function saveIndicator(payload: {
  name: string;
  description: string;
  category: string;
  pine_code: string;
  python_code: string;
  series_names: string[];
  is_builtin?: boolean;
}): Promise<IndicatorLibraryEntry> {
  return apiFetch<IndicatorLibraryEntry>("/indicators", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteIndicator(indicatorId: string): Promise<void> {
  await apiFetch<{ status: string }>(`/indicators/${indicatorId}`, { method: "DELETE" });
}
