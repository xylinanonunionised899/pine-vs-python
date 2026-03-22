# Trading Strategy Comparator

Trusted-local desktop app for comparing Pine Script and Python strategies on the same candle data, charting both outputs side by side, and checking whether their indicators, signals, and trade behavior align.

## Current Status

This repository is **v1 complete** for **trusted single-user local desktop use**.

What is real today:

- Windows desktop installer with Electron + bundled FastAPI backend
- First-run demo dataset and demo replay run
- Imports, Workspace, Runs, Settings, Alignment, and Library pages
- Pine and Python charting on the same dataset
- Built-in indicator library with Pine + Python code
- Parity automation for built-in indicators
- Playwright smoke coverage for the main app routes
- Release checklist and installer smoke-test docs

What it is **not**:

- not a networked or multi-user service
- not a hardened untrusted-code execution platform
- not a broker-connected or exchange-connected live trading system

The authoritative summary docs are:

- [V1 Final Status](docs/v1-final-status.md)
- [Current Status](docs/current-status.md)
- [Production Readiness](docs/production-readiness.md)
- [Testing And Verification](docs/testing-and-verification.md)
- [V2 Backlog](docs/v2-backlog.md)

## Documentation Index

- [V1 Final Status](docs/v1-final-status.md)
- [Current Status](docs/current-status.md)
- [Production Readiness](docs/production-readiness.md)
- [Testing And Verification](docs/testing-and-verification.md)
- [Built-In Parity Summary](docs/builtin-parity-summary.md)
- [Project Overview](docs/project-overview.md)
- [Architecture](docs/architecture.md)
- [Workflow](docs/workflow.md)
- [API Reference](docs/api-reference.md)
- [Frontend Behavior](docs/frontend-behavior.md)
- [Backend Responsibilities](docs/backend-responsibilities.md)
- [Ollama Integration](docs/ollama-integration.md)
- [AI Handoff](docs/ai-handoff.md)
- [V2 Backlog](docs/v2-backlog.md)

## Repo Layout

- `frontend/`: Vite + React app, PineTS integration, Playwright/Vitest tests
- `backend/`: FastAPI app, services, engines, packaging helpers, tests
- `shared/`: shared Python and TypeScript contracts
- `data/`: local datasets, run artifacts, bridge artifacts, library entries
- `docs/`: human-readable project truth and handoff docs
- `.planning/`: historical planning notes and archived roadmap documents

## Run Locally

### Backend

```powershell
cd "D:\python , pine script\backend"
.\run-backend.ps1
```

Health:

```text
http://127.0.0.1:8000/health
```

### Frontend

```powershell
cd "D:\python , pine script\frontend"
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Main routes:

```text
http://127.0.0.1:5173/workspace
http://127.0.0.1:5173/imports
http://127.0.0.1:5173/runs
http://127.0.0.1:5173/settings
http://127.0.0.1:5173/alignment
http://127.0.0.1:5173/library
```

## Verification Commands

### Backend tests

```powershell
cd "D:\python , pine script\backend"
.\run-tests.ps1
```

### Frontend build

```powershell
cd "D:\python , pine script\frontend"
npm run build
```

### Pine built-in certification

```powershell
cd "D:\python , pine script\frontend"
npm run test:parity
```

### Python built-in certification

```powershell
cd "D:\python , pine script"
C:\Users\sakth\Desktop\vayu\.venv\Scripts\python.exe scripts\certify_builtins.py --strict
```

### Browser smoke tests

See the full prerequisites and command sequence in [Testing And Verification](docs/testing-and-verification.md).

## Desktop Installer

The packaged Windows installer lives under:

```text
dist-installer/Trading Strategy Comparator Setup 1.0.0.exe
```

For installer validation, use the desktop smoke-test and release checklist in:

- [Testing And Verification](docs/testing-and-verification.md)

## Important Limits

- Deployment target is localhost-only, trusted single-user desktop
- Python strategy execution is acceptable only under that trusted-local model
- Exact Pine truth for some scripts still depends on manual bridge artifacts
- Provider-backed live market data is still future work
- V2 work is tracked in [V2 Backlog](docs/v2-backlog.md)
