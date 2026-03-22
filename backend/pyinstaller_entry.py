"""
PyInstaller entry point for the Trading Strategy Comparator backend.

This replaces launch_uvicorn_detached.py for the packaged (frozen) build.
It sets up sys.path and the DATA_ROOT env var before importing uvicorn.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

if getattr(sys, "frozen", False):
    # PyInstaller extracts bundle to sys._MEIPASS at runtime.
    bundle_dir = Path(sys._MEIPASS)  # type: ignore[attr-defined]
    if str(bundle_dir) not in sys.path:
        sys.path.insert(0, str(bundle_dir))

    # Route user data to %APPDATA%\TradingStrategyComparator so it survives
    # reinstalls and is user-writable (not inside Program Files).
    if "DATA_ROOT" not in os.environ:
        appdata = os.environ.get("APPDATA", str(Path.home() / "AppData" / "Roaming"))
        data_root = Path(appdata) / "TradingStrategyComparator"
        data_root.mkdir(parents=True, exist_ok=True)
        os.environ["DATA_ROOT"] = str(data_root)
else:
    # Dev mode: just make sure the monorepo root is on sys.path.
    monorepo_root = Path(__file__).resolve().parent.parent
    if str(monorepo_root) not in sys.path:
        sys.path.insert(0, str(monorepo_root))

import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("APP_PORT", "8000"))
    uvicorn.run("app.main:app", host="127.0.0.1", port=port)
