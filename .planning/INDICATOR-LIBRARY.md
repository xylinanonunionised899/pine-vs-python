# Indicator Library — Feature Documentation

## Overview

The Indicator Library is a feature that provides pre-built and user-saved trading indicators with **both Pine Script v5 and Python code**, stored as actual files on disk. Users can browse, filter, load indicators into the Workspace, and save their own custom strategies for future use.

## Architecture

### Storage Structure
```
data/indicators/
├── index.json              # JSON array of all indicator metadata
├── ema-crossover/
│   ├── indicator.pine      # Pine Script v5 source
│   └── indicator.py        # Python source (run_strategy function)
├── rsi/
│   ├── indicator.pine
│   └── indicator.py
├── macd/
│   ├── indicator.pine
│   └── indicator.py
├── super-trend/
│   ├── indicator.pine
│   └── indicator.py
├── bollinger-bands/
│   ├── indicator.pine
│   └── indicator.py
└── vwap-3-band/
    ├── indicator.pine
    └── indicator.py
```

### Backend

**Service**: `backend/app/services/indicator_service.py`
- `IndicatorService` class with CRUD: `list_indicators()`, `get()`, `save()`, `delete()`
- `_seed_builtins()` — seeds 6 built-in indicators on first run (if index.json missing)
- `_sanitize_folder_name()` — converts indicator names to filesystem-safe folder names
- `BUILTIN_INDICATORS` — constant list with all 6 pre-built indicator definitions
- Singleton: `indicator_service = IndicatorService()` at module bottom

**API Router**: `backend/app/api/indicators.py`
- `GET /indicators` — list all indicators
- `GET /indicators/{indicator_id}` — get single indicator
- `POST /indicators` — save new indicator (requires `name` + at least one of `pine_code`/`python_code`)
- `DELETE /indicators/{indicator_id}` — delete (only non-builtin)

**Shared Contracts**: `shared/python/contracts.py` + `shared/typescript/contracts.ts`
- `IndicatorCategory` enum: trend, momentum, volatility, volume, custom
- `IndicatorLibraryEntry` model: indicator_id, name, description, category, pine_code, python_code, series_names, is_builtin, created_at, updated_at

### Frontend

**Library Page**: `frontend/src/pages/IndicatorLibraryPage.tsx`
- Grid of indicator cards with name, category badge, description, series names
- Category filter pills (All, Trend, Momentum, Volatility, Volume, Custom) with counts
- Search bar filtering by name/description/series
- "Load to Workspace" button per card → populates Pine + Python editors
- "Delete" button for custom (non-builtin) indicators

**Workspace Integration**: `frontend/src/pages/WorkspacePage.tsx`
- "Save to Library" button in toolbar (with `marginLeft: "auto"`)
- Inline save form: name, description, category select dropdown
- `onSaveToLibrary` prop: `(name, description, category) => void`

**App Wiring**: `frontend/src/app/App.tsx`
- `indicators: IndicatorLibraryEntry[]` in AppState
- `listIndicators()` in `refreshCore()` via Promise.allSettled
- NavLink: `<NavLink to="/library">Library</NavLink>`
- Route: `<Route path="/library" element={<IndicatorLibraryPage ... />} />`
- Handlers: `handleSaveToLibrary`, `handleLoadIndicator`, `handleDeleteIndicator`
- `handleLoadIndicator` sets both `pineArtifact.source_code` and `pythonArtifact.source_code`, then navigates to `/workspace`

**API Functions**: `frontend/src/services/api.ts`
- `listIndicators()`, `getIndicator()`, `saveIndicator()`, `deleteIndicator()`

## Pre-Built Indicators (6 total)

### 1. EMA Crossover (category: trend)
- **Series**: `ema_fast`, `ema_slow`, `long_condition`
- **Logic**: Fast EMA(9) vs Slow EMA(21). Long when fast > slow.
- **Python**: `ewm(span=9)` and `ewm(span=21)` with `adjust=False`

### 2. RSI (category: momentum)
- **Series**: `rsi`, `long_condition`, `short_condition`
- **Logic**: RSI(14). Long when RSI crosses above 30, short when crosses below 70.
- **Python**: Wilder's smoothing via `ewm(alpha=1/14)`. Crossover = current > threshold & prev <= threshold.

### 3. MACD (category: momentum)
- **Series**: `macd_line`, `signal_line`, `histogram`, `long_condition`
- **Logic**: MACD(12, 26, 9). Long when MACD crosses above signal.
- **Python**: EMA(12) - EMA(26), signal = EMA(9) of MACD.

### 4. Super Trend (category: trend)
- **Series**: `supertrend`, `direction`, `long_condition`
- **Logic**: ATR-based (factor=3, period=10). Long when price above supertrend (direction == -1).
- **Python**: Manual ATR + upper/lower band tracking with direction flip logic.
- **CRITICAL FIX**: `st[0]` must be initialized to `final_upper[0]` and `direction[0]` to `1.0` before the loop, otherwise all values stay NaN.

### 5. Bollinger Bands (category: volatility)
- **Series**: `bb_middle`, `bb_upper`, `bb_lower`, `long_condition`
- **Logic**: SMA(20) ± 2×StdDev. Long when close crosses above lower band.
- **Python**: `rolling(20).mean()` and `rolling(20).std()`.

### 6. VWAP 3-Band (category: volume)
- **Series**: `vwap`, `vwap_upper1`, `vwap_lower1`, `vwap_upper2`, `vwap_lower2`, `vwap_upper3`, `vwap_lower3`, `long_condition`
- **Logic**: Cumulative VWAP with 1x/2x/3x stddev bands. Long when close < lower band 1.
- **Python**: `(typical * volume).cumsum() / volume.cumsum()` for VWAP.

## Pine ↔ Python Alignment Rules

For Pine and Python indicators to align in the Alignment tab:

1. **Series name matching**: Pine `plot(value, title="xxx")` title must exactly match Python `frame["xxx"]` column name
2. **Boolean conditions**: Pine outputs `long_cond ? 1 : 0` (numeric), Python outputs boolean which gets converted to 1.0/0.0
3. **EMA semantics**: Both must use `adjust=False` for pandas EWM to match Pine's `ta.ema()`
4. **RSI smoothing**: Use Wilder's smoothing (`alpha=1/period`) not simple EWM
5. **Crossover logic**: `ta.crossover(a, b)` = current `a > b` AND previous `a <= b`
6. **Trade events**: Python engine checks for `long_condition` column to generate TradeEvents

## Test Script

`test_indicators.py` at project root — loads SBIN dataset (18,850 rows), executes each strategy's Python code, verifies expected columns exist and have non-null values.

## Verification Results (2026-03-11)

All 6 Python strategies pass:
- EMA Crossover: 18,850/18,850 non-null
- RSI: 18,836/18,850 non-null (14 bar warmup)
- MACD: 18,850/18,850 non-null
- Super Trend: 18,841/18,850 non-null (10 bar ATR warmup)
- Bollinger Bands: 18,831/18,850 non-null (20 bar warmup)
- VWAP 3-Band: 18,850/18,850 non-null

TypeScript: zero errors. Vite build: succeeds.
