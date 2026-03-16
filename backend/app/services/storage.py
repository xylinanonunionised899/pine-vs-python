from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from typing import Any

from app.core.settings import settings


class StorageService:
    def __init__(self) -> None:
        self.datasets_dir = settings.cache_root / "datasets"
        self.runs_dir = settings.artifact_root / "runs"
        self.bridge_dir = settings.artifact_root / "bridge"
        self.permissions_file = settings.artifact_root / "permissions.json"
        self.datasets_index = self.datasets_dir / "index.json"
        self.runs_index = self.runs_dir / "index.json"
        self.bridge_index = self.bridge_dir / "index.json"
        for path in [self.datasets_dir, self.runs_dir, self.bridge_dir, settings.cache_root, settings.artifact_root]:
            path.mkdir(parents=True, exist_ok=True)
        for index in [self.datasets_index, self.runs_index, self.bridge_index, self.permissions_file]:
            if not index.exists():
                index.write_text("[]", encoding="utf-8")
        self._file_locks: dict[Path, Lock] = {
            self.datasets_index: Lock(),
            self.runs_index: Lock(),
            self.bridge_index: Lock(),
            self.permissions_file: Lock(),
        }

    def read_json(self, path: Path) -> list[dict[str, Any]]:
        return json.loads(path.read_text(encoding="utf-8"))

    def write_json(self, path: Path, payload: list[dict[str, Any]]) -> None:
        lock = self._file_locks.get(path)
        if lock:
            with lock:
                self._atomic_write(path, payload)
        else:
            self._atomic_write(path, payload)

    def _atomic_write(self, path: Path, payload: list[dict[str, Any]]) -> None:
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
        tmp.replace(path)

    def upsert_record(self, path: Path, key: str, value: str, record: dict[str, Any]) -> None:
        rows = self.read_json(path)
        rows = [row for row in rows if row.get(key) != value]
        rows.append(record)
        self.write_json(path, rows)

    def list_records(self, path: Path) -> list[dict[str, Any]]:
        return self.read_json(path)


storage_service = StorageService()
