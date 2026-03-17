from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_tmp_dir: tempfile.TemporaryDirectory | None = None


def pytest_configure(config) -> None:
    """Point DATA_ROOT at a temp directory before any app modules are imported."""
    global _tmp_dir
    _tmp_dir = tempfile.TemporaryDirectory(prefix="trading_tests_")
    os.environ["DATA_ROOT"] = _tmp_dir.name


def pytest_unconfigure(config) -> None:
    """Clean up the temp directory after the test session ends."""
    global _tmp_dir
    if _tmp_dir is not None:
        _tmp_dir.cleanup()
        _tmp_dir = None
