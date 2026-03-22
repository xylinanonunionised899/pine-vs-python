from __future__ import annotations

from fastapi import APIRouter

from app.services.dependency_service import dependency_service

router = APIRouter(prefix="/dependencies", tags=["dependencies"])


@router.get("/status")
async def dependency_status():
    return await dependency_service.status()
