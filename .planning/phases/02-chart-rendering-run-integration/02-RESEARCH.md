# Phase 2: Chart Rendering + Run Integration - Research

**Researched:** 2026-03-11
**Domain:** lightweight-charts v5 candlestick rendering, multi-pane indicators, trade markers, Run button integration
**Confidence:** HIGH

## Summary

Phase 2 takes the PineTS execution pipeline built in Phase 1 (which already produces `IndicatorSeries[]` and `TradeEvent[]`) and renders those results visually on the Pine screen. The existing `ChartPanel` component already renders candlestick charts with line indicator overlays using lightweight-charts v5.1.0. Phase 2 extends this in three directions: (1) multi-pane support for oscillators like RSI/MACD that live below the price chart, (2) trade markers (buy/sell arrows) rendered on the candlestick chart using the v5 `createSeriesMarkers` primitive, and (3) a refined Run button with execution status indicator.

The project already has a working "Run Pine" button in `WorkspacePage.tsx` that calls `usePineExecution` hook, which calls `PineExecutionService.executePineScript()`. The existing flow loads candles from the backend, executes PineTS, and feeds `indicators` to `ChartPanel`. However, the current `ChartPanel` has limitations: it only renders price-like overlays (lines on the main pane) and silently hides oscillator-range indicators (RSI, MACD, Stochastic) because they fail the `isPriceLikeSeries()` check. It also does not render trade markers at all -- `TradeEvent[]` data exists in state but is never passed to the chart.

lightweight-charts v5.1.0 (already installed) has native multi-pane support via the `paneIndex` parameter on `addSeries()` and a `createSeriesMarkers()` function for buy/sell arrow markers. Both features are available in the installed package without any new dependencies. The primary work is refactoring `ChartPanel` to use panes for oscillator series, adding marker rendering for trade events, and improving the execution status UX.

**Primary recommendation:** Extend the existing `ChartPanel` to support multi-pane rendering (oscillators in sub-panes via `addSeries(LineSeries, options, 1)`), add trade markers via `createSeriesMarkers()`, and enhance the Run button with a visible status indicator (spinner/checkmark/error). No new npm packages are needed -- everything is available in lightweight-charts v5.1.0.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHART-01 | Pine screen shows candlestick chart from imported dataset (OHLCV data) | Already working in current `ChartPanel` -- candles render from `pineChartCandles` prop; uses `CandlestickSeries` from lightweight-charts v5 |
| CHART-02 | Pine screen overlays indicator series produced by Pine Script execution | Partially working -- price-like overlays (EMA, SMA, BB) render as `LineSeries`; oscillators (RSI, MACD, Stoch) are hidden by `isPriceLikeSeries()` filter; need multi-pane via `addSeries(series, options, paneIndex)` for sub-pane indicators |
| CHART-03 | Pine screen shows trade markers (buy/sell arrows) from strategy signals | Not implemented; `TradeEvent[]` exists in `pineExecutionState.trades` but is never passed to `ChartPanel`; lightweight-charts v5 `createSeriesMarkers()` provides `arrowUp`/`arrowDown` marker shapes with `belowBar`/`aboveBar` positioning |
| INTG-01 | Pine Script auto-runs when user clicks "Run" (immediate, no preview step) | Already working -- "Run Pine" button in `WorkspacePage` calls `handleRunPine()` which invokes `pineExecution.runPine()` directly with no preview/confirmation; needs status indicator refinement only |
| UX-02 | Execution status indicator (running/complete/error) visible during Pine Script run | Partially working -- button text changes to "Running Pine..." while executing; needs dedicated visual status indicator (spinner, checkmark, error icon) separate from button text |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lightweight-charts | 5.1.0 | Candlestick chart, line overlays, multi-pane, markers | Already installed; native multi-pane via `paneIndex` param; `createSeriesMarkers()` for trade arrows; no wrapper needed -- direct API in React useEffect |
| react | 19.1.1 | UI framework | Already installed; chart rendering via useEffect + useRef pattern (already established in ChartPanel) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @monaco-editor/react | ^4.7.0 | Pine editor with error markers | Already installed; Phase 1 wired error markers; no changes needed for Phase 2 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct lightweight-charts API | lightweight-charts-react-wrapper (npm) | Adds abstraction layer; existing ChartPanel already uses direct API well; wrapper adds dependency for no clear benefit |
| Direct lightweight-charts API | react-financial-charts | Heavyweight; TradingView-style but 200KB+ bundle; overkill when lightweight-charts already does everything needed |
| createSeriesMarkers() | Custom HTML overlay div markers | More control over styling but fights the chart coordinate system; createSeriesMarkers handles time-to-pixel mapping, scrolling, zooming automatically |
| Multi-pane via addSeries paneIndex | Separate chart instances stacked vertically | Loses synchronized time scale, crosshair sync, zoom sync; native panes handle all of this automatically |

**Installation:**
```bash
# No new packages needed -- everything already installed
```

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
  components/
    charts/
      ChartPanel.tsx              # MODIFY: add multi-pane, trade markers, accept trades prop
  pages/
    WorkspacePage.tsx             # MODIFY: pass trades to ChartPanel, add execution status indicator
  app/
    App.tsx                       # MINOR: pass trades through (may already be wired)
```

### Pattern 1: Multi-Pane Oscillator Rendering
**What:** Render oscillator indicators (RSI, MACD, Stoch, ATR) in a separate sub-pane below the candlestick chart, using the same chart instance
**When to use:** When `IndicatorSeries.pane === "sub"` (already classified by `pineExecutionService.ts` oscillator pattern matching)
**Example:**
```typescript
// Source: lightweight-charts v5.1.0 typings (installed) + official docs
// https://tradingview.github.io/lightweight-charts/tutorials/how_to/panes
import { createChart, CandlestickSeries, LineSeries, type Time } from "lightweight-charts";

const chart = createChart(container, { /* options */ });

// Main pane (pane 0): candlestick series
const candleSeries = chart.addSeries(CandlestickSeries, {
  upColor: "#20c997",
  downColor: "#ff6b6b",
});
candleSeries.setData(candleData);

// Main pane overlays (pane 0): price-like indicators (EMA, SMA, BB)
overlaySeries.forEach((series) => {
  const line = chart.addSeries(LineSeries, {
    color: series.style.color as string,
    lineWidth: 2,
    priceLineVisible: false,
  }); // paneIndex defaults to 0
  line.setData(series.values.filter(v => v.value != null).map(v => ({
    time: toChartTime(v.timestamp),
    value: v.value as number,
  })));
});

// Sub-pane (pane 1): oscillator indicators (RSI, MACD, etc.)
subPaneSeries.forEach((series) => {
  const line = chart.addSeries(LineSeries, {
    color: series.style.color as string,
    lineWidth: 2,
    priceLineVisible: true,
    lastValueVisible: true,
  }, 1); // paneIndex = 1 creates a new pane automatically
  line.setData(series.values.filter(v => v.value != null).map(v => ({
    time: toChartTime(v.timestamp),
    value: v.value as number,
  })));
});

// Optional: set sub-pane height
const subPane = chart.panes()[1];
if (subPane) {
  subPane.setHeight(120);
}
```

**Key detail:** The `paneIndex` parameter on `addSeries()` is the third positional argument: `chart.addSeries(SeriesType, options, paneIndex)`. If the pane does not exist yet, it is created automatically. If all series are removed from a pane, it is automatically removed.

### Pattern 2: Trade Markers via createSeriesMarkers
**What:** Render buy/sell arrow markers on the candlestick chart at trade event positions
**When to use:** When `TradeEvent[]` from PineTS execution contains trade signals
**Example:**
```typescript
// Source: lightweight-charts v5.1.0 typings (verified in installed package)
// https://tradingview.github.io/lightweight-charts/docs/api/functions/createSeriesMarkers
import { createSeriesMarkers, type SeriesMarker, type Time } from "lightweight-charts";

// Map TradeEvent[] to SeriesMarker[]
function tradesToMarkers(trades: TradeEvent[]): SeriesMarker<Time>[] {
  return trades.map((trade) => {
    const isEntry = trade.side === "long_entry" || trade.side === "short_entry";
    const isLong = trade.side === "long_entry" || trade.side === "long_exit";
    return {
      time: Math.floor(new Date(trade.timestamp).getTime() / 1000) as Time,
      position: isEntry ? "belowBar" : "aboveBar",
      shape: isEntry ? "arrowUp" : "arrowDown",
      color: isLong
        ? (isEntry ? "#20c997" : "#ff6b6b")  // green entry, red exit
        : (isEntry ? "#ff6b6b" : "#20c997"),  // red entry (short), green exit (cover)
      text: trade.side.replace("_", " "),
    };
  });
}

// After creating candleSeries and setting data:
const markers = tradesToMarkers(trades);
if (markers.length > 0) {
  // markers must be sorted by time
  markers.sort((a, b) => (a.time as number) - (b.time as number));
  createSeriesMarkers(candleSeries, markers);
}
```

**Key details:**
- `createSeriesMarkers()` is a standalone function, NOT a method on the series. Import it from `lightweight-charts`.
- Returns `ISeriesMarkersPluginApi` with `setMarkers()` for dynamic updates and `markers()` for reading.
- Markers auto-position vertically based on bar high/low values and the `position` property.
- Available shapes: `"arrowUp"`, `"arrowDown"`, `"circle"`, `"square"`.
- Available positions: `"aboveBar"`, `"belowBar"`, `"inBar"`, `"atPriceTop"`, `"atPriceBottom"`, `"atPriceMiddle"`.
- Markers must be sorted by time ascending.
- The `text` property adds a label above/below the marker shape.

### Pattern 3: React Chart Lifecycle with Multi-Pane + Markers
**What:** Properly manage chart, series, panes, and markers in React useEffect with cleanup
**When to use:** In the refactored ChartPanel component
**Example:**
```typescript
useEffect(() => {
  if (!chartRef.current || candles.length === 0) return;

  // 1. Create chart
  const chart = createChart(chartRef.current, chartOptions);

  // 2. Add candlestick series (pane 0)
  const candleSeries = chart.addSeries(CandlestickSeries, candleOptions);
  candleSeries.setData(candleData);

  // 3. Add overlay indicators (pane 0)
  overlaySeries.forEach((series) => {
    const line = chart.addSeries(LineSeries, lineOptions);
    line.setData(lineData);
  });

  // 4. Add sub-pane indicators (pane 1)
  subPaneSeries.forEach((series, index) => {
    const line = chart.addSeries(LineSeries, lineOptions, 1);
    line.setData(lineData);
  });

  // 5. Add trade markers
  if (tradeMarkers.length > 0) {
    createSeriesMarkers(candleSeries, tradeMarkers);
  }

  // 6. Fit content and observe resize
  chart.timeScale().fitContent();
  const resizeObserver = new ResizeObserver(() => {
    if (chartRef.current) {
      chart.applyOptions({ width: chartRef.current.clientWidth });
    }
  });
  resizeObserver.observe(chartRef.current);

  // 7. Cleanup
  return () => {
    resizeObserver.disconnect();
    chart.remove(); // removes all series, panes, markers
  };
}, [candles, overlaySeries, subPaneSeries, tradeMarkers, tone]);
```

**Key detail:** `chart.remove()` cleans up everything -- series, panes, markers, ResizeObserver is cleaned up separately. No need to individually remove markers or panes.

### Pattern 4: Series Classification (Overlay vs Sub-Pane)
**What:** Classify indicator series into overlays (on price chart) vs sub-pane (separate oscillator pane)
**When to use:** When mapping PineTS output to chart rendering
**Example:**
```typescript
// Already partially implemented in ChartPanel via isPriceLikeSeries()
// The pineExecutionService.ts also classifies via oscillatorPatterns regex

type ClassifiedSeries = {
  overlaySeries: IndicatorSeries[];  // price-like: EMA, SMA, BB bands
  subPaneSeries: IndicatorSeries[];  // oscillators: RSI, MACD, Stoch, ATR
};

function classifySeries(
  indicatorSeries: IndicatorSeries[],
  candles: CandlePoint[],
): ClassifiedSeries {
  const overlaySeries: IndicatorSeries[] = [];
  const subPaneSeries: IndicatorSeries[] = [];

  for (const series of indicatorSeries) {
    // Use the pane classification from pineExecutionService (already set)
    if (series.pane === "sub") {
      subPaneSeries.push(series);
    } else if (isPriceLikeSeries(series, candles)) {
      overlaySeries.push(series);
    } else {
      // Fallback: if not price-like and not explicitly "sub", treat as sub-pane
      subPaneSeries.push(series);
    }
  }

  return { overlaySeries, subPaneSeries };
}
```

**Key detail:** The `pineExecutionService.ts` already assigns `pane: "sub"` to series whose names match oscillator patterns (`/rsi|macd|stoch|histogram|momentum|cci|atr|adx|willr|mfi/i`). The existing `isPriceLikeSeries()` in `ChartPanel.tsx` does a numerical range check. Combining both gives robust classification. The current `hiddenSeries` bucket should become `subPaneSeries` instead.

### Anti-Patterns to Avoid
- **Separate chart instances for sub-panes:** Two `createChart()` calls lose crosshair sync, time scale sync, and zoom sync. Use `paneIndex` on `addSeries()` instead.
- **Manually positioning markers with pixel coordinates:** `createSeriesMarkers()` handles time-to-pixel mapping, scrolling, and scaling automatically. Never compute pixel positions.
- **Destroying and recreating chart on every indicator change:** Use the React useEffect dependency array correctly. The chart should recreate when `candles`, `overlaySeries`, `subPaneSeries`, or `tradeMarkers` change.
- **Putting all sub-pane indicators in the same pane:** RSI (0-100 range) and MACD (unbounded range) have different scales. Putting them in the same sub-pane distorts one. Consider separate sub-panes (pane 1, pane 2) for indicators with incompatible scales, or limit to one sub-pane indicator at a time.
- **Forgetting to sort markers by time:** `createSeriesMarkers()` requires markers sorted in ascending time order. Unsorted markers produce rendering artifacts or errors.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Trade arrow markers on chart | Custom HTML/SVG overlay div with position calculations | `createSeriesMarkers()` from lightweight-charts | Handles zoom, scroll, time-to-pixel mapping, auto-scaling, all for free |
| Oscillator sub-panes | Separate chart instances stacked with CSS | `addSeries(type, options, paneIndex)` | Native pane management: crosshair sync, time scale sync, auto-create/remove panes |
| Chart coordinate mapping | Manual canvas-to-data coordinate conversion | lightweight-charts built-in coordinate API | Chart handles DPI, scrolling, zoom transforms internally |
| Execution status spinner | Custom CSS animation from scratch | Simple conditional rendering with CSS `@keyframes` or Unicode spinner | Spinner is a 3-line CSS pattern; no library needed |
| Marker position calculation | Computing y-position from price values | `position: "aboveBar"` / `"belowBar"` in marker config | lightweight-charts reads high/low from candlestick data and positions automatically |

**Key insight:** lightweight-charts v5 is a complete charting solution. Every rendering feature Phase 2 needs (multi-pane, markers, crosshair sync) is built in. The work is mapping existing data structures to chart API calls, not building chart infrastructure.

## Common Pitfalls

### Pitfall 1: Markers Not Sorted by Time
**What goes wrong:** `createSeriesMarkers()` renders markers incorrectly or throws when markers array is not sorted in ascending time order.
**Why it happens:** `TradeEvent[]` from PineTS may not be time-ordered if multiple trade types (entry/exit) are interleaved or if the extraction logic processes them out of order.
**How to avoid:** Always sort markers by time before passing to `createSeriesMarkers()`: `markers.sort((a, b) => (a.time as number) - (b.time as number))`.
**Warning signs:** Markers appear at wrong positions or the chart throws a console error.

### Pitfall 2: Sub-Pane Height Crushing Main Chart
**What goes wrong:** When a sub-pane is added (pane 1), it takes half the chart height by default, crushing the candlestick view.
**Why it happens:** lightweight-charts divides available height equally between panes unless explicitly configured.
**How to avoid:** Set sub-pane height explicitly after creation: `chart.panes()[1]?.setHeight(120)`. Keep the main pane at least 60-70% of total height. Consider increasing overall chart container height from 300px to 400-450px when sub-panes are present.
**Warning signs:** Candlestick chart appears very short when oscillator indicators are active.

### Pitfall 3: Re-creating Chart on Every Render
**What goes wrong:** Chart flickers, loses scroll/zoom position, and performance degrades.
**Why it happens:** React useEffect without proper dependency array re-creates the chart on every state change.
**How to avoid:** Only include data-affecting dependencies in the useEffect array (`candles`, `overlaySeries`, `subPaneSeries`, `tradeMarkers`, `tone`). Do NOT include callback functions or state setters.
**Warning signs:** Visible chart flash on any interaction, scroll position resetting.

### Pitfall 4: Stale Trade Data After Re-Execution
**What goes wrong:** Old trade markers persist on chart after Pine Script is edited and re-run with different strategy logic.
**Why it happens:** `createSeriesMarkers()` creates a persistent primitive. If the chart is not fully recreated, old markers remain.
**How to avoid:** The current React pattern (full chart teardown in useEffect cleanup + recreation) handles this correctly. Trade markers array is part of the dependency array, so the entire chart rebuilds when trades change. Do NOT try to incrementally update markers -- full rebuild is simpler and correct.
**Warning signs:** Buy/sell arrows from a previous script version visible alongside new ones.

### Pitfall 5: Multiple Sub-Panes with Incompatible Scales
**What goes wrong:** RSI (0-100) and MACD (could be -50 to +50 or any range) are put in the same sub-pane, making one series invisible.
**Why it happens:** Both have `pane: "sub"` from the oscillator classifier, and naive implementation puts all sub-pane series in pane 1.
**How to avoid:** For v1, limit sub-pane display to the first sub-pane series, or group only same-range oscillators. A simple approach: put all sub-pane series in pane 1 but use separate price scales (left/right) for different series. Advanced: create pane 1 for first sub-series, pane 2 for second, etc. -- but this can create too many panes with complex scripts.
**Warning signs:** One sub-pane series appears as a flat line at the top/bottom of the pane.

### Pitfall 6: Chart Container Height Not Adjusting for Sub-Panes
**What goes wrong:** With a fixed 300px chart height, adding a sub-pane makes both panes too small to be useful.
**Why it happens:** The existing ChartPanel uses `height: 300` in chart options, which is the total height for ALL panes.
**How to avoid:** Dynamically calculate total height: base 300px for price-only charts, add 120-150px per sub-pane. Or use a container with `min-height` and let the chart fill it.
**Warning signs:** Tiny candlestick chart with a tiny oscillator below it, both unreadable.

## Code Examples

Verified patterns from the installed lightweight-charts v5.1.0 package:

### Creating Markers on a Candlestick Series
```typescript
// Source: lightweight-charts v5.1.0 typings.d.ts (verified in installed package)
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";

// Create chart
const chart = createChart(container, options);

// Add candlestick series to pane 0 (default)
const candleSeries = chart.addSeries(CandlestickSeries, {
  upColor: "#20c997",
  downColor: "#ff6b6b",
  wickUpColor: "#20c997",
  wickDownColor: "#ff6b6b",
  borderVisible: false,
});

// Add line series to pane 1 (sub-pane, auto-created)
const rsiSeries = chart.addSeries(LineSeries, {
  color: "#f4b942",
  lineWidth: 2,
  priceLineVisible: true,
}, 1); // <-- paneIndex = 1

// Create markers on candlestick series
const markers: SeriesMarker<Time>[] = [
  {
    time: 1555891200 as Time, // epoch seconds
    position: "belowBar",
    shape: "arrowUp",
    color: "#20c997",
    text: "long entry",
  },
  {
    time: 1556064000 as Time,
    position: "aboveBar",
    shape: "arrowDown",
    color: "#ff6b6b",
    text: "long exit",
  },
];

const markersApi = createSeriesMarkers(candleSeries, markers);

// Later: update markers
markersApi.setMarkers(newMarkers);

// Cleanup: chart.remove() removes everything including markers
```

### Accessing Pane API
```typescript
// Source: lightweight-charts v5.1.0 IPaneApi (verified in installed typings)
const panes = chart.panes();  // IPaneApi[]

// Set sub-pane height
if (panes.length > 1) {
  panes[1].setHeight(120);    // 120px for oscillator sub-pane
}

// Get series in a pane
const pane1Series = panes[1]?.getSeries();

// Get pane HTML element (for custom overlays if needed)
const paneElement = panes[1]?.getHTMLElement();
```

### Converting TradeEvent to SeriesMarker
```typescript
// Source: project contracts.ts TradeEvent + lightweight-charts SeriesMarker types
import type { TradeEvent } from "@shared/contracts";
import type { SeriesMarker, Time } from "lightweight-charts";

const toChartTime = (ts: string): Time =>
  Math.floor(new Date(ts).getTime() / 1000) as Time;

function tradesToMarkers(trades: TradeEvent[]): SeriesMarker<Time>[] {
  return trades
    .map((trade): SeriesMarker<Time> => {
      const isEntry = trade.side.includes("entry");
      return {
        time: toChartTime(trade.timestamp),
        position: isEntry ? "belowBar" : "aboveBar",
        shape: isEntry ? "arrowUp" : "arrowDown",
        color: isEntry ? "#20c997" : "#ff6b6b",
        text: `${trade.side.replace(/_/g, " ")} @ ${trade.price.toFixed(2)}`,
      };
    })
    .sort((a, b) => (a.time as number) - (b.time as number));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `series.setMarkers()` (v4) | `createSeriesMarkers(series, markers)` (v5) | v5.0.0 (Mar 2025) | Markers are a separate primitive; better tree-shaking; must import separately |
| `chart.addLineSeries()` (v4) | `chart.addSeries(LineSeries, options)` (v5) | v5.0.0 (Mar 2025) | Unified `addSeries()` with type as first param |
| No multi-pane (v4) | `chart.addSeries(type, opts, paneIndex)` (v5) | v5.0.0 (Mar 2025) | Native multi-pane; auto-create/remove panes; synced crosshair/timescale |
| No marker price positioning (v4) | `position: "atPriceTop"/"atPriceBottom"/"atPriceMiddle"` (v5) | v5.0.0+ | Markers can be positioned at specific price levels, not just above/below bars |

**Deprecated/outdated:**
- `series.setMarkers()`: Removed in v5. Use `createSeriesMarkers()` instead.
- `chart.addCandlestickSeries()`: Removed in v5. Use `chart.addSeries(CandlestickSeries, options)`.
- `chart.addLineSeries()`: Removed in v5. Use `chart.addSeries(LineSeries, options)`.
- The existing `ChartPanel.tsx` already uses v5 API correctly (`chart.addSeries(CandlestickSeries, ...)`, `chart.addSeries(LineSeries, ...)`).

## Open Questions

1. **Multiple oscillator sub-panes or single shared sub-pane?**
   - What we know: lightweight-charts supports unlimited panes. RSI and MACD have different value ranges.
   - What's unclear: How many sub-panes are practical before the chart becomes too vertically cramped?
   - Recommendation: Start with a single sub-pane (pane index 1) for all oscillator series. If scales clash badly, add separate panes per indicator. This can be iterated in Phase 3 UX polish.

2. **Chart height adjustment strategy**
   - What we know: Current fixed 300px height is insufficient when sub-panes are added.
   - What's unclear: Whether to use dynamic height calculation or a fixed larger height.
   - Recommendation: Use 300px base + 120px per sub-pane present. Set the container to this calculated height before creating the chart. This is simple and deterministic.

3. **Execution status indicator design**
   - What we know: The requirement says "running spinner / complete checkmark / error icon".
   - What's unclear: Whether this should be inline in the button, a separate badge, or a status bar.
   - Recommendation: Place a small status indicator (icon + text) next to the Run button in the action-row toolbar. Use: spinning circle during execution, green checkmark on success (fades after 3s), red X on error (persists until next run). Keep it lightweight -- no toast/modal.

## Sources

### Primary (HIGH confidence)
- lightweight-charts v5.1.0 `dist/typings.d.ts` -- Installed package typings verified directly: `createSeriesMarkers()` function signature, `SeriesMarkerShape` type (`"arrowUp" | "arrowDown" | "circle" | "square"`), `SeriesMarkerBarPosition` type (`"aboveBar" | "belowBar" | "inBar"`), `IPaneApi` interface, `addSeries()` with `paneIndex` parameter
- lightweight-charts official docs: [Panes tutorial](https://tradingview.github.io/lightweight-charts/tutorials/how_to/panes) -- multi-pane creation via `paneIndex`, `IPaneApi.setHeight()`, `IPaneApi.moveTo()`
- lightweight-charts official docs: [Series Markers tutorial](https://tradingview.github.io/lightweight-charts/tutorials/how_to/series-markers) -- `createSeriesMarkers()` usage, marker properties
- lightweight-charts official docs: [createSeriesMarkers API](https://tradingview.github.io/lightweight-charts/docs/api/functions/createSeriesMarkers) -- function signature, return type `ISeriesMarkersPluginApi`
- Existing codebase: `ChartPanel.tsx`, `pineExecutionService.ts`, `usePineExecution.ts`, `WorkspacePage.tsx`, `contracts.ts` -- all directly read and analyzed

### Secondary (MEDIUM confidence)
- lightweight-charts official docs: [v4 to v5 migration](https://tradingview.github.io/lightweight-charts/docs/migrations/from-v4-to-v5) -- breaking changes in series creation and markers API
- lightweight-charts official docs: [React basic example](https://tradingview.github.io/lightweight-charts/tutorials/react/simple) -- useEffect/useRef pattern for React integration

### Tertiary (LOW confidence)
- None -- all findings verified against installed package typings or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- lightweight-charts v5.1.0 already installed and working; all needed APIs verified in typings
- Architecture: HIGH -- extending an existing working component (`ChartPanel`) with documented v5 features; no new patterns needed
- Pitfalls: HIGH -- pitfalls derived from direct reading of existing code limitations and v5 API constraints

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable library, no fast-moving changes expected)
