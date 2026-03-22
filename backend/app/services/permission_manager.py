from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from app.models.contracts import AccessLevel, PermissionGrant, PermissionScope, PermissionTarget
from app.services.storage import storage_service


class PermissionManager:
    def __init__(self) -> None:
        self.storage = storage_service

    def grant(
        self,
        target: PermissionTarget,
        access: AccessLevel,
        scope: PermissionScope,
        approved: bool,
        ttl_minutes: int | None = None,
        audit_note: str | None = None,
    ) -> PermissionGrant:
        expires_at = None
        if approved and ttl_minutes:
            expires_at = datetime.now(UTC) + timedelta(minutes=ttl_minutes)
        grant = PermissionGrant(target=target, access=access, scope=scope, approved=approved, expires_at=expires_at, audit_note=audit_note)
        rows = [PermissionGrant.model_validate(row) for row in self.storage.list_records(self.storage.permissions_file)]
        rows.append(grant)
        self.storage.write_json(self.storage.permissions_file, [row.model_dump(mode="json") for row in rows])
        return grant

    def is_allowed(self, target: PermissionTarget, access: AccessLevel) -> bool:
        return any(
            grant.target == target and grant.access == access and grant.approved and grant.is_active
            for grant in self.list_grants()
        )

    def list_grants(self) -> list[PermissionGrant]:
        return [PermissionGrant.model_validate(row) for row in self.storage.list_records(self.storage.permissions_file)]


permission_manager = PermissionManager()
