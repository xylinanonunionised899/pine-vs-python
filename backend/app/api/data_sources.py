from __future__ import annotations

import pandas as pd
from fastapi import APIRouter, HTTPException

from app.models.contracts import DataSourceConfig
from app.services.dataset_service import dataset_service

router = APIRouter(prefix="/data-sources", tags=["data-sources"])


@router.post("/preview")
def preview_data_source(source: DataSourceConfig):
    try:
        return dataset_service.preview(source)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/save")
def save_data_source(source: DataSourceConfig):
    try:
        return dataset_service.save(source)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def list_data_sources():
    return dataset_service.list_datasets()


@router.get("/{dataset_id}/candles")
def get_dataset_candles(dataset_id: str):
    try:
        frame = dataset_service.load_frame(dataset_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    candles = []
    for _, row in frame.iterrows():
        candles.append(
            {
                "timestamp": row["timestamp"].isoformat(),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row["volume"])
                if "volume" in row and not pd.isna(row["volume"])
                else 0,
            }
        )
    return candles
