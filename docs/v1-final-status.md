# V1 Final Status

## What this product is

Trading Strategy Comparator is a trusted-local desktop app for comparing Pine Script and Python strategy behavior on the same candle data.

The user can:

- import Excel or CSV candle data
- run Pine and Python logic against the same dataset
- view both outputs on synchronized charts
- inspect alignment and mismatch details
- save useful strategies into a local library
- use a local Ollama assistant to inspect or discuss results

## Who it is for

This v1 is for:

- one desktop user
- local research and parity checking
- trusted user-authored code

It is not for:

- multi-user hosting
- public API exposure
- untrusted code execution

## What v1 delivers

- Windows installer
- Electron desktop shell with bundled backend
- first-run demo data and demo replay run
- Workspace, Imports, Runs, Settings, Alignment, and Library pages
- PineTS execution in the frontend
- Python strategy execution in the backend
- manual Pine bridge artifacts
- built-in indicator library
- parity reports for built-ins
- Playwright route smoke tests
- release and installer verification docs

## What is explicitly unsupported

- networked or multi-user deployment
- untrusted remote strategy execution
- broker or exchange-connected live trading
- provider-backed real-time market data
- automated TradingView bridge

## How to verify before release

Use:

- [Testing And Verification](testing-and-verification.md)
- [Built-In Parity Summary](builtin-parity-summary.md)

The main release gates are:

- backend tests pass
- frontend build passes
- Pine parity passes
- Python parity passes
- combined parity passes
- Playwright smoke passes
- desktop installer smoke checklist passes

## Main code entry points

- `frontend/src/app/App.tsx`
- `frontend/src/pages/WorkspacePage.tsx`
- `backend/app/main.py`
- `backend/app/services/run_service.py`
- `backend/app/core/python_engine.py`
- `backend/app/services/storage.py`

## What comes next

Future work is optional and tracked in:

- [V2 Backlog](v2-backlog.md)

The most practical first v2 item is canonical certification on a real dataset such as SBIN.
