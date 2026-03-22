# File Map — Trading Strategy Comparator

## Project Root: `D:\python , pine script\`

### Backend (`backend/app/`)

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app entry point. Registers all routers (runs, pine_bridge, comparison, data_sources, chat, permissions, **indicators**) |
| `core/settings.py` | App settings, data_root path |
| `api/runs.py` | Run CRUD + replay/live endpoints |
| `api/pine_bridge.py` | Pine bridge artifact endpoints |
| `api/comparison.py` | Comparison engine endpoint |
| `api/data_sources.py` | Dataset import/preview/candle endpoints |
| `api/chat.py` | Ollama LLM chat endpoint |
| `api/permissions.py` | Permission grant/revoke endpoints |
| **`api/indicators.py`** | **Indicator library CRUD endpoints (GET/POST/DELETE)** |
| `services/run_service.py` | Run orchestration (python_engine, comparison) |
| `services/dataset_service.py` | Dataset storage + candle loading |
| `services/bridge_service.py` | Pine bridge artifact management |
| `services/chat_service.py` | LLM chat service |
| `services/storage.py` | Generic JSON index + file storage |
| **`services/indicator_service.py`** | **Indicator library service + 6 BUILTIN_INDICATORS** |
| `engines/python_engine.py` | Executes Python strategies via `exec()` + `run_strategy(frame)` |
| `engines/pine_local_engine.py` | Pine Script validation (keyword check only) |
| `engines/pine_bridge_engine.py` | Pine bridge handshake |
| `engines/comparison_engine.py` | Compares Pine vs Python outputs |

### Frontend (`frontend/src/`)

| File | Purpose |
|------|---------|
| `app/App.tsx` | Root component. All state, routing, handlers. 6 nav tabs. |
| `main.tsx` | Vite entry point |
| `styles/app.css` | All CSS (theme vars, layout, components, alignment styles) |

#### Pages
| File | Purpose |
|------|---------|
| `pages/ImportsPage.tsx` | Dataset import (Excel/CSV) + saved dataset list |
| `pages/WorkspacePage.tsx` | Dual editors, dual charts, comparison, LLM chat, **Save to Library** |
| `pages/RunsPage.tsx` | Run history list |
| `pages/SettingsPage.tsx` | Bridge artifacts, model selection |
| **`pages/AlignmentPage.tsx`** | **Per-bar Pine vs Python alignment comparison** |
| **`pages/IndicatorLibraryPage.tsx`** | **Indicator library browser with cards, filters, search** |

#### Components
| File | Purpose |
|------|---------|
| `components/charts/ChartPanel.tsx` | Lightweight-charts candlestick + indicator overlays + trade markers |
| `components/editors/PineEditor.tsx` | Monaco editor for Pine Script |
| `components/editors/PythonEditor.tsx` | Monaco editor for Python |
| `components/editors/StrategyEditor.tsx` | Combined editor wrapper |
| `components/comparison/DiffPanel.tsx` | Comparison result display |
| `components/comparison/ApprovalQueue.tsx` | LLM permission management |
| `components/chat/LLMChat.tsx` | Ollama chat panel |
| **`components/alignment/ToleranceControls.tsx`** | **Absolute + relative tolerance sliders** |
| **`components/alignment/SummaryMetrics.tsx`** | **6 metric stat cards** |
| **`components/alignment/OutputTable.tsx`** | **Per-bar comparison data table with series tabs** |
| **`components/alignment/MismatchReport.tsx`** | **Clickable mismatch list** |
| **`components/alignment/ExportButtons.tsx`** | **CSV + JSON export buttons** |
| **`components/alignment/ComparisonResultPanel.tsx`** | **Pass/fail comparison display** |

#### Services & Libs
| File | Purpose |
|------|---------|
| `services/api.ts` | All API fetch functions (including **indicator CRUD**) |
| `services/websocket.ts` | WebSocket stream for live runs |
| `services/pineExecutionService.ts` | PineTS transpile + execute |
| `hooks/usePineExecution.ts` | React hook for Pine execution state |
| **`lib/alignment.ts`** | **Pure alignment computation (types, matching, RMSE, export)** |
| `lib/defaults.ts` | Default state values |
| `lib/pineDataAdapter.ts` | Converts candle data for PineTS |

### Shared (`shared/`)
| File | Purpose |
|------|---------|
| `python/contracts.py` | Pydantic models (RunStatus, IndicatorSeries, TradeEvent, **IndicatorLibraryEntry**, **IndicatorCategory**) |
| `typescript/contracts.ts` | Mirror TypeScript types |

### Data (`data/`)
| Path | Purpose |
|------|---------|
| `data/artifacts/` | Bridge artifacts, permissions JSON |
| `data/datasets/` | Imported dataset CSV files + index |
| `data/runs/` | Run result JSON files + index |
| **`data/indicators/`** | **Indicator library: index.json + per-indicator folders with .pine + .py files** |

### Config
| File | Purpose |
|------|---------|
| `.claude/launch.json` | Preview server config (vayu-frontend on port 5173) |
| `frontend/vite.config.ts` | Vite config with shared alias |
| `frontend/tsconfig.json` | TypeScript config |

### Test
| File | Purpose |
|------|---------|
| **`test_indicators.py`** | **Tests all 6 Python strategies execute with SBIN dataset** |

### Planning (`.planning/`)
| File | Purpose |
|------|---------|
| `PROJECT.md` | Project overview, requirements, decisions |
| `ROADMAP.md` | 3-phase roadmap with progress |
| `REQUIREMENTS.md` | Detailed requirements |
| `STATE.md` | Current project state + velocity |
| **`INDICATOR-LIBRARY.md`** | **Indicator library feature docs** |
| **`ALIGNMENT-TAB.md`** | **Alignment tab feature docs** |
| **`BUGS-FIXED.md`** | **Bug fix log with root causes** |
| **`FILE-MAP.md`** | **This file** |
