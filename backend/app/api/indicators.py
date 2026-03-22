from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.services.indicator_service import indicator_service

router = APIRouter(prefix="/indicators", tags=["indicators"])


@router.get("")
def list_indicators() -> list[dict[str, Any]]:
    return indicator_service.list_indicators()


@router.get("/{indicator_id}")
def get_indicator(indicator_id: str) -> dict[str, Any]:
    entry = indicator_service.get(indicator_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Indicator {indicator_id} not found")
    return entry


@router.post("")
def save_indicator(payload: dict[str, Any]) -> dict[str, Any]:
    if not payload.get("name"):
        raise HTTPException(status_code=400, detail="Indicator name is required")
    if not payload.get("pine_code") and not payload.get("python_code"):
        raise HTTPException(status_code=400, detail="At least one of pine_code or python_code is required")
    return indicator_service.save(payload)


@router.delete("/{indicator_id}")
def delete_indicator(indicator_id: str) -> dict[str, str]:
    success = indicator_service.delete(indicator_id)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot delete: indicator not found or is a built-in")
    return {"status": "deleted", "indicator_id": indicator_id}
