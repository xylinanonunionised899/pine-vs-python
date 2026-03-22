from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, computed_field


class DataSourceType(str, Enum):
    CSV = "csv"
    EXCEL = "excel"
    POLYGON = "polygon"
    MANUAL = "manual"


class RunMode(str, Enum):
    LOCAL_COMPARE = "local_compare"
    PINE_BRIDGE = "pine_bridge"


class StrategyLanguage(str, Enum):
    PINE = "pine"
    PYTHON = "python"


class AccessLevel(str, Enum):
    READ = "read"
    WRITE = "write"


class PermissionScope(str, Enum):
    SINGLE_ACTION = "single_action"
    SESSION = "session"


class PermissionTarget(str, Enum):
    PINE_CODE = "pine_code"
    PYTHON_CODE = "python_code"
    RUN_ARTIFACTS = "run_artifacts"


class DiffClassification(str, Enum):
    DATA_ALIGNMENT = "data_alignment"
    WARMUP_WINDOW = "warmup_window"
    TIMEFRAME_AGGREGATION = "timeframe_aggregation"
    PINE_ONLY_FUNCTION_GAP = "pine_only_function_gap"
    PYTHON_IMPLEMENTATION = "python_implementation"
    NUMERIC_TOLERANCE = "numeric_tolerance"


class RunLifecycle(str, Enum):
    DRAFT = "draft"
    RUNNING = "running"
    LIVE = "live"
    COMPLETED = "completed"
    FAILED = "failed"


class ColumnMapping(BaseModel):
    timestamp: str
    open: str
    high: str
    low: str
    close: str
    volume: str | None = None


class SessionConfig(BaseModel):
    timezone: str = "Asia/Calcutta"
    market_calendar: str | None = None
    session_start: str | None = None
    session_end: str | None = None


class DataSourceConfig(BaseModel):
    type: DataSourceType
    name: str
    file_path: str | None = None
    provider: str | None = None
    symbol: str | None = None
    timeframe: str = "1D"
    timezone: str = "Asia/Calcutta"
    mapping: ColumnMapping | None = None
    session: SessionConfig = Field(default_factory=SessionConfig)
    extra: dict[str, Any] = Field(default_factory=dict)


class StrategyPermission(BaseModel):
    read_allowed: bool = True
    write_allowed: bool = False


class StrategyArtifact(BaseModel):
    language: StrategyLanguage
    source_code: str
    name: str
    declared_outputs: list[str] = Field(default_factory=list)
    permissions: StrategyPermission = Field(default_factory=StrategyPermission)
    adapter_metadata: dict[str, Any] = Field(default_factory=dict)


class RunConfig(BaseModel):
    mode: RunMode
    symbol: str
    timeframe: str
    date_from: datetime | None = None
    date_to: datetime | None = None
    one_open_position: bool = True
    tolerance: float = 1e-6
    warmup_bars: int = 100
    selected_outputs: list[str] = Field(default_factory=list)
    timezone: str = "Asia/Calcutta"
    companion_dataset_ids: dict[str, str] = Field(default_factory=dict)


class CandlePoint(BaseModel):
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None


class IndicatorPoint(BaseModel):
    timestamp: datetime
    value: float | None = None


class IndicatorSeries(BaseModel):
    name: str
    pane: str = "main"
    style: dict[str, Any] = Field(default_factory=dict)
    warmup_bars: int = 0
    values: list[IndicatorPoint] = Field(default_factory=list)


class TradeEvent(BaseModel):
    timestamp: datetime
    side: Literal["long_entry", "long_exit", "short_entry", "short_exit"]
    price: float
    qty: float
    reason: str
    source_engine: StrategyLanguage


class MismatchDetail(BaseModel):
    classification: DiffClassification
    series_name: str
    timestamp: datetime
    expected: float | None
    actual: float | None
    delta: float | None
    message: str
    suspected_region: str | None = None


class ComparisonSummary(BaseModel):
    aligned: bool
    total_series: int
    mismatched_series: int
    total_trade_events: int
    mismatched_trade_events: int


class ComparisonResult(BaseModel):
    summary: ComparisonSummary
    series_mismatches: list[MismatchDetail] = Field(default_factory=list)
    trade_mismatches: list[MismatchDetail] = Field(default_factory=list)
    first_mismatch: MismatchDetail | None = None
    unsupported_feature_warnings: list[str] = Field(default_factory=list)
    suggested_next_action: str | None = None
    run_mode: RunMode | None = None
    dataset_id: str | None = None
    live: bool = False
    artifact_refs: list[str] = Field(default_factory=list)


class DatasetArtifact(BaseModel):
    dataset_id: str
    name: str
    source: DataSourceConfig
    mapping: ColumnMapping
    symbol: str | None = None
    timeframe: str
    timezone: str
    row_count: int
    columns: list[str] = Field(default_factory=list)
    data_path: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class DatasetPreview(BaseModel):
    preview: dict[str, Any]
    capabilities: dict[str, Any]
    validation_issues: list[str] = Field(default_factory=list)


class BridgeArtifact(BaseModel):
    artifact_id: str
    name: str
    symbol: str
    timeframe: str
    source_code: str | None = None
    indicator_series: list[IndicatorSeries] = Field(default_factory=list)
    trade_events: list[TradeEvent] = Field(default_factory=list)
    notes: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class DependencyStatusItem(BaseModel):
    name: str
    available: bool
    detail: str


class DependencyStatus(BaseModel):
    backend: DependencyStatusItem
    ollama: DependencyStatusItem
    tradingview_bridge: DependencyStatusItem
    market_provider: DependencyStatusItem


class RunStatus(BaseModel):
    run_id: str
    lifecycle: RunLifecycle
    mode: RunMode
    symbol: str
    timeframe: str
    dataset_id: str | None = None
    dataset_name: str | None = None
    companion_dataset_ids: dict[str, str] = Field(default_factory=dict)
    bridge_artifact_id: str | None = None
    python_artifact: StrategyArtifact
    pine_artifact: StrategyArtifact | None = None
    candles: list[CandlePoint] = Field(default_factory=list)
    python_series: list[IndicatorSeries] = Field(default_factory=list)
    pine_series: list[IndicatorSeries] = Field(default_factory=list)
    trade_events: list[TradeEvent] = Field(default_factory=list)
    comparison: ComparisonResult | None = None
    warnings: list[str] = Field(default_factory=list)
    live_progress: int = 0
    live_total: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class LiveBarEvent(BaseModel):
    run_id: str
    lifecycle: RunLifecycle
    current_index: int
    total: int
    latest_candle: CandlePoint | None = None
    comparison: ComparisonResult | None = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PermissionGrant(BaseModel):
    target: PermissionTarget
    access: AccessLevel
    scope: PermissionScope
    approved: bool
    expires_at: datetime | None = None
    audit_note: str | None = None

    @computed_field
    @property
    def is_active(self) -> bool:
        if not self.approved:
            return False
        if self.expires_at is None:
            return True
        return self.expires_at >= datetime.now(UTC)


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ChatStatus(str, Enum):
    OK = "ok"
    FALLBACK = "fallback"
    ERROR = "error"


class ChatErrorClass(str, Enum):
    OLLAMA_UNREACHABLE = "ollama_unreachable"
    MODEL_MISSING = "model_missing"
    TIMEOUT = "timeout"
    CLEANED_RESPONSE_EMPTY = "cleaned_response_empty"
    PERMISSION_REQUIRED = "permission_required"


class ChatRequest(BaseModel):
    model: str
    intent: Literal["analysis", "explain_diff", "propose_fix", "apply_fix"]
    messages: list[ChatMessage]
    include_targets: list[PermissionTarget] = Field(default_factory=list)
    run_id: str | None = None


class ChatResponse(BaseModel):
    model: str
    content: str
    requires_approval: bool = False
    proposed_patch: str | None = None
    status: ChatStatus = ChatStatus.OK
    error_class: ChatErrorClass | None = None
    fallback_used: bool = False


class OllamaModelInfo(BaseModel):
    name: str
    model: str
    size: int | None = None
    modified_at: datetime | None = None
    chat_capable: bool = True


class IndicatorCategory(str, Enum):
    TREND = "trend"
    MOMENTUM = "momentum"
    VOLATILITY = "volatility"
    VOLUME = "volume"
    CUSTOM = "custom"


class IndicatorLibraryEntry(BaseModel):
    indicator_id: str
    name: str
    description: str = ""
    category: IndicatorCategory = IndicatorCategory.CUSTOM
    pine_code: str
    python_code: str
    series_names: list[str] = Field(default_factory=list)
    is_builtin: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
