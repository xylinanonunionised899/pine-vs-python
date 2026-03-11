---
phase: 02-chart-rendering-run-integration
plan: 01
subsystem: ui
tags: [lightweight-charts, react, multi-pane, trade-markers, candlestick, oscillators]

# Dependency graph
requires:
  - phase: 01-pinets-engine-data-pipeline
    provides: IndicatorSeries with pane field, TradeEvent objects from PineTS execution
provides:
  - Multi-pane chart rendering (overlays on main pane, oscillators on sub-pane)
  - Trade event arrow markers on candlestick chart via createSeriesMarkers
  - Dynamic chart height (300px base, 420px with sub-pane)
affects: [02-02-PLAN, phase-3-ux-completion]

# Tech tracking
tech-stack:
  added: []
  patterns: [paneIndex-based multi-pane rendering, createSeriesMarkers for trade arrows, pane-field classification]

key-files:
  created: []
  modified:
    - frontend/src/components/charts/ChartPanel.tsx

key-decisions:
  - "Used series.pane field as primary classifier with isPriceLikeSeries as fallback for overlay vs sub-pane"
  - "Removed .slice(0,3) overlay limit to show all price-like indicators"
  - "Single sub-pane (pane 1) for all oscillators rather than one pane per oscillator"

patterns-established:
  - "paneIndex pattern: overlays on pane 0, oscillators on pane 1 with 120px height"
  - "tradesToMarkers pattern: convert TradeEvent[] to sorted SeriesMarker<Time>[] for createSeriesMarkers"

requirements-completed: [CHART-01, CHART-02, CHART-03]

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 2 Plan 1: Multi-Pane Oscillator Rendering + Trade Markers Summary

**Multi-pane chart with oscillator sub-pane via paneIndex and buy/sell arrow markers via createSeriesMarkers on lightweight-charts v5**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-11T05:14:20Z
- **Completed:** 2026-03-11T05:15:45Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Oscillator indicators (RSI, MACD, Stoch) now render in a 120px sub-pane below the main candlestick chart instead of being silently hidden
- Trade events render as colored buy/sell arrow markers (green arrowUp for entries, red arrowDown for exits) at correct bar positions
- Chart height adjusts dynamically: 300px for price-only charts, 420px when sub-pane indicators are present
- Backward compatible: Python chart (no trades, no sub-pane series) renders identically to before

## Task Commits

Each task was committed atomically:

1. **Task 1: Add multi-pane oscillator rendering and trade markers to ChartPanel** - `35be305` (feat)

**Plan metadata:** `841e24c` (docs: complete plan)

## Files Created/Modified
- `frontend/src/components/charts/ChartPanel.tsx` - Extended with multi-pane rendering (paneIndex=1 for oscillators), trade arrow markers (createSeriesMarkers), dynamic chart height, and updated summary box

## Decisions Made
- Used `series.pane === "sub"` as primary classifier combined with `isPriceLikeSeries()` fallback -- this respects the pane field set by pineExecutionService while keeping backward compatibility for series without a pane field
- Removed the `.slice(0, 3)` limit on overlay series -- research confirmed all overlays can render safely without performance issues
- Used a single sub-pane (pane 1) for all oscillator indicators rather than one pane per oscillator -- keeps the chart compact and avoids excessive vertical scrolling

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ChartPanel now accepts optional `trades` prop and renders sub-pane indicators
- Plan 02-02 can wire the trades from PineExecutionService state into ChartPanel
- Plan 02-02 can add the Run button and execution status indicator

## Self-Check: PASSED

- FOUND: frontend/src/components/charts/ChartPanel.tsx
- FOUND: commit 35be305
- FOUND: 02-01-SUMMARY.md

---
*Phase: 02-chart-rendering-run-integration*
*Completed: 2026-03-11*
