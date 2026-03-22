from __future__ import annotations

import sys
from pathlib import Path

# ROOT = D:\python , pine script  (the monorepo root, three levels up from this file)
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
