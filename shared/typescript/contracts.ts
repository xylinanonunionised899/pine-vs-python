export type DataSourceType = "csv" | "excel" | "polygon" | "manual";
export type RunMode = "local_compare" | "pine_bridge";
export type StrategyLanguage = "pine" | "python";
export type AccessLevel = "read" | "write";
export type PermissionScope = "single_action" | "session";
export type PermissionTarget = "pine_code" | "python_code" | "run_artifacts";
export type DiffClassification =
  | "data_alignment"
  | "warmup_window"
  | "timeframe_aggregation"
  | "pine_only_function_gap"
  | "python_implementation"
  | "numeric_tolerance";
export type RunLifecycle = "draft" | "running" | "live" | "completed" | "failed";

export interface ColumnMapping {
  timestamp: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string | null;
}

export interface SessionConfig {
  timezone: string;
  market_calendar?: string | null;
  session_start?: string | null;
  session_end?: string | null;
}

export interface DataSourceConfig {
  type: DataSourceType;
  name: string;
  file_path?: string | null;
  provider?: string | null;
  symbol?: string | null;
  timeframe: string;
  timezone: string;
  mapping?: ColumnMapping | null;
  session: SessionConfig;
  extra: Record<string, unknown>;
}

export interface StrategyPermission {
  read_allowed: boolean;
  write_allowed: boolean;
}

export interface StrategyArtifact {
  language: StrategyLanguage;
  source_code: string;
  name: string;
  declared_outputs: string[];
  permissions: StrategyPermission;
  adapter_metadata: Record<string, unknown>;
}

export interface RunConfig {
  mode: RunMode;
  symbol: string;
  timeframe: string;
  date_from?: string | null;
  date_to?: string | null;
  one_open_position: boolean;
  tolerance: number;
  warmup_bars: number;
  selected_outputs: string[];
  timezone: string;
  companion_dataset_ids: Record<string, string>;
}

export interface CandlePoint {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

export interface IndicatorPoint {
  timestamp: string;
  value?: number | null;
}

export interface IndicatorSeries {
  name: string;
  pane: string;
  style: Record<string, unknown>;
  warmup_bars: number;
  values: IndicatorPoint[];
}

export interface TradeEvent {
  timestamp: string;
  side: "long_entry" | "long_exit" | "short_entry" | "short_exit";
  price: number;
  qty: number;
  reason: string;
  source_engine: StrategyLanguage;
}

export interface MismatchDetail {
  classification: DiffClassification;
  series_name: string;
  timestamp: string;
  expected?: number | null;
  actual?: number | null;
  delta?: number | null;
  message: string;
  suspected_region?: string | null;
}

export interface ComparisonSummary {
  aligned: boolean;
  total_series: number;
  mismatched_series: number;
  total_trade_events: number;
  mismatched_trade_events: number;
}

export interface ComparisonResult {
  summary: ComparisonSummary;
  series_mismatches: MismatchDetail[];
  trade_mismatches: MismatchDetail[];
  first_mismatch?: MismatchDetail | null;
  unsupported_feature_warnings: string[];
  suggested_next_action?: string | null;
  run_mode?: RunMode | null;
  dataset_id?: string | null;
  live: boolean;
  artifact_refs: string[];
}

export interface DatasetArtifact {
  dataset_id: string;
  name: string;
  source: DataSourceConfig;
  mapping: ColumnMapping;
  symbol?: string | null;
  timeframe: string;
  timezone: string;
  row_count: number;
  columns: string[];
  data_path: string;
  created_at: string;
}

export interface DatasetPreview {
  preview: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  validation_issues: string[];
}

export interface BridgeArtifact {
  artifact_id: string;
  name: string;
  symbol: string;
  timeframe: string;
  source_code?: string | null;
  indicator_series: IndicatorSeries[];
  trade_events: TradeEvent[];
  notes?: string | null;
  created_at: string;
}

export interface DependencyStatusItem {
  name: string;
  available: boolean;
  detail: string;
}

export interface DependencyStatus {
  backend: DependencyStatusItem;
  ollama: DependencyStatusItem;
  tradingview_bridge: DependencyStatusItem;
  market_provider: DependencyStatusItem;
}

export interface RunStatus {
  run_id: string;
  lifecycle: RunLifecycle;
  mode: RunMode;
  symbol: string;
  timeframe: string;
  dataset_id?: string | null;
  dataset_name?: string | null;
  companion_dataset_ids: Record<string, string>;
  bridge_artifact_id?: string | null;
  python_artifact: StrategyArtifact;
  pine_artifact?: StrategyArtifact | null;
  candles: CandlePoint[];
  python_series: IndicatorSeries[];
  pine_series: IndicatorSeries[];
  trade_events: TradeEvent[];
  comparison?: ComparisonResult | null;
  warnings: string[];
  live_progress: number;
  live_total: number;
  created_at: string;
  updated_at: string;
}

export interface LiveBarEvent {
  run_id: string;
  lifecycle: RunLifecycle;
  current_index: number;
  total: number;
  latest_candle?: CandlePoint | null;
  comparison?: ComparisonResult | null;
  updated_at: string;
}

export interface PermissionGrant {
  target: PermissionTarget;
  access: AccessLevel;
  scope: PermissionScope;
  approved: boolean;
  expires_at?: string | null;
  audit_note?: string | null;
  is_active?: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  created_at?: string;
}

export type ChatStatus = "ok" | "fallback" | "error";
export type ChatErrorClass =
  | "ollama_unreachable"
  | "model_missing"
  | "timeout"
  | "cleaned_response_empty"
  | "permission_required";

export interface ChatRequest {
  model: string;
  intent: "analysis" | "explain_diff" | "propose_fix" | "apply_fix";
  messages: ChatMessage[];
  include_targets: PermissionTarget[];
  run_id?: string | null;
}

export interface ChatResponse {
  model: string;
  content: string;
  requires_approval: boolean;
  proposed_patch?: string | null;
  status: ChatStatus;
  error_class?: ChatErrorClass | null;
  fallback_used: boolean;
}

export interface OllamaModelInfo {
  name: string;
  model: string;
  size?: number | null;
  modified_at?: string | null;
  chat_capable: boolean;
}

export type IndicatorCategory = "trend" | "momentum" | "volatility" | "volume" | "custom";

export interface IndicatorLibraryEntry {
  indicator_id: string;
  name: string;
  description: string;
  category: IndicatorCategory;
  pine_code: string;
  python_code: string;
  series_names: string[];
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}
