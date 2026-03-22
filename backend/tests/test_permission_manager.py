from __future__ import annotations

from app.models.contracts import AccessLevel, PermissionScope, PermissionTarget
from app.services.permission_manager import PermissionManager


def test_write_requires_explicit_write_grant() -> None:
    manager = PermissionManager()
    manager.grant(
        target=PermissionTarget.PINE_CODE,
        access=AccessLevel.READ,
        scope=PermissionScope.SESSION,
        approved=True,
    )

    assert manager.is_allowed(PermissionTarget.PINE_CODE, AccessLevel.READ) is True
    assert manager.is_allowed(PermissionTarget.PINE_CODE, AccessLevel.WRITE) is False


def test_write_allowed_after_write_grant() -> None:
    manager = PermissionManager()
    manager.grant(
        target=PermissionTarget.PYTHON_CODE,
        access=AccessLevel.WRITE,
        scope=PermissionScope.SINGLE_ACTION,
        approved=True,
        ttl_minutes=5,
    )

    assert manager.is_allowed(PermissionTarget.PYTHON_CODE, AccessLevel.WRITE) is True
