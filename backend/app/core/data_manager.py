from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from app.models.contracts import CandlePoint, ColumnMapping, DataSourceConfig, DataSourceType


class DataManager:
    TRADINGVIEW_VIX_PRESET = "tradingview_vix"
    _ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}

    @staticmethod
    def _validate_file_path(path: Path) -> None:
        if not path.exists():
            raise ValueError(f"File not found: {path}")
        if not path.is_file():
            raise ValueError(f"Path is not a regular file: {path}")
        ext = path.suffix.lower()
        if ext not in DataManager._ALLOWED_EXTENSIONS:
            raise ValueError(
                f"Unsupported file type '{ext}'. Allowed: .csv, .xlsx, .xls"
            )

    def preview_import(self, source: DataSourceConfig) -> dict[str, Any]:
        import_preset = self.get_import_preset(source)
        preview: dict[str, Any] = {
            "name": source.name,
            "type": source.type.value,
            "timeframe": source.timeframe,
            "timezone": source.timezone,
            "mapping": source.mapping.model_dump() if source.mapping else None,
            "import_preset": import_preset,
        }
        if import_preset == self.TRADINGVIEW_VIX_PRESET:
            preview["required_symbol"] = "CBOE:VIX"
            preview["preset_label"] = "TradingView VIX export"

        if not source.file_path:
            return preview

        file_path = Path(source.file_path)
        preview["file_path"] = str(file_path)
        try:
            self._validate_file_path(file_path)
        except ValueError as exc:
            preview["validation_error"] = str(exc)
            return preview

        if source.type == DataSourceType.EXCEL:
            preview.update(self._preview_excel(file_path))
        elif source.type == DataSourceType.CSV:
            preview.update(self._preview_csv(file_path, source))
        return preview

    def load_source_frame(self, source: DataSourceConfig) -> pd.DataFrame:
        if not source.file_path:
            raise ValueError("file_path is required for local sources")
        path = Path(source.file_path)
        self._validate_file_path(path)
        if source.type == DataSourceType.EXCEL:
            return pd.read_excel(path)
        if source.type == DataSourceType.CSV:
            return pd.read_csv(path)
        raise ValueError(f"Unsupported source type: {source.type}")

    def normalize_frame(self, frame: pd.DataFrame, mapping: ColumnMapping, timezone: str) -> pd.DataFrame:
        normalized = pd.DataFrame()
        timestamp_series = frame[mapping.timestamp]
        if pd.api.types.is_numeric_dtype(timestamp_series):
            normalized["timestamp"] = pd.to_datetime(timestamp_series, unit="s", utc=True)
        else:
            normalized["timestamp"] = pd.to_datetime(timestamp_series, utc=False)
            if normalized["timestamp"].dt.tz is None:
                normalized["timestamp"] = normalized["timestamp"].dt.tz_localize(timezone).dt.tz_convert("UTC")
            else:
                normalized["timestamp"] = normalized["timestamp"].dt.tz_convert("UTC")
        normalized["open"] = frame[mapping.open].astype(float)
        normalized["high"] = frame[mapping.high].astype(float)
        normalized["low"] = frame[mapping.low].astype(float)
        normalized["close"] = frame[mapping.close].astype(float)
        if mapping.volume and mapping.volume in frame.columns:
            normalized["volume"] = frame[mapping.volume].astype(float)
        else:
            normalized["volume"] = None
        normalized = normalized.sort_values("timestamp").reset_index(drop=True)
        return normalized

    def to_candles(self, frame: pd.DataFrame) -> list[CandlePoint]:
        candles: list[CandlePoint] = []
        for row in frame.to_dict(orient="records"):
            candles.append(
                CandlePoint(
                    timestamp=row["timestamp"].to_pydatetime() if hasattr(row["timestamp"], "to_pydatetime") else row["timestamp"],
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=float(row["volume"]) if row.get("volume") not in (None, "", float("nan")) else None,
                )
            )
        return candles

    def normalize_column_mapping(self, columns: list[str], import_preset: str | None = None) -> ColumnMapping:
        lowered = {str(column).lower(): str(column) for column in columns}

        def pick(*candidates: str, fallback_index: int) -> str:
            for candidate in candidates:
                if candidate.lower() in lowered:
                    return lowered[candidate.lower()]
            return columns[fallback_index]

        if import_preset == self.TRADINGVIEW_VIX_PRESET:
            volume = None
            for candidate in ("volume", "volume usd", "volume usdt", "vol", "v"):
                if candidate in lowered:
                    volume = lowered[candidate]
                    break
            return ColumnMapping(
                timestamp=pick("time", "datetime", "date", "timestamp", "t", fallback_index=0),
                open=pick("open", "o", fallback_index=min(1, len(columns) - 1)),
                high=pick("high", "h", fallback_index=min(2, len(columns) - 1)),
                low=pick("low", "l", fallback_index=min(3, len(columns) - 1)),
                close=pick("close", "c", fallback_index=min(4, len(columns) - 1)),
                volume=volume,
            )

        volume = None
        for candidate in ("volume", "vol", "v"):
            if candidate in lowered:
                volume = lowered[candidate]
                break

        return ColumnMapping(
            timestamp=pick("datetime", "date", "dt", "timestamp", "time", "t", fallback_index=0),
            open=pick("open", "o", fallback_index=min(1, len(columns) - 1)),
            high=pick("high", "h", fallback_index=min(2, len(columns) - 1)),
            low=pick("low", "l", fallback_index=min(3, len(columns) - 1)),
            close=pick("close", "c", fallback_index=min(4, len(columns) - 1)),
            volume=volume,
        )

    def provider_capabilities(self, source_type: DataSourceType) -> dict[str, Any]:
        return {
            "supports_file_upload": source_type in {DataSourceType.CSV, DataSourceType.EXCEL},
            "supports_symbol_fetch": source_type == DataSourceType.POLYGON,
            "supports_local_replay": True,
            "supports_live_append": True,
            "supports_tradingview_export_preset": source_type == DataSourceType.CSV,
        }

    def _preview_excel(self, file_path: Path) -> dict[str, Any]:
        workbook = pd.ExcelFile(file_path)
        sheet_name = workbook.sheet_names[0]
        frame = workbook.parse(sheet_name=sheet_name)
        columns = [str(column) for column in frame.columns.tolist()]
        mapping = self.normalize_column_mapping(columns)
        sample_rows = frame.head(5).fillna("").to_dict(orient="records")
        return {
            "format": "excel",
            "sheet_names": workbook.sheet_names,
            "active_sheet": sheet_name,
            "row_count": int(frame.shape[0]),
            "columns": columns,
            "inferred_mapping": mapping.model_dump(),
            "sample_rows": sample_rows,
        }

    def _preview_csv(self, file_path: Path, source: DataSourceConfig) -> dict[str, Any]:
        frame = pd.read_csv(file_path)
        columns = [str(column) for column in frame.columns.tolist()]
        mapping = self.normalize_column_mapping(columns, import_preset=self.get_import_preset(source))
        sample_rows = frame.head(5).fillna("").to_dict(orient="records")
        return {
            "format": "csv",
            "row_count": int(frame.shape[0]),
            "columns": columns,
            "inferred_mapping": mapping.model_dump(),
            "sample_rows": sample_rows,
        }

    @staticmethod
    def get_import_preset(source: DataSourceConfig) -> str | None:
        preset = source.extra.get("import_preset")
        return str(preset) if preset else None