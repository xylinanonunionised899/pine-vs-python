# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for the Trading Strategy Comparator backend.
# Run from the backend/ directory:
#   pyinstaller trading-backend.spec --clean
#
# Requires: frontend/dist/ to exist (run `npm run build` in frontend/ first).

from pathlib import Path
from PyInstaller.utils.hooks import collect_all, collect_submodules

BACKEND_DIR = Path(SPECPATH)           # D:\python , pine script\backend
PROJECT_ROOT = BACKEND_DIR.parent     # D:\python , pine script

# Collect packages that contain binary extensions (pydantic_core)
datas_pydantic, bins_pydantic, hidden_pydantic = collect_all("pydantic_core")

# Collect orjson (Rust extension)
datas_orjson, bins_orjson, hidden_orjson = collect_all("orjson")

block_cipher = None

a = Analysis(
    [str(BACKEND_DIR / "pyinstaller_entry.py")],
    pathex=[str(BACKEND_DIR), str(PROJECT_ROOT)],
    binaries=bins_pydantic + bins_orjson,
    datas=[
        # Backend application code
        (str(BACKEND_DIR / "app"), "app"),
        # Shared Python contracts (imported by app/models/contracts.py)
        (str(PROJECT_ROOT / "shared"), "shared"),
        # Built Vite frontend — served by FastAPI at runtime
        (str(PROJECT_ROOT / "frontend" / "dist"), "frontend_dist"),
    ] + datas_pydantic + datas_orjson,
    hiddenimports=[
        # uvicorn internals not always auto-detected
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.protocols.websockets.websockets_impl",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        # Core framework
        "fastapi",
        "fastapi.routing",
        "fastapi.middleware.cors",
        "fastapi.staticfiles",
        "fastapi.responses",
        "starlette",
        "starlette.routing",
        "starlette.staticfiles",
        "starlette.responses",
        "starlette.middleware.cors",
        # Pydantic + settings
        "pydantic",
        "pydantic.main",
        "pydantic_core",
        "pydantic_settings",
        # anyio (used by uvicorn/starlette)
        "anyio",
        "anyio._backends._asyncio",
        "anyio._backends._trio",
        # Data libraries
        "pandas",
        "pandas._libs.tslibs.base",
        "numpy",
        "openpyxl",
        # HTTP client
        "httpx",
        "h11",
        # Serialization
        "orjson",
    ] + hidden_pydantic + hidden_orjson
      + collect_submodules("uvicorn")
      + collect_submodules("starlette"),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "_tkinter", "matplotlib", "scipy", "PIL", "pytest"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="trading-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,       # No terminal window for end users
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="trading-backend",
)
