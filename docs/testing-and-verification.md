# Testing And Verification

This document records the current automated test coverage, the manual smoke tests used during development, and the expected verification flow after future changes.

## Automated tests

Current backend tests live in:

- `backend/tests/test_chat_service.py`
- `backend/tests/test_comparison_engine.py`
- `backend/tests/test_dataset_service.py`
- `backend/tests/test_data_manager.py`
- `backend/tests/test_dependency_service.py`
- `backend/tests/test_permission_manager.py`
- `backend/tests/test_run_service.py`

These tests cover:

- column mapping and data normalization
- dataset preview and save behavior
- comparison mismatch logic
- permission grant and access checks
- dependency status reporting
- replay and live run behavior
- chat fallback and sanitization behavior

## Current automated commands

### Backend tests

```powershell
cd "D:\python , pine script\backend"
.\run-tests.ps1
```

### Frontend production build

```powershell
cd "D:\python , pine script\frontend"
npm run build
```

### Pine built-in certification (Vitest — Node.js, no browser needed)

Runs all 6 built-in indicator Pine scripts through the PineTS engine and writes
`docs/builtin-parity-pine.json`.

```powershell
cd "D:\python , pine script\frontend"
npm run test:parity
```

Prerequisites: backend and frontend dev server do **not** need to be running.
Requires a dataset CSV (uses `%APPDATA%\TradingStrategyComparator\cache\datasets\index.json`
if available, falls back to `data/cache/datasets/dataset-demo-5m.csv`).

### Python built-in certification (canonical dataset, strict mode)

Certifies all 6 built-in indicators via the Python execution engine against the
first non-demo saved dataset. Fails if only the demo dataset is available.

```powershell
cd "D:\python , pine script"
C:\Users\sakth\Desktop\vayu\.venv\Scripts\python.exe scripts\certify_builtins.py --strict
```

### Combined Pine + Python parity certification

Runs Pine certification first, then combines Pine results with Python results to
produce a unified `docs/builtin-parity-report.json` and `docs/builtin-parity-summary.md`
with per-indicator `python_status`, `pine_status`, and `parity_status`.

```powershell
cd "D:\python , pine script\frontend"
npm run test:parity

cd "D:\python , pine script"
C:\Users\sakth\Desktop\vayu\.venv\Scripts\python.exe scripts\certify_builtins.py --include-pine
```

### Route smoke tests (Playwright — requires running servers)

Prerequisites — both servers must be running before executing:

```powershell
# Terminal 1 — backend
cd "D:\python , pine script\backend"
PYTHONPATH="D:\python , pine script" python -m uvicorn app.main:app --port 8000

# Terminal 2 — frontend dev server
cd "D:\python , pine script\frontend"
npm run dev

# Terminal 3 — run smoke tests
cd "D:\python , pine script\frontend"
npm run test:smoke
```

One-time browser install (run once after `npm install`):

```powershell
cd "D:\python , pine script\frontend"
npx playwright install chromium
```

Smoke test coverage: all 6 routes render, Workspace demo banner + canvases present,
Imports dataset list, Runs seeded entry, Library load into Workspace, Settings model list.

## Manual verification checklist

### Backend startup

1. Start the backend with `.\run-backend.ps1`
2. Open `http://127.0.0.1:8000/health`
3. Confirm `status = ok`

### Frontend startup

1. Start the frontend with `npm run dev -- --host 127.0.0.1 --port 5173`
2. Open `/imports`
3. Confirm the page loads without a blank screen

### SBIN workbook preview

1. Use `C:\Users\sakth\Downloads\SBIN_5.xlsx`
2. Click `Preview source`
3. Confirm:
   - sheet `Sheet1`
   - `18850` rows
   - columns `t, o, h, l, c, v, dt`
   - inferred mapping `dt/o/h/l/c/v`

### Dataset save

1. Click `Save mapping`
2. Confirm the new dataset appears in the saved datasets list
3. Confirm the app navigates to `/workspace`

### Replay run

1. Click `Run replay`
2. Confirm candles appear on the Python chart
3. Confirm a run appears in `/runs`
4. Confirm mismatch analysis is populated if Pine data is attached

### Live run

1. Click `Start live run`
2. Confirm the run lifecycle becomes `live`
3. Confirm progress increases over time
4. Confirm `/runs/{run_id}/stream` emits updates

### Bridge artifact

1. Open `/settings`
2. Paste a valid bridge JSON payload
3. Click `Save bridge artifact`
4. Return to `/workspace`
5. Select the saved artifact
6. Re-run replay and confirm Pine series are available

### Ollama chat

1. Open `/settings`
2. Confirm local models appear
3. Confirm `nomic-embed-text:latest` is labeled non-chat
4. Open `/workspace`
5. Click `Ask LLM`
6. Confirm a clean human-readable response or a structured fallback message appears

## Desktop installer smoke test (packaged app)

Run this checklist after every installer build before distributing.

### Clean first-run

1. Delete `%APPDATA%\TradingStrategyComparator` entirely
2. Run `dist-installer\Trading Strategy Comparator Setup 1.0.0.exe` and install
3. Launch from the Desktop or Start Menu shortcut
4. Confirm the loading screen appears and clears within 10 seconds
5. Confirm the app opens directly on the **Workspace** tab (not Imports)
6. Confirm the green **"Showing bundled demo data"** banner is visible
7. Confirm the **Pine pane** shows candles — indicators should appear within a few seconds as Pine auto-runs
8. Confirm the **Python pane** shows candles and EMA overlays immediately (from the seeded run)
9. Open **Runs** tab — `run-demo-ema` should be listed with `completed` status
10. Open **Imports** tab — `Demo Dataset (EMA 5m · 300 bars)` should be listed

### Restart behaviour

1. Close the app and relaunch (without deleting APPDATA)
2. Confirm the app opens on Workspace and the same demo data is shown
3. Confirm no duplicate demo entries appear in Imports or Runs

### Import real dataset after demo startup

1. Open **Imports** and load a real Excel/CSV workbook (e.g. SBIN_5.xlsx)
2. Click **Preview source** — confirm row count and inferred mapping
3. Click **Save mapping** — confirm the new dataset appears and the app navigates to Workspace
4. Confirm the demo banner disappears and the new dataset candles replace the demo candles

### Load library indicator into Workspace

1. Open **Library** tab
2. Click **Load to Workspace** on any built-in (e.g. RSI)
3. Confirm the Pine and Python editors update
4. Click **Run Pine** — confirm Pine pane renders RSI indicator
5. Click **Run Python** — confirm Python pane renders RSI values

### Uninstall

1. Uninstall via Add/Remove Programs
2. Confirm the shortcut is removed
3. Confirm `%APPDATA%\TradingStrategyComparator` is **preserved** (user data survives uninstall)

---

## Release checklist (before shipping installer)

Run each item before tagging a release or distributing an installer to others.

```
[ ] npm run build passes without TypeScript errors
[ ] build-installer.ps1 completes all 3 stages with exit code 0
[ ] Installer file is present: dist-installer/Trading Strategy Comparator Setup 1.0.0.exe
[ ] Clean first-run smoke test: APPDATA wiped, app launches, demo data visible
[ ] GET /health returns { status: "ok", frontend_ready: true }
[ ] GET /data-sources contains dataset-demo-5m with row_count 300
[ ] GET /runs contains run-demo-ema with 300 candles and python_series ema_fast + ema_slow
[ ] Python pane shows chart immediately without user input
[ ] Pine pane shows chart after auto-run (< 10 s)
[ ] npm run test:parity exits 0 (6/6 Pine built-ins pass)
[ ] scripts/certify_builtins.py exits 0 (6/6 Python built-ins pass)
[ ] scripts/certify_builtins.py --include-pine exits 0 (all parity_status = pass)
[ ] No "JavaScript error in the main process" popup on launch or close
```

---

## Built-in indicator parity certification

Repeatable certification validates all 6 built-in indicators via both the Python
execution engine and the PineTS engine. Results are written to:

- `docs/builtin-parity-pine.json` — Pine results (written by `npm run test:parity`)
- `docs/builtin-parity-report.json` — combined Python + Pine results
- `docs/builtin-parity-summary.md` — human-readable summary table

### Flags

| Flag | Effect |
|------|--------|
| _(none)_ | Python-only certification, demo dataset allowed |
| `--strict` | Fails if only demo dataset available (canonical dataset required) |
| `--include-pine` | Merges `docs/builtin-parity-pine.json` into report for Pine + parity status |

### Last certification result (demo dataset)

| Indicator | Python status | Pine status | Series produced (Python) |
|-----------|--------------|-------------|--------------------------|
| EMA Crossover | ✅ pass | ✅ pass | `ema_fast`, `ema_slow`, `long_condition` |
| RSI | ✅ pass | ✅ pass | `rsi`, `long_condition`, `short_condition` |
| MACD | ✅ pass | ✅ pass | `macd_line`, `signal_line`, `histogram`, `long_condition` |
| Super Trend | ✅ pass | ✅ pass | `supertrend`, `direction`, `long_condition` |
| Bollinger Bands | ✅ pass | ✅ pass | `bb_middle`, `bb_upper`, `bb_lower`, `long_condition` |
| VWAP 3-Band | ✅ pass | ✅ pass | `vwap`, `vwap_upper1–3`, `vwap_lower1–3`, `long_condition` |

Parity is also validated visually via the Alignment tab in the running app.

---

## Last known verification status

Last explicitly verified during development:

- backend health endpoint reachable
- frontend routes render
- SBIN Excel preview works
- dataset save works
- replay and live run creation work
- bridge artifact upload works
- chat model list works
- app chat can return a clean Ollama response

## Known verification gaps

- no automated coverage for sub-pane indicator rendering (PineTS Vitest tests cover series output, not canvas rendering)
- no real provider-backed live mode test because provider ingestion is not implemented yet
- Playwright smoke tests require both servers running manually (no CI entrypoint yet)

## Verification checklist after code changes

After touching imports or data code:

- preview SBIN workbook
- save dataset
- run replay once

After touching Python execution or comparison code:

- run backend tests
- run replay with default Python strategy
- inspect mismatch panel

After touching bridge code:

- save a bridge artifact
- attach it in `/workspace`
- run replay again

After touching chat code:

- refresh model list
- send one real Ollama prompt
- send one missing-model prompt and confirm fallback behavior

After touching frontend routing or layout:

- run `npm run test:smoke` (requires both servers running) — covers all 6 routes
- confirm no blank page and no obvious layout breakage

After touching built-in indicator code or PineTS integration:

- run `npm run test:parity` — 6/6 Pine indicators must pass
- run `scripts/certify_builtins.py --include-pine` — Python + parity must all pass
