from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.contracts import BridgeArtifact, IndicatorSeries, TradeEvent
from app.services.bridge_service import bridge_service

router = APIRouter(prefix="/pine-bridge", tags=["pine-bridge"])


class BridgeCreateRequest(BaseModel):
    name: str
    symbol: str
    timeframe: str
    source_code: str | None = None
    indicator_series: list[IndicatorSeries] = []
    trade_events: list[TradeEvent] = []
    notes: str | None = None


@router.get("/artifacts")
def list_bridge_artifacts():
    return bridge_service.list_artifacts()


@router.post("/artifacts")
def create_bridge_artifact(payload: BridgeCreateRequest) -> BridgeArtifact:
    try:
        return bridge_service.create(
            name=payload.name,
            symbol=payload.symbol,
            timeframe=payload.timeframe,
            source_code=payload.source_code,
            indicator_series=payload.indicator_series,
            trade_events=payload.trade_events,
            notes=payload.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
