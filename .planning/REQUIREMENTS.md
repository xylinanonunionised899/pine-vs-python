# Requirements: Trading Strategy Comparator — Dynamic Pine Script Engine

**Defined:** 2026-03-10
**Core Value:** Any Pine Script pasted into the Pine editor must execute and display its candles + indicators on the Pine screen — fully dynamic, never static.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Pine Execution

- [ ] **PINE-01**: User can paste any Pine Script v5/v6 into the Pine editor and it executes locally via PineTS
- [ ] **PINE-02**: Pine Script execution produces indicator series (EMA, SMA, RSI, MACD, BB, Stoch, ATR, SuperTrend, etc.)
- [ ] **PINE-03**: Pine Script execution produces trade events from strategy.entry/strategy.exit calls
- [ ] **PINE-04**: Pine Script syntax errors display inline in the editor with error location

### Chart Display

- [x] **CHART-01**: Pine screen shows candlestick chart from imported dataset (OHLCV data)
- [x] **CHART-02**: Pine screen overlays indicator series produced by Pine Script execution
- [x] **CHART-03**: Pine screen shows trade markers (buy/sell arrows) from strategy signals

### Integration

- [ ] **INTG-01**: Pine Script auto-runs when user clicks "Run" (immediate, no preview step)
- [ ] **INTG-02**: Pine execution results feed into existing ComparisonEngine for Pine vs Python diff
- [ ] **INTG-03**: Pine execution uses imported dataset (same OHLCV data as Python side)

### UX

- [ ] **UX-01**: New "Pine Automation" tab/page for dedicated Pine Script testing
- [ ] **UX-02**: Execution status indicator (running/complete/error) visible during Pine Script run
- [ ] **UX-03**: Result caching — re-running unchanged Pine Script reuses previous results

### Performance

- [ ] **PERF-01**: Pine Script execution runs in Web Worker to avoid blocking UI on large datasets (18K+ candles)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Extended Pine Coverage

- **PINE-V2-01**: Support Pine Script request.security() for multi-timeframe analysis
- **PINE-V2-02**: Support Pine Script array and matrix operations
- **PINE-V2-03**: Support Pine Script tables, labels, lines, box drawings
- **PINE-V2-04**: TradingView Playwright automation fallback for unsupported Pine features

### Data Sources

- **DATA-V2-01**: Direct TradingView candle data fetch via tvdatafeed (no manual Excel import)
- **DATA-V2-02**: Real-time streaming data from TradingView WebSocket

### Advanced Comparison

- **COMP-V2-01**: Side-by-side synchronized scrolling between Pine and Python charts
- **COMP-V2-02**: Per-bar comparison overlay highlighting divergence points

## Out of Scope

| Feature | Reason |
|---------|--------|
| TradingView browser automation (Playwright) | Replaced by PineTS local execution -- faster, simpler, offline |
| Python strategy engine changes | Already dynamic, no changes needed |
| Real-time live data feed | Focus on replay/historical data for this milestone |
| TradingView alerts/notifications | Not needed for strategy comparison |
| Mobile app | Web-first local tool |
| Multi-user support | Single user local tool |
| TradingView paid API | PineTS eliminates need for TradingView backend |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PINE-01 | Phase 1: PineTS Engine + Data Pipeline | Pending |
| PINE-02 | Phase 1: PineTS Engine + Data Pipeline | Pending |
| PINE-03 | Phase 1: PineTS Engine + Data Pipeline | Pending |
| PINE-04 | Phase 1: PineTS Engine + Data Pipeline | Pending |
| CHART-01 | Phase 2: Chart Rendering + Run Integration | Complete |
| CHART-02 | Phase 2: Chart Rendering + Run Integration | Complete |
| CHART-03 | Phase 2: Chart Rendering + Run Integration | Complete |
| INTG-01 | Phase 2: Chart Rendering + Run Integration | Pending |
| INTG-02 | Phase 3: UX Completion + Comparison + Performance | Pending |
| INTG-03 | Phase 1: PineTS Engine + Data Pipeline | Pending |
| UX-01 | Phase 3: UX Completion + Comparison + Performance | Pending |
| UX-02 | Phase 2: Chart Rendering + Run Integration | Pending |
| UX-03 | Phase 3: UX Completion + Comparison + Performance | Pending |
| PERF-01 | Phase 3: UX Completion + Comparison + Performance | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after roadmap creation*
