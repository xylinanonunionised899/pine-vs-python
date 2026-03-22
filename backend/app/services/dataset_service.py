from __future__ import annotations

from uuid import uuid4

from app.core.data_manager import DataManager
from app.models.contracts import DataSourceConfig, DataSourceType, DatasetArtifact, DatasetPreview
from app.services.storage import storage_service


class DatasetService:
    def __init__(self) -> None:
        self.data_manager = DataManager()
        self.storage = storage_service

    def preview(self, source: DataSourceConfig) -> DatasetPreview:
        preview = self.data_manager.preview_import(source)
        issues: list[str] = []
        if not preview.get("exists", True):
            issues.append("File does not exist.")
        if not source.file_path:
            issues.append("Local file path is required for file-based sources.")
        issues.extend(self._validate_source(source))
        return DatasetPreview(
            preview=preview,
            capabilities=self.data_manager.provider_capabilities(source.type),
            validation_issues=issues,
        )

    def save(self, source: DataSourceConfig) -> DatasetArtifact:
        preview = self.preview(source)
        if preview.validation_issues:
            raise ValueError("; ".join(preview.validation_issues))
        frame = self.data_manager.load_source_frame(source)
        mapping = source.mapping or self.data_manager.normalize_column_mapping(
            [str(column) for column in frame.columns.tolist()],
            import_preset=self.data_manager.get_import_preset(source),
        )
        normalized = self.data_manager.normalize_frame(frame, mapping, source.timezone)
        dataset_id = f"dataset-{uuid4().hex[:8]}"
        data_path = self.storage.datasets_dir / f"{dataset_id}.csv"
        normalized.to_csv(data_path, index=False)
        artifact = DatasetArtifact(
            dataset_id=dataset_id,
            name=source.name,
            source=source.model_copy(update={"mapping": mapping}),
            mapping=mapping,
            symbol=source.symbol,
            timeframe=source.timeframe,
            timezone=source.timezone,
            row_count=int(normalized.shape[0]),
            columns=list(normalized.columns),
            data_path=str(data_path),
        )
        self.storage.upsert_record(self.storage.datasets_index, "dataset_id", artifact.dataset_id, artifact.model_dump(mode="json"))
        return artifact

    def list_datasets(self) -> list[DatasetArtifact]:
        return [DatasetArtifact.model_validate(row) for row in self.storage.list_records(self.storage.datasets_index)]

    def get_dataset(self, dataset_id: str) -> DatasetArtifact:
        for artifact in self.list_datasets():
            if artifact.dataset_id == dataset_id:
                return artifact
        raise KeyError(f"Unknown dataset_id: {dataset_id}")

    def load_frame(self, dataset_id: str):
        artifact = self.get_dataset(dataset_id)
        import pandas as pd

        frame = pd.read_csv(artifact.data_path)
        frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)
        return frame

    def _validate_source(self, source: DataSourceConfig) -> list[str]:
        issues: list[str] = []
        import_preset = self.data_manager.get_import_preset(source)
        if import_preset == self.data_manager.TRADINGVIEW_VIX_PRESET:
            if source.type != DataSourceType.CSV:
                issues.append("TradingView VIX export preset requires CSV input.")
            if (source.symbol or "").strip() != "CBOE:VIX":
                issues.append("TradingView VIX export preset requires symbol CBOE:VIX.")
        return issues


dataset_service = DatasetService()