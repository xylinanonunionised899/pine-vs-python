# Trading Strategy Comparator — Dynamic Pine Script Engine

## What This Is

A local-first monorepo for comparing Pine Script and Python trading strategies on synchronized charts. The project has a React+TypeScript frontend (Vite) and FastAPI backend with dual editors, dual charts, comparison engine, and Ollama LLM assistant. This milestone adds **dynamic Pine Script execution** via TradingView Playwright automation — so ANY Pine Script pasted into the Pine editor auto-runs and displays candles + indicators on the Pine screen.

## Core Value

**Any Pine Script pasted into the Pine editor must execute and display its candles + indicators on the Pine screen — fully dynamic, never static.**

## Requirements

### Validated

- ✓ React + TypeScript frontend with dual editors (Monaco), dual charts (lightweight-charts) — existing
- ✓ FastAPI backend with REST + WebSocket endpoints — existing
- ✓ Python strategy engine: dynamic execution via `exec()` + `run_strategy(frame)` — existing
- ✓ Comparison engine: aligns Pine vs Python outputs, diffs indicator series — existing
- ✓ SQLite + DuckDB storage, dataset import (Excel/CSV) — existing
- ✓ LLM chat panel (Ollama) — existing
- ✓ Approval model with permission queue — existing
- ✓ Pine editor accepts any code (Monaco) — existing
- ✓ Chart panel renders candlesticks + indicator overlays — existing

### Active

- [ ] TradingView Playwright automation: login, paste Pine Script, extract indicator data
- [ ] Auto-run Pine Script: paste → click Run → results appear on Pine screen with candles + indicators
- [ ] Support ANY Pine Script complexity (full Pine language, not subset)
- [ ] New frontend tab/page: "Pine Automation" for managing TradingView sessions and running Pine Scripts
- [ ] Background worker: execute Pine Script in headless TradingView, extract results
- [ ] Pine data extraction: capture indicator series, trade events, candle data from TradingView chart
- [ ] Session management: store TradingView session cookies for persistent login
- [ ] Error handling: syntax errors, timeout, TradingView rate limits, network failures
- [ ] Result caching: cache extracted Pine results to avoid re-running unchanged scripts

### Out of Scope

- Python strategy engine improvements — already dynamic, no changes needed
- Real-time live TradingView data feed — focus on replay/historical data
- TradingView alerts or notifications — not needed for comparison
- Mobile app — web-first
- Multi-user support — single user local tool
- TradingView paid API — use free browser automation instead

## Context

### Existing Architecture
- **Frontend**: Vite + React + TypeScript at `frontend/`
  - Pages: ImportsPage, WorkspacePage, RunsPage, SettingsPage
  - Components: PineEditor, PythonEditor, ChartPanel, DiffPanel, ApprovalQueue, LLMChat
  - State: React useState in App.tsx, services via `services/api.ts`
- **Backend**: FastAPI at `backend/app/`
  - API routes: runs, pine_bridge, comparison, data_sources, chat, permissions
  - Core engines: PythonStrategyEngine (works), PineLocalEngine (validate only), PineBridgeEngine (handshake only), ComparisonEngine
  - Services: RunService, BridgeService, DatasetService, ChatService, OllamaClient
- **Workers**: `workers/tradingview_bridge/` — currently just a README placeholder
- **Data**: SQLite + DuckDB + Parquet at `data/`

### Current Pine Script Gap
- `PineLocalEngine.validate()`: Only checks for unsupported keywords — NO execution
- `PineBridgeEngine.handshake()`: Only checks if session file exists — NO automation
- Pine chart only shows data from manually imported "Bridge Artifacts" (JSON paste in Settings)
- The defaultBridgeJson has 2 hardcoded data points — just a demo

### Technical Environment
- Windows 11, Python 3.11.9
- Playwright already a dependency (used by browser-use in VYOM project)
- TradingView account available (free tier)
- NVIDIA RTX 5050 (8GB VRAM), Ollama with qwen3.5:9b

## Constraints

- **Tech Stack**: Must integrate into existing FastAPI + React architecture (no new frameworks)
- **TradingView**: Must work with free TradingView account
- **Browser Automation**: Playwright (already in ecosystem via VYOM project)
- **Performance**: Pine Script execution via TradingView will be slower than local Python — need async/background worker
- **Rate Limits**: TradingView may throttle rapid script changes — need cooldown/queue
- **Session**: TradingView login cookies must persist across backend restarts

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Playwright for TradingView automation | Already in ecosystem, headless Chrome support, proven for web automation | — Pending |
| New "Pine Automation" tab | Separates automated Pine from manual bridge workflow, cleaner UX | — Pending |
| Background worker for Pine execution | TradingView automation is slow (5-30s), can't block API thread | — Pending |
| Session cookie persistence | Avoid re-login on every run, store encrypted cookies | — Pending |
| Auto-run on paste | User's explicit preference for immediate execution, no preview step | — Pending |

---
*Last updated: 2026-03-10 after initialization*
