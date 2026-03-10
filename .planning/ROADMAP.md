# Roadmap: Trading Strategy Comparator — Dynamic Pine Script Engine

## Overview

This milestone adds dynamic Pine Script execution to the Trading Strategy Comparator via PineTS (TypeScript transpiler+runtime). The work moves from engine integration (PineTS installed, transpiling Pine Script against OHLCV data, producing outputs) to chart visualization (candles, indicators, trade markers rendered on the Pine screen) to UX completion (Pine Automation tab, caching, comparison integration, Web Worker performance). Every phase builds on the previous -- PineTS must execute before charts can render, charts must render before UX polish matters.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: PineTS Engine + Data Pipeline** - Install PineTS, transpile+execute Pine Script against imported OHLCV data, produce indicator series and trade events
- [ ] **Phase 2: Chart Rendering + Run Integration** - Display execution results as candles, indicator overlays, and trade markers on Pine screen with Run button
- [ ] **Phase 3: UX Completion + Comparison + Performance** - Pine Automation tab, result caching, ComparisonEngine integration, Web Worker for large datasets

## Phase Details

### Phase 1: PineTS Engine + Data Pipeline
**Goal**: Users can paste any Pine Script into the editor and it executes locally in the browser via PineTS, producing indicator series and trade events from imported OHLCV data, with syntax errors shown inline
**Depends on**: Nothing (first phase)
**Requirements**: PINE-01, PINE-02, PINE-03, PINE-04, INTG-03
**Success Criteria** (what must be TRUE):
  1. User can paste a Pine Script v5/v6 strategy into the Pine editor, and PineTS transpiles+executes it without leaving the browser
  2. Execution of a script containing indicator calls (EMA, SMA, RSI, MACD, BB, Stoch, ATR, SuperTrend) produces correct indicator series arrays
  3. Execution of a script containing strategy.entry/strategy.exit calls produces trade event objects with direction, bar index, and price
  4. A Pine Script with syntax errors shows the error message and location inline in the Monaco editor (red underline or gutter marker)
  5. PineTS execution uses the imported SBIN_5.xlsx dataset (18,850 OHLCV candles) as its data source, not hardcoded data
**Plans**: TBD

Plans:
- [ ] 01-01: PineTS installation, TypeScript integration, and basic transpile+execute pipeline
- [ ] 01-02: Dataset feeding, indicator series extraction, trade event extraction, and error handling

### Phase 2: Chart Rendering + Run Integration
**Goal**: Users see Pine Script execution results visually on the Pine screen -- candlestick chart from dataset, indicator overlays from execution, trade markers from strategy signals -- triggered by clicking Run
**Depends on**: Phase 1
**Requirements**: CHART-01, CHART-02, CHART-03, INTG-01, UX-02
**Success Criteria** (what must be TRUE):
  1. Pine screen displays a candlestick chart rendered from the imported OHLCV dataset using lightweight-charts
  2. Indicator series produced by PineTS (e.g., EMA lines, Bollinger Bands, RSI subplot) appear as overlays on the candlestick chart
  3. Trade events (strategy.entry/exit) appear as buy/sell arrow markers on the chart at the correct bar positions
  4. User clicks a "Run" button and Pine Script executes immediately -- no preview step, no confirmation dialog
  5. An execution status indicator (running spinner / complete checkmark / error icon) is visible while Pine Script runs and after it finishes
**Plans**: TBD

Plans:
- [ ] 02-01: Candlestick chart rendering from dataset and indicator overlay on Pine screen
- [ ] 02-02: Trade markers, Run button integration, and execution status indicator

### Phase 3: UX Completion + Comparison + Performance
**Goal**: Users have a dedicated Pine Automation tab, cached results for unchanged scripts, Pine vs Python comparison through the existing ComparisonEngine, and non-blocking execution on large datasets via Web Worker
**Depends on**: Phase 2
**Requirements**: UX-01, UX-03, INTG-02, PERF-01
**Success Criteria** (what must be TRUE):
  1. A "Pine Automation" tab/page exists in the app navigation, providing a dedicated space for Pine Script testing separate from the workspace comparison view
  2. Re-running an unchanged Pine Script reuses cached results instantly instead of re-executing (user sees immediate results, no spinner)
  3. Pine execution results feed into the existing ComparisonEngine, and the user can view Pine vs Python strategy diffs in the comparison view
  4. Pine Script execution on the full 18,850-candle dataset does not freeze the UI -- execution runs in a Web Worker with progress feedback
**Plans**: TBD

Plans:
- [ ] 03-01: Pine Automation tab, result caching, ComparisonEngine integration, and Web Worker execution

## Progress

**Execution Order:**
Phases execute in numeric order: 1 --> 2 --> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. PineTS Engine + Data Pipeline | 0/2 | Not started | - |
| 2. Chart Rendering + Run Integration | 0/2 | Not started | - |
| 3. UX Completion + Comparison + Performance | 0/1 | Not started | - |
