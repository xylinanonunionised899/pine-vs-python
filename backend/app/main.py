from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import bootstrap as _bootstrap  # noqa: F401  — ensures sys.path is set first
from app.api import chat, comparison, data_sources, indicators, permissions, runs
from app.api import dependencies, pine_bridge
from app.core.settings import settings
from app.services.run_service import run_service

_log = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(application: FastAPI):  # noqa: ARG001
    # Seed demo data on first launch — runs after all imports are fully resolved.
    # Failures are logged with traceback but never block API startup.
    try:
        from app.services.seed_service import seed_service
        seed_service.seed_if_needed()
    except Exception as e:
        _log.warning("Demo seed failed: %s", e, exc_info=True)
    _loopback_addresses = ("127.0.0.1", "::1", "localhost")
    if settings.app_host not in _loopback_addresses:
        _log.warning(
            "WARNING: Backend is configured to bind to '%s'. This app is designed for"
            " single-user local desktop use only. Binding to a non-loopback address"
            " exposes all endpoints without authentication.",
            settings.app_host,
        )
    yield


app = FastAPI(title="Trading Strategy Comparator API", version="0.2.0", lifespan=_lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data_sources.router)
app.include_router(runs.router)
app.include_router(comparison.router)
app.include_router(permissions.router)
app.include_router(chat.router)
app.include_router(dependencies.router)
app.include_router(pine_bridge.router)
app.include_router(indicators.router)


@app.get("/health")
def healthcheck() -> dict[str, object]:
    return {
        "status": "ok",
        "timestamp": datetime.now(UTC).isoformat(),
        "frontend_ready": _frontend_dist is not None,
    }


@app.websocket("/runs/{run_id}/stream")
async def run_stream(websocket: WebSocket, run_id: str) -> None:
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(run_service.latest_event(run_id).model_dump(mode="json"))
            await asyncio.sleep(1)
    except (WebSocketDisconnect, KeyError):
        await websocket.close()


@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    await websocket.send_json({"type": "run_status", "status": "idle", "message": "Use /runs/{run_id}/stream for live run updates."})
    await websocket.close()


# ── Production SPA static serving ──────────────────────────────────────────
# When the frontend/dist is available (PyInstaller bundle or local build),
# FastAPI serves the React app so Electron can load http://127.0.0.1:8000.
def _find_frontend_dist() -> Path | None:
    if getattr(sys, "frozen", False):
        # PyInstaller: datas are extracted to sys._MEIPASS
        candidate = Path(sys._MEIPASS) / "frontend_dist"  # type: ignore[attr-defined]
    else:
        # parents[0]=app/, parents[1]=backend/, parents[2]=project root
        candidate = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    return candidate if candidate.exists() else None


_frontend_dist = _find_frontend_dist()
if _frontend_dist:
    _assets_dir = _frontend_dist / "assets"
    if _assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="frontend_assets")

    @app.get("/", include_in_schema=False)
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str = "") -> FileResponse:
        return FileResponse(str(_frontend_dist / "index.html"))
