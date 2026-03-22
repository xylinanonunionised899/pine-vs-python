from __future__ import annotations

import json
from uuid import uuid4

from app.models.contracts import BridgeArtifact, IndicatorSeries, TradeEvent
from app.services.storage import storage_service


class BridgeService:
    def __init__(self) -> None:
        self.storage = storage_service

    def save(self, payload: BridgeArtifact) -> BridgeArtifact:
        artifact = payload.model_copy(update={"artifact_id": payload.artifact_id or f"bridge-{uuid4().hex[:8]}"})
        path = self.storage.bridge_dir / f"{artifact.artifact_id}.json"
        path.write_text(json.dumps(artifact.model_dump(mode="json"), indent=2), encoding="utf-8")
        self.storage.upsert_record(self.storage.bridge_index, "artifact_id", artifact.artifact_id, artifact.model_dump(mode="json"))
        return artifact

    def create(
        self,
        name: str,
        symbol: str,
        timeframe: str,
        source_code: str | None,
        indicator_series: list[IndicatorSeries],
        trade_events: list[TradeEvent],
        notes: str | None = None,
    ) -> BridgeArtifact:
        artifact = BridgeArtifact(
            artifact_id=f"bridge-{uuid4().hex[:8]}",
            name=name,
            symbol=symbol,
            timeframe=timeframe,
            source_code=source_code,
            indicator_series=indicator_series,
            trade_events=trade_events,
            notes=notes,
        )
        return self.save(artifact)

    def list_artifacts(self) -> list[BridgeArtifact]:
        return [BridgeArtifact.model_validate(row) for row in self.storage.list_records(self.storage.bridge_index)]

    def get(self, artifact_id: str) -> BridgeArtifact:
        for artifact in self.list_artifacts():
            if artifact.artifact_id == artifact_id:
                return artifact
        raise KeyError(f"Unknown bridge artifact: {artifact_id}")


bridge_service = BridgeService()
