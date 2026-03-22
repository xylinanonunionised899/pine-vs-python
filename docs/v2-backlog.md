# Trading Strategy Comparator — v1 Complete / v2 Backlog

## v1 Status: Feature-Complete

All v1 goals have been delivered. The app can be distributed as a Windows desktop
installer to a single local user who has no Python or Node.js installed.

### What v1 delivers

| Area | Status | Details |
|------|--------|---------|
| Windows installer | ✅ done | NSIS `.exe` via electron-builder, ~170 MB, installs to Program Files |
| Electron shell | ✅ done | Loading screen → health poll → `http://127.0.0.1:8000` in BrowserWindow |
| Self-contained backend | ✅ done | PyInstaller `--onedir` bundle; no Python required on target machine |
| SPA served by FastAPI | ✅ done | Vite `dist/` embedded in PyInstaller bundle; no Electron file:// issues |
| First-run demo seeding | ✅ done | `dataset-demo-5m` (300 bars) + `run-demo-ema` seeded on first startup |
| Default route | ✅ done | App opens on `/workspace` with demo data; no blank screen |
| Workspace flow | ✅ done | Pine pane auto-runs; Python pane shows seeded EMA run immediately |
| Library + Alignment | ✅ done | 6 built-in indicators, load-to-workspace, series metadata persisted |
| Python certification | ✅ done | `scripts/certify_builtins.py` — 6/6 pass on demo dataset |
| Pine certification | ✅ done | `npm run test:parity` (Vitest/Node) — 6/6 pass on demo dataset |
| Combined parity report | ✅ done | `--include-pine` flag merges Pine + Python into unified JSON + Markdown |
| Route smoke tests | ✅ done | Playwright suite covers all 6 routes + key flows |
| Release checklist | ✅ done | `docs/testing-and-verification.md` — 13-item gate before each installer build |
| User data in APPDATA | ✅ done | `%APPDATA%\TradingStrategyComparator\` survives uninstall |

---

## v2 Backlog (optional, not required for current distribution)

Ranked roughly by impact-to-effort ratio for a single-developer project.

---

### P1 — Canonical dataset certification

**Why first:** The parity tooling is built; it just needs a real dataset to run against.
Using the demo dataset (300 bars) for certification is a known gap documented in the
release checklist. A single SBIN import makes all certification gates meaningful.

**Work:**
- Import SBIN_5.xlsx once and keep it as the canonical certification dataset
- Run `certify_builtins.py --strict` as part of every release (currently optional)
- Add a `[ ] --strict exits 0 on SBIN` item to the release checklist once canonical
  dataset is established

**Effort:** low (one import, one checklist update)

---

### P2 — CI-friendly smoke test entrypoint

**Why second:** Playwright tests currently require two manually started servers.
A single script that starts both servers, waits for readiness, runs the suite, and
tears down would make smoke tests runnable without developer intervention.

**Work:**
- Add a `scripts/smoke-ci.ps1` (or `.sh`) that:
  1. Starts uvicorn in background, waits for `/health`
  2. Starts Vite dev server in background, waits for `:5173`
  3. Runs `npx playwright test`
  4. Kills both server processes on exit (success or failure)
- Update `testing-and-verification.md` with the new single-command entrypoint

**Effort:** low–medium (shell scripting, no code changes)

---

### P3 — Auto-update / installer versioning

**Why third:** Once the app is distributed, users need a way to get new builds without
re-downloading and re-installing manually.

**Work:**
- Add `electron-updater` to `electron/package.json`
- Publish releases to a local network share or GitHub Releases
- Electron main process checks for updates on launch and notifies user
- Bump version from `1.0.0` to semantic versioning tracked in a `CHANGELOG.md`

**Effort:** medium

---

### P4 — Real-time live data provider

**Why fourth:** The current live run flow starts a timer-based mock; no real market
data feeds into it. A real provider would make the app useful beyond replay analysis.

**Work:**
- Pick a data source: NSE/BSE websocket, Zerodha Kite streaming, or a free CSV feed
- Add a `LiveDataProvider` abstraction in `backend/services/`
- Wire the existing live run lifecycle to consume real ticks
- Extend the Workspace Python pane to render updating candles in real time

**Effort:** high (depends on provider API chosen)

---

### P5 — PineTS performance for large datasets

**Why fifth:** The demo dataset is 300 bars. Real datasets (e.g. SBIN 18,850 bars)
will be ~60× larger. PineTS performance on large datasets is currently untested.

**Work:**
- Run `npm run test:parity` against the SBIN dataset (set `DATASET_CSV` env var)
- Profile `executePineScript()` — identify if it blocks the renderer thread
- Move Pine execution to a Web Worker if needed
- Add a bar-count threshold check in the certification test (warn if > 5s per indicator)

**Effort:** low to benchmark; medium to fix if Web Worker migration is needed

---

## What v2 is NOT

These are out of scope for v2 and belong to a separate project (VAYU integration):

- Multi-user or cloud deployment
- Real brokerage order execution
- Portfolio management across multiple instruments simultaneously
- Strategy optimization / backtesting grid search
- Mobile / web-only distribution

---

## Deciding what to build next

If you have a real dataset (SBIN or similar) ready: start with **P1** — one import
unblocks strict certification for free.

If the app is going to someone else who needs it to "just work": **P2** (CI smoke
entrypoint) + **P3** (auto-update) protect them from regressions and keep delivery
frictionless.

If the trading workflow itself needs to become real: **P4** (live data provider) is
the only item that meaningfully changes the daily use case.
