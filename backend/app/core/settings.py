from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _resolve_data_root() -> Path:
    """Return the user-data directory, adapting for frozen (PyInstaller) builds."""
    if "DATA_ROOT" in os.environ:
        return Path(os.environ["DATA_ROOT"])
    if getattr(sys, "frozen", False):
        appdata = os.environ.get("APPDATA", str(Path.home() / "AppData" / "Roaming"))
        root = Path(appdata) / "TradingStrategyComparator"
        root.mkdir(parents=True, exist_ok=True)
        return root
    return Path(__file__).resolve().parents[3] / "data"


def _default_ollama_bin() -> Path:
    env = os.environ.get("OLLAMA_BIN")
    if env:
        return Path(env)
    found = shutil.which("ollama")
    if found:
        return Path(found)
    # Fallback: assume ollama is on PATH or installed in default location
    if sys.platform == "win32":
        default = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Ollama" / "ollama.exe"
        if default.exists():
            return default
    return Path("ollama")


class Settings(BaseSettings):
    app_env: str = "development"
    app_host: str = "127.0.0.1"
    app_port: int = 8000
    frontend_port: int = 5173
    sqlite_path: Path = Path("../data/app.db")
    parquet_root: Path = Path("../data/artifacts")
    tradingview_session_file: Path = Path("../data/tradingview_session.json")
    allow_local_pine_subset: bool = True
    default_market_provider: str = "polygon"
    polygon_api_key: str | None = None
    ollama_bin: Path = Field(default_factory=_default_ollama_bin)
    ollama_default_chat_model: str = "qwen3.5:9b"
    ollama_default_code_model: str = "qwen2.5-coder:7b"
    ollama_embed_model: str = "nomic-embed-text"

    model_config = SettingsConfigDict(env_file="../.env", extra="ignore", case_sensitive=False)

    @property
    def repo_root(self) -> Path:
        return Path(__file__).resolve().parents[3]

    @property
    def data_root(self) -> Path:
        return _resolve_data_root()

    @property
    def cache_root(self) -> Path:
        return self.data_root / "cache"

    @property
    def artifact_root(self) -> Path:
        return self.data_root / "artifacts"


settings = Settings()
