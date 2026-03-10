# Trading Strategy Comparator — Dynamic Pine Script Engine

## What This Is

A local-first monorepo for comparing Pine Script and Python trading strategies on synchronized charts. The project has a React+TypeScript frontend (Vite) and FastAPI backend with dual editors, dual charts, comparison engine, and Ollama LLM assistant. This milestone adds **dynamic Pine Script execution** via **PineTS** (TypeScript Pine Script transpiler+runtime) — so ANY Pine Script pasted into the Pine editor auto-runs locally in the browser and displays candles + indicators on the Pine screen.

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

- [ ] PineTS integration: transpile + execute Pine Script v5/v6 in browser (60+ indicators)
- [ ] Auto-run Pine Script: paste → click Run → PineTS executes → results appear on Pine screen with candles + indicators
- [ ] Support complex Pine Script (EMA, SMA, RSI, MACD, Bollinger, Stochastic, ATR, SuperTrend, etc.)
- [ ] Pine Script error handling: syntax errors shown inline, runtime errors caught gracefully
- [ ] Pine indicator series extraction: PineTS outputs → IndicatorSeries format for ChartPanel
- [ ] Pine trade event extraction: strategy.entry/exit signals → TradeEvent format
- [ ] New frontend tab/page: "Pine Automation" for managing Pine Script execution
- [ ] Dataset integration: feed imported OHLCV data into PineTS for execution
- [ ] Result caching: cache Pine execution results, re-run only on script change

### Out of Scope

- Python strategy engine improvements — already dynamic, no changes needed
- Real-time live TradingView data feed — focus on replay/historical data
- TradingView browser automation (Playwright) — replaced by PineTS local execution
- TradingView alerts or notifications — not needed for comparison
- Mobile app — web-first
- Multi-user support — single user local tool

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

### Key GitHub Projects (Researched)
- **PineTS** (269★, TypeScript, AGPL-3.0): Full Pine Script v5/v6 transpiler+runtime, 60+ indicators, works in browser
- **PyneCore** (102★, Python, Apache-2.0): Pine Script execution model in Python
- **Pynescript** (86★, Python, LGPL-3.0): Pine Script AST parser (ANTLR4)
- **python-tradingview-ta** (1,222★, Python, MIT): Built-in TradingView indicator values
- **tvdatafeed** (576★, Python, MIT): OHLCV candle data from TradingView
- **lightweight-charts** (14K★, TypeScript, Apache-2.0): Already used in ChartPanel

### Technical Environment
- Windows 11, Python 3.11.9
- React + TypeScript (Vite) frontend — PineTS is a natural fit
- NVIDIA RTX 5050 (8GB VRAM), Ollama with qwen3.5:9b

## Constraints

- **Tech Stack**: Must integrate into existing FastAPI + React architecture (no new frameworks)
- **PineTS License**: AGPL-3.0 — derivative works must be open-sourced (acceptable for this local tool)
- **Browser Execution**: PineTS runs in browser — large datasets may need Web Worker to avoid UI blocking
- **Pine Coverage**: PineTS supports 60+ indicators but not 100% of Pine Script — some advanced features may not work

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| PineTS for local Pine execution | Runs in browser (TypeScript), 60+ indicators, no TradingView dependency, instant results | — Pending |
| Replace TradingView automation with PineTS | PineTS is faster, simpler, works offline, no CAPTCHA/rate limits. Covers ~80% of Pine features | — Pending |
| Auto-run on paste | User's explicit preference for immediate execution, no preview step | — Pending |
| New "Pine Automation" tab | Separates Pine Script execution management from workspace comparison view | — Pending |
| Web Worker for large datasets | PineTS execution on 18K+ candles may block UI thread — offload to Web Worker | — Pending |

---
*Last updated: 2026-03-10 after PineTS approach decision*
