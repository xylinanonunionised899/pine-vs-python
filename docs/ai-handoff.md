# AI Handoff

This document is for a future AI agent or developer picking up the repository after v1 completion.

## Start here

Read these in order:

1. [V1 Final Status](v1-final-status.md)
2. [Current Status](current-status.md)
3. [Testing And Verification](testing-and-verification.md)
4. [Production Readiness](production-readiness.md)
5. [V2 Backlog](v2-backlog.md)

Then open these code entry points:

1. `frontend/src/app/App.tsx`
2. `backend/app/main.py`
3. `backend/app/services/run_service.py`
4. `backend/app/core/python_engine.py`
5. `backend/app/services/storage.py`
6. `backend/app/services/ollama_client.py`

## Mental model

Treat the app as a **trusted-local parity lab** with these pillars:

- dataset ingestion
- Pine and Python execution
- side-by-side charting
- alignment and diffing
- local Ollama assistance
- library save/load

The repo is no longer in the earlier "alpha prototype" state, but it is also not a network-ready multi-user platform.

## What is real now

- Windows desktop installer
- first-run demo seed
- route-based UI with Workspace, Imports, Runs, Settings, Alignment, and Library
- PineTS execution in the frontend
- local Python strategy execution with timeout
- replay and dataset-backed live playback
- manual Pine bridge artifacts
- built-in indicator library and parity reports
- Playwright smoke suite
- release checklist and installer smoke checklist

## What is still out of scope or future work

- multi-user auth and tenancy
- untrusted-code sandboxing
- provider-backed real-time market data
- automated TradingView bridge
- broker-connected execution
- auto-update and installer distribution pipeline beyond the current installer build

## Important repo truth

- The product target is **trusted single-user local desktop only**
- Older planning files under `.planning/` are historical unless they explicitly say otherwise
- The current forward-looking roadmap is [V2 Backlog](v2-backlog.md)
- The main release verification flow is [Testing And Verification](testing-and-verification.md)

## Files to understand first

### Frontend composition

- `frontend/src/app/App.tsx`
- `frontend/src/pages/WorkspacePage.tsx`
- `frontend/src/pages/AlignmentPage.tsx`
- `frontend/src/pages/IndicatorLibraryPage.tsx`
- `frontend/src/services/api.ts`
- `frontend/src/lib/defaults.ts`

### Backend composition

- `backend/app/main.py`
- `backend/app/core/data_manager.py`
- `backend/app/core/python_engine.py`
- `backend/app/core/comparison_engine.py`
- `backend/app/services/dataset_service.py`
- `backend/app/services/run_service.py`
- `backend/app/services/storage.py`
- `backend/app/services/chat_service.py`
- `backend/app/services/ollama_client.py`

### Shared contracts

- `shared/python/contracts.py`
- `shared/typescript/contracts.ts`

## Assumptions you should not make

- do not assume the backend is safe for untrusted remote users
- do not assume provider-backed live data exists
- do not assume automated TradingView parity exists
- do not assume SQLite or DuckDB are active stores
- do not assume old roadmap phase status is still current

## Common sources of confusion

### "Live" means real market streaming

It does not. It means saved-dataset playback that advances bar by bar.

### "Production-ready" means network-safe

It does not. Production-ready here means distribution-ready for a trusted local desktop user.

### Pine parity is always exact

It is exact only within the current PineTS-supported surface or when a matching bridge artifact is supplied.

### Playwright coverage is missing

It is now present as a smoke suite. Use the test docs for how to run it.

## Safe change strategy

1. update Markdown truth docs when changing product status
2. update shared contracts before changing payloads
3. update backend behavior
4. update frontend state wiring
5. run backend tests
6. run frontend build
7. run parity and smoke checks when relevant

## Handoff status

This repo is now well-documented for long-term continuation. Future agents should treat it as:

- **v1 complete**
- **trusted-local desktop only**
- **ready for optional v2 backlog work**
