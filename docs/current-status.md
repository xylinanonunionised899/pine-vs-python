# Current Status

This document describes the repo as of March 18, 2026.

## Deployment target

This app is designed for **trusted single-user local desktop use only**.

It is acceptable for:

- one local desktop user
- localhost-only backend access
- trusted user-authored Pine and Python strategy code

It is not intended for:

- networked deployment
- multi-user access
- untrusted code execution

See [Production Readiness](production-readiness.md) for the final position.

## Finished

### Desktop product

- Windows desktop installer
- Electron startup health polling
- packaged FastAPI backend + embedded frontend SPA
- first-run seeded demo dataset and demo replay run
- direct Workspace opening on first launch

### Data import and storage

- Excel preview
- CSV preview
- inferred column mapping
- dataset save to normalized CSV
- saved dataset listing
- atomic JSON writes with per-file locking for local artifact storage
- isolated test data root for pytest

### Run orchestration

- replay run creation
- dataset-backed incremental live playback
- run persistence
- run listing and retrieval
- run progress WebSocket
- live run cancellation and cleanup
- failed-state handling for live worker crashes

### Python execution

- local Python execution contract
- indicator extraction from numeric and boolean outputs
- simple trade extraction from `long_condition`
- wall-clock timeout around strategy execution
- trusted-local hardening for the local runtime model

### Pine workflow

- PineTS-based local Pine execution in the frontend
- manual bridge artifact upload and persistence
- bridge artifact selection during runs

### Comparison and library

- indicator series comparison
- trade comparison
- mismatch classification and first mismatch output
- Alignment page
- built-in indicator library
- custom save-to-library flow with persisted `series_names`

### Verification and release tooling

- backend automated tests
- frontend production build
- Pine built-in parity certification
- Python built-in parity certification
- combined Pine + Python parity report
- Playwright smoke coverage for the main routes
- desktop installer smoke checklist
- release checklist

### Ollama

- local model discovery
- chat-capable filtering
- default model selection
- prompt shaping and sanitization
- fallback behavior for missing model, timeout, offline, and cleaned-empty response
- machine-agnostic Ollama path resolution via env, PATH, and fallback discovery

## Partial

### Charts

- candles render
- price-like overlays render
- oscillator-style series can be classified into a sub-pane
- charting is still not a full multi-pane technical-analysis workspace

### Pine truth workflow

- local PineTS execution works for the supported Pine surface
- exact TradingView truth still relies on manual bridge artifacts for some scripts
- automated TradingView bridge does not exist

### Live mode

- incremental playback from a saved dataset works
- provider-backed real market streaming is not implemented

### Approval workflow

- permission grants and TTL behavior work
- UI can toggle approval entries
- patch generation/application from the UI is still incomplete

## Planned or intentionally not built

- network auth or multi-user tenancy
- production-grade untrusted-code isolation
- provider-backed Polygon fetch flow
- automated TradingView bridge worker
- local Pine subset runtime separate from PineTS
- broker or exchange-connected trading
- token streaming in chat
- CI-managed smoke orchestration without manual server startup

## Known limitations

### Trusted-local security model

The Python runtime is acceptable only for the trusted-local desktop target.
It must not be treated as a production-grade sandbox for untrusted users.

### File import scope

Local file import is intended for supported spreadsheet and CSV files only.

### Active storage model

The running app currently uses JSON and CSV artifact storage under `data/` or `%APPDATA%`.
Older plans that mention SQLite or DuckDB as active storage are historical.

### Live mode naming

`live` currently means replay-style bar-by-bar progression from a saved dataset.
It is not an external market feed.

### Provider gap

`polygon` remains visible in shared contracts and some UI paths, but active provider-backed fetching is not implemented.

### Pine truth gap

Some Pine strategies still need manual bridge artifacts for exact parity checking.

## Recommended next work

The forward-looking backlog is tracked in:

- [V2 Backlog](v2-backlog.md)

The short version:

1. Canonical certification on a real dataset such as SBIN
2. CI-friendly smoke entrypoint
3. Auto-update and installer versioning
4. Real provider-backed live data
5. PineTS performance work on large datasets

## Release summary

- Trusted local desktop use: yes
- Distribution-ready v1: yes
- Networked or multi-user production system: no
