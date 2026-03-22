from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.models.contracts import AccessLevel, PermissionScope, PermissionTarget
from app.services.permission_manager import permission_manager

router = APIRouter(prefix="/permissions", tags=["permissions"])


class GrantRequest(BaseModel):
    target: PermissionTarget
    access: AccessLevel
    scope: PermissionScope
    approved: bool
    ttl_minutes: int | None = 15
    audit_note: str | None = None


@router.get("")
def list_permissions():
    return permission_manager.list_grants()


@router.post("/grant")
def grant_permission(payload: GrantRequest):
    return permission_manager.grant(
        target=payload.target,
        access=payload.access,
        scope=payload.scope,
        approved=payload.approved,
        ttl_minutes=payload.ttl_minutes,
        audit_note=payload.audit_note,
    )
