# Alignment Tab — Feature Documentation

## Overview

The Alignment tab provides **pure numeric, per-bar comparison** between Pine Script and Python indicator outputs. It shows exactly where and by how much the two engines diverge, with tolerance controls, summary metrics, mismatch highlighting, and data export. This is a **frontend-only** feature — all data comes from `RunStatus` (Python results) and `pineExecutionState` (Pine results via PineTS).

## Architecture

### Core Computation: `frontend/src/lib/alignment.ts`

Pure functions (zero React dependency):

**Types:**
- `AlignmentToleranceConfig` — `{ absTolerance: number; relTolerance: number }`
- `BarComparison` — `{ barIndex, timestamp, pineValue, pythonValue, delta, percentDiff, withinTolerance }`
- `SeriesAlignmentResult` — `{ seriesName, bars[], totalBars, matchCount, matchPercent, rmse, maxAbsDiff, meanAbsDiff }`
- `AlignmentReport` — `{ seriesResults[], overallMatchPercent, overallRmse, overallMaxDiff, computedAt }`

**Key Functions:**
- `matchSeriesByName(pineSeries, pythonSeries)` — pairs by exact name match, with positional fallback
- `computeSeriesAlignment(pair, tolerance)` — per-bar comparison with delta, %diff, tolerance
- `computeAlignmentReport(pineSeries, pythonSeries, tolerance)` — top-level orchestrator
- `exportAlignmentCSV(results)` — CSV string for download
- `exportAlignmentJSON(report)` — JSON string for download
- `downloadBlob(content, filename, mime)` — triggers browser file download

**Tolerance check** (matches Python's `math.isclose` semantics):
```
withinTolerance = |delta| <= absTol || |delta| <= relTol * |pineValue|
```

**Filtering:** All-null series (where both Pine and Python have all NaN/null values) are excluded from the report to prevent false-positive 100% matches.

### UI Components: `frontend/src/components/alignment/`

- `ToleranceControls.tsx` — Two labeled inputs (absolute 0-1, relative 0-0.1) with range sliders
- `SummaryMetrics.tsx` — 6 metric cards: Total Bars, Match %, RMSE, Max Diff, Mean Diff, Signal Match %
- `OutputTable.tsx` — Per-bar comparison table with series tabs, mismatch row highlighting
- `MismatchReport.tsx` — First 20 mismatches as clickable list → scrolls table to that bar
- `ExportButtons.tsx` — "Export CSV" and "Export JSON" download buttons
- `ComparisonResultPanel.tsx` — Shows the ComparisonEngine results (pass/fail)

### Page: `frontend/src/pages/AlignmentPage.tsx`

Assembles all sub-components. Receives same data as WorkspacePage:
- `currentRun: RunStatus | null`
- `pineCandles: CandlePoint[]`
- `pineExecutionState: { isRunning, indicators, trades, errors, lastRunAt }`
- `pineArtifact` and `pythonArtifact` for code display
- Run selector dropdown

**Layout:**
```
[Header: Run selector]
[ToleranceControls]
[SummaryMetrics row]
[Split-pane: Pine ChartPanel | Python ChartPanel]
[Series tabs → OutputTable]
[MismatchReport | ExportButtons]
```

## Data Flow

1. **Pine data**: PineTS executes in browser → `pineExecution.indicators` (IndicatorSeries[])
2. **Python data**: Backend `python_engine.py` runs `run_strategy(frame)` → `currentRun.python_series`
3. **Alignment**: `computeAlignmentReport()` matches series by name, compares per-bar values
4. **Report**: Computed via `useMemo` — auto-recomputes when tolerance or data changes

## Critical Notes

- Series matching is by **exact name** — Pine `plot(value, title="xxx")` must match Python `frame["xxx"]`
- Positional fallback matching is used when exact names don't match
- Both-null bars are treated as matches (both engines agree on "no data")
- Empty/no-series state shows informative messages
- The `selected_outputs` field in BUILTIN_INDICATORS' Pine code is NOT used for alignment — alignment uses all plotted series

## Route in App.tsx

```tsx
<NavLink to="/alignment">Alignment</NavLink>
<Route path="/alignment" element={<AlignmentPage ... />} />
```

## CSS Classes (in app.css)

- `.alignment-page` — vertical grid layout
- `.alignment-charts` — two-column grid (same as `.split-pane`)
- `.alignment-table-wrapper` — scrollable container
- `.alignment-table` — styled table with alternating rows
- `.bar-match` / `.bar-mismatch` — row background colors
- `.series-tabs` — horizontal tab strip
- `.tolerance-row` — flex layout for controls
- `.metric-highlight-good/warn/bad` — conditional coloring (green/yellow/red)
