# Phase 1: PineTS Engine + Data Pipeline - Research

**Researched:** 2026-03-10
**Domain:** PineTS (TypeScript Pine Script transpiler+runtime) integration with React/Vite frontend
**Confidence:** MEDIUM

## Summary

PineTS (`pinets` npm package, currently v0.6.1) is an open-source TypeScript transpiler and runtime that executes Pine Script v5/v6 code directly in the browser. It supports 63 technical analysis functions (all required indicators: EMA, SMA, RSI, MACD, BB, Stoch, ATR, SuperTrend are confirmed supported), accepts custom OHLCV data arrays, and returns results through a `plots` object keyed by plot title and a `result` object for returned values. The strategy namespace (strategy.entry, strategy.exit, strategy.close, strategy.order) is listed in the API coverage but implementation status is unclear -- this is the primary risk for this phase.

The integration pattern is straightforward: install `pinets`, create a `PineTS` instance with custom OHLCV candle data (no provider needed), call `pineTS.run(pineScriptString)`, and extract indicator series from `plots` and strategy state from `result`. The existing codebase has well-defined `IndicatorSeries` and `TradeEvent` TypeScript types that PineTS outputs must be mapped to. The SBIN_5.xlsx dataset (18,850 candles) is already imported and normalized by the backend into CSV with columns: timestamp, open, high, low, close, volume. The frontend gets candle data via the `RunStatus.candles` array. For Phase 1, we need a new path to get this OHLCV data to PineTS in the browser.

Error handling for Pine Script syntax errors must be extracted from PineTS transpilation failures and mapped to Monaco editor markers via `monaco.editor.setModelMarkers()`. PineTS uses `acorn` for AST parsing, which throws standard JavaScript SyntaxError-like exceptions. The existing `StrategyEditor` component uses `@monaco-editor/react` which provides access to the Monaco instance through `onMount` callback.

**Primary recommendation:** Install `pinets`, create a `PineExecutionService` that accepts Pine Script source + OHLCV candles, runs PineTS with custom data arrays, extracts indicator series from `plots` object and trade events from `result` object, maps them to existing `IndicatorSeries`/`TradeEvent` types, and surfaces syntax errors to Monaco via `setModelMarkers`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PINE-01 | User can paste any Pine Script v5/v6 into the Pine editor and it executes locally via PineTS | PineTS `run()` method accepts raw Pine Script strings with `//@version=5` header; 63 ta.* functions confirmed supported; custom OHLCV data via array constructor |
| PINE-02 | Pine Script execution produces indicator series (EMA, SMA, RSI, MACD, BB, Stoch, ATR, SuperTrend, etc.) | All 8 required indicators confirmed in ta.* API coverage with checkmark status; `plots` object returns named series data arrays |
| PINE-03 | Pine Script execution produces trade events from strategy.entry/strategy.exit calls | Strategy namespace listed in API coverage but implementation status unclear (MEDIUM risk); strategy.entry/exit/close/order are documented; may need fallback extraction from result variables |
| PINE-04 | Pine Script syntax errors display inline in the editor with error location | PineTS transpiler uses `acorn` parser which throws errors with line/column info; Monaco `setModelMarkers` API maps these to inline red underlines |
| INTG-03 | Pine execution uses imported dataset (same OHLCV data as Python side) | PineTS constructor accepts raw OHLCV arrays: `new PineTS(candlesArray)`; dataset already stored as normalized CSV; need API endpoint or frontend-side loading to convert to PineTS format |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pinets | 0.6.1 | Pine Script v5/v6 transpiler + runtime | Only viable TypeScript Pine Script runtime; 269 stars, active development, 63 indicators, browser-compatible |
| @monaco-editor/react | ^4.7.0 | Code editor with error markers | Already installed; provides `onMount` for Monaco instance access needed for `setModelMarkers` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lightweight-charts | ^5.0.9 | Chart rendering | Already installed; Phase 2 will use for chart display |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pinets | @vibetrader/pinets | Fork/variant; less documented, unclear maintenance |
| pinets | pine-transpiler (Opus-Aether-AI) | Transpile-only (no runtime), zero deps but no indicator library |
| pinets custom data | pinets Provider.Binance | Built-in provider fetches from Binance; we need custom OHLCV from local dataset |

**Installation:**
```bash
cd frontend && npm install pinets
```

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── services/
│   └── pineExecutionService.ts    # PineTS wrapper: transpile, execute, extract results
├── hooks/
│   └── usePineExecution.ts        # React hook wrapping pineExecutionService
├── components/
│   └── editors/
│       ├── StrategyEditor.tsx      # Existing: add onMount for Monaco ref
│       └── PineEditor.tsx          # Existing: wire error markers
├── lib/
│   └── pineDataAdapter.ts         # Convert CandlePoint[] to PineTS candle format
└── app/
    └── App.tsx                     # Existing: add pine execution state
```

### Pattern 1: PineTS Custom Data Initialization
**What:** Initialize PineTS with local OHLCV data instead of a market provider
**When to use:** Always -- this project uses imported historical data, not live feeds
**Example:**
```typescript
// Source: PineTS docs - Initialization and Usage
// https://quantforgeorg.github.io/PineTS/initialization-and-usage/
import { PineTS } from 'pinets';

// PineTS expects candles with: open, high, low, close, volume, openTime (ms)
const candles = ohlcvData.map(candle => ({
  openTime: new Date(candle.timestamp).getTime(),
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close,
  volume: candle.volume ?? 0,
}));

const pineTS = new PineTS(candles);
```

### Pattern 2: Native Pine Script Execution with Result Extraction
**What:** Run raw Pine Script v5/v6 and extract plots + results
**When to use:** When user pastes Pine Script into the editor
**Example:**
```typescript
// Source: PineTS docs - Getting Started
// https://quantforgeorg.github.io/PineTS/getting-started/
const pineScriptCode = `
//@version=5
indicator("EMA Cross")
ema9 = ta.ema(close, 9)
ema18 = ta.ema(close, 18)
plot(ema9, title="Fast EMA", color=color.yellow)
plot(ema18, title="Slow EMA", color=color.red)
`;

const { result, plots } = await pineTS.run(pineScriptCode);
// plots["Fast EMA"].data => array of values
// plots["Slow EMA"].data => array of values
// result.ema9 => array of values (from variable names)
```

### Pattern 3: Strategy Script Execution
**What:** Run strategy scripts that include strategy.entry/exit calls
**When to use:** When Pine Script contains `strategy()` declaration
**Example:**
```typescript
// Source: PineTS docs - Getting Started
// https://quantforgeorg.github.io/PineTS/getting-started/
const strategyCode = `
//@version=5
strategy("My Strategy", overlay=true)
emaFast = ta.ema(close, 21)
longCondition = close > emaFast
if longCondition
    strategy.entry("L", strategy.long)
`;

const { result, plots } = await pineTS.run(strategyCode);
// Indicator plots available via plots object
// Strategy state available via result object
// NOTE: Exact strategy trade event extraction format needs validation
```

### Pattern 4: Monaco Error Markers from PineTS Errors
**What:** Map transpilation/runtime errors to inline Monaco markers
**When to use:** When PineTS throws during transpile or execution
**Example:**
```typescript
// Source: Monaco Editor API docs
// https://microsoft.github.io/monaco-editor/
import type { editor } from 'monaco-editor';

function setPineErrors(
  monacoInstance: typeof import('monaco-editor'),
  editorModel: editor.ITextModel,
  error: Error
) {
  // PineTS uses acorn parser -- errors typically include line info
  const lineMatch = error.message.match(/line (\d+)/i);
  const colMatch = error.message.match(/col(?:umn)? (\d+)/i);
  const line = lineMatch ? parseInt(lineMatch[1], 10) : 1;
  const col = colMatch ? parseInt(colMatch[1], 10) : 1;

  monacoInstance.editor.setModelMarkers(editorModel, 'pine-ts', [{
    severity: monacoInstance.MarkerSeverity.Error,
    message: error.message,
    startLineNumber: line,
    startColumn: col,
    endLineNumber: line,
    endColumn: col + 10, // Approximate span
  }]);
}

// Clear markers on successful execution
monacoInstance.editor.setModelMarkers(editorModel, 'pine-ts', []);
```

### Pattern 5: Output Mapping to Existing Types
**What:** Convert PineTS output to IndicatorSeries and TradeEvent contracts
**When to use:** After every successful PineTS execution
**Example:**
```typescript
// Source: Project contracts.ts + PineTS docs
import type { IndicatorSeries, TradeEvent, CandlePoint } from '@shared/contracts';

function mapPlotsToIndicatorSeries(
  plots: Record<string, { data: Array<{ value: number }> }>,
  candles: CandlePoint[],
  warmupBars: number
): IndicatorSeries[] {
  return Object.entries(plots).map(([name, plot]) => ({
    name,
    pane: 'main', // Default; could detect from indicator vs oscillator
    style: { color: '#f4b942' },
    warmup_bars: warmupBars,
    values: plot.data.map((point, index) => ({
      timestamp: candles[index]?.timestamp ?? new Date().toISOString(),
      value: point.value ?? null,
    })),
  }));
}
```

### Anti-Patterns to Avoid
- **Running PineTS on main thread with 18K+ candles:** For Phase 1, acceptable for development/testing. Phase 3 moves to Web Worker. Do NOT prematurely optimize with Web Worker complexity.
- **Re-transpiling on every keystroke:** Debounce or trigger only on explicit "Run" action. PineTS transpilation is not cheap.
- **Passing string data to PineTS:** OHLCV values must be numbers. Timestamps must be Unix epoch milliseconds for `openTime`. Ensure proper type conversion from CSV string data.
- **Assuming strategy functions return trade events directly:** PineTS may not emit trade events as distinct objects. Strategy state may need manual extraction from execution context.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pine Script parsing | Custom regex/AST parser for Pine Script | PineTS transpiler | Pine Script has complex scoping, series semantics, and 400+ built-in functions |
| Technical indicators | Custom EMA/SMA/RSI implementations | PineTS ta.* namespace | 63 indicators with Pine Script-compatible semantics (warmup, series, lookback) |
| Pine Script variable scoping | Manual scope tracking | PineTS ScopeManager | Pine Script has unique scoping rules (series grow per bar, reverse indexing) |
| OHLCV series processing | Custom bar-by-bar loop | PineTS runtime Context | PineTS handles series push, indexing, and variable growth automatically |
| Monaco error squiggles | Custom error overlay | monaco.editor.setModelMarkers() | Built-in API with severity levels, gutter markers, and hover messages |

**Key insight:** Pine Script has unique semantics (series types, bar-by-bar execution, lookback indexing) that are extremely error-prone to implement manually. PineTS handles all of this.

## Common Pitfalls

### Pitfall 1: PineTS Custom Data Format Mismatch
**What goes wrong:** PineTS silently produces wrong results or crashes because candle data has wrong field names or types
**Why it happens:** PineTS expects `{ openTime, open, high, low, close, volume }` with `openTime` as Unix epoch in milliseconds. The project's `CandlePoint` has `timestamp` as ISO string.
**How to avoid:** Create a dedicated `pineDataAdapter.ts` that converts `CandlePoint[]` to PineTS format with explicit type coercion: `openTime: new Date(candle.timestamp).getTime()`, all OHLCV as `Number()`.
**Warning signs:** NaN values in indicator output, all-zero series, PineTS returning empty results

### Pitfall 2: Strategy Support May Be Incomplete
**What goes wrong:** strategy.entry/strategy.exit calls in Pine Script don't produce extractable trade events
**Why it happens:** PineTS API coverage lists strategy functions but doesn't clearly indicate implementation status. The strategy namespace may be partially implemented or return data in an unexpected format.
**How to avoid:** Test strategy script execution immediately in Phase 1. If strategy functions don't work, implement fallback: parse `result` object for boolean signals (like `longCondition`) and derive trade events manually, similar to how `PythonStrategyEngine._build_trade_events()` works.
**Warning signs:** strategy.entry calls don't throw errors but no trade data appears in results

### Pitfall 3: Plot Title Collisions
**What goes wrong:** Multiple indicators with the same plot title overwrite each other
**Why it happens:** PineTS disambiguates duplicate plot titles by appending `#N` suffix. Code expecting exact title matches breaks.
**How to avoid:** Use unique plot titles in Pine Script. When mapping plots to IndicatorSeries, handle the `#N` suffix pattern.
**Warning signs:** Missing indicator series in output, unexpected `#1` `#2` suffixes

### Pitfall 4: Large Dataset Performance on Main Thread
**What goes wrong:** UI freezes during PineTS execution on 18,850 candles
**Why it happens:** PineTS processes each bar sequentially, and with 18K+ bars this takes noticeable time on the main thread
**How to avoid:** Phase 1 accepts this as known limitation. Add a "Running..." status indicator. Phase 3 moves to Web Worker. For development, test with subset (first 1000 candles) then validate with full dataset.
**Warning signs:** Browser "page unresponsive" dialog, frozen UI during execution

### Pitfall 5: Monaco Instance Not Available on First Render
**What goes wrong:** `setModelMarkers` call fails because Monaco editor hasn't mounted yet
**Why it happens:** Monaco editor loads asynchronously. The `monacoRef` is null until `onMount` fires.
**How to avoid:** Store Monaco instance via `onMount` callback in a `useRef`. Guard all marker operations with null check. Queue error updates if editor not yet mounted.
**Warning signs:** "Cannot read property of null" errors, errors not appearing in editor

### Pitfall 6: Async PineTS Execution in React State Flow
**What goes wrong:** Stale closures cause incorrect state updates after async PineTS execution
**Why it happens:** `pineTS.run()` is async. If user changes Pine Script while execution is in flight, the callback may set results from stale code.
**How to avoid:** Use an execution counter or AbortController pattern. Only apply results if the execution ID matches the latest request. Use React functional setState `setState(prev => ...)`.
**Warning signs:** Results flickering, showing old results after editing code

## Code Examples

Verified patterns from official sources:

### Complete PineTS Execution with Custom Data
```typescript
// Source: PineTS official docs
// https://quantforgeorg.github.io/PineTS/initialization-and-usage/
import { PineTS } from 'pinets';

// 1. Prepare custom candle data
const candles = [
  { openTime: 1640995200000, open: 46000, high: 47000, low: 45500, close: 46500, volume: 1000 },
  { openTime: 1641081600000, open: 46500, high: 48000, low: 46000, close: 47800, volume: 1200 },
  // ... more candles
];

// 2. Initialize PineTS with custom data
const pineTS = new PineTS(candles);

// 3. Run native Pine Script
const { result, plots } = await pineTS.run(`
//@version=5
indicator("My Indicator")
sma20 = ta.sma(close, 20)
plot(sma20, "SMA 20")
`);

// 4. Access results
console.log('SMA values:', plots['SMA 20'].data);
```

### Monaco Editor with Error Markers (React)
```typescript
// Source: @monaco-editor/react docs + Monaco API
// https://github.com/suren-atoyan/monaco-react
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useRef } from 'react';

function PineEditorWithErrors() {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  function handleEditorMount(editor: editor.IStandaloneCodeEditor, monaco: Monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;
  }

  function setErrors(errors: Array<{ line: number; col: number; message: string }>) {
    if (!monacoRef.current || !editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    monacoRef.current.editor.setModelMarkers(model, 'pine-ts', errors.map(err => ({
      severity: monacoRef.current!.MarkerSeverity.Error,
      message: err.message,
      startLineNumber: err.line,
      startColumn: err.col,
      endLineNumber: err.line,
      endColumn: err.col + 20,
    })));
  }

  function clearErrors() {
    if (!monacoRef.current || !editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    monacoRef.current.editor.setModelMarkers(model, 'pine-ts', []);
  }

  return (
    <Editor
      height="280px"
      defaultLanguage="javascript"
      theme="vs-dark"
      onMount={handleEditorMount}
      // ... other props
    />
  );
}
```

### MACD with Tuple Return
```typescript
// Source: PineTS docs - Getting Started
// https://quantforgeorg.github.io/PineTS/getting-started/
const { plots } = await pineTS.run(`
//@version=5
indicator("MACD", overlay=false)
[macdLine, signalLine, hist] = ta.macd(close, 12, 26, 9)
plot(macdLine, "MACD", color.blue)
plot(signalLine, "Signal", color.orange)
plot(hist, "Histogram", color.gray, style=plot.style_histogram)
`);

// Access via plot titles
const macdValues = plots['MACD'].data;
const signalValues = plots['Signal'].data;
const histValues = plots['Histogram'].data;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TradingView Playwright automation | PineTS local execution | 2026-03-10 (project decision) | No browser automation, no anti-bot issues, instant offline execution |
| Pine Script to Python manual porting | PineTS transpiler handles natively | PineTS v0.6.1 (current) | 63 indicators with Pine Script-compatible semantics |
| PineTS syntax (JS mirror) only | Native Pine Script v5/v6 support | PineTS v0.7.0+ (experimental) | Users paste real Pine Script, no manual conversion needed |
| Provider-only data (Binance) | Custom OHLCV array input | Available in current version | Can use any local dataset |

**Deprecated/outdated:**
- `PineLocalEngine` (backend): Currently only validates keywords, does NOT execute Pine Script. Will be bypassed/replaced by frontend PineTS execution.
- `PineBridgeEngine` (backend): Placeholder for TradingView automation bridge. Superseded by PineTS.
- `defaultBridgeJson` / bridge artifact workflow: Manual JSON paste of Pine results. Replaced by automatic PineTS execution.

## Open Questions

1. **Strategy trade event extraction format**
   - What we know: PineTS API coverage lists strategy.entry, strategy.exit, strategy.close, strategy.order. The `result` object contains named variables. The `plots` object contains plotted series.
   - What's unclear: Does PineTS emit structured trade events (list of entries/exits with timestamps), or do we need to derive them from boolean signals in `result`? The documentation does not show strategy-specific output examples.
   - Recommendation: Test strategy execution immediately in Plan 01-01. If structured trade events are available, use them directly. If not, implement signal-to-trade-event conversion similar to `PythonStrategyEngine._build_trade_events()` which scans boolean columns for long_condition transitions. **Confidence: LOW -- needs immediate validation.**

2. **PineTS `plots` object exact structure**
   - What we know: `plots["Plot Title"].data` returns an array. Plot titles can have `#N` disambiguation suffixes.
   - What's unclear: Exact shape of each data point in the array. Is it `{ value: number }` or `{ value: number, time: number }` or just `number[]`?
   - Recommendation: Log the full `plots` output structure in first execution test. Build adapter based on actual shape. **Confidence: LOW -- needs validation.**

3. **PineTS error message format with line numbers**
   - What we know: PineTS uses `acorn` for AST parsing. Acorn throws errors with line/column info in standard JavaScript Error format.
   - What's unclear: Does PineTS propagate acorn errors directly, or does it wrap them? Does native Pine Script mode have its own parser with different error format?
   - Recommendation: Catch errors from `pineTS.run()`, log full error object, extract line/column with regex fallback. Build error parser defensively. **Confidence: MEDIUM.**

4. **Data pipeline: How to get OHLCV candles to the frontend for PineTS**
   - What we know: Backend stores normalized dataset as CSV. Frontend currently gets candle data only via `RunStatus.candles` after a run is created. PineTS needs candle data BEFORE a run.
   - What's unclear: Should we add a new API endpoint to fetch raw candles for a dataset? Or load candles client-side?
   - Recommendation: Add a backend endpoint `GET /data-sources/{dataset_id}/candles` that returns `CandlePoint[]` as JSON. Frontend fetches this, converts to PineTS format, and feeds to PineTS. This keeps the architecture clean (data stays on backend, frontend just fetches). **Confidence: HIGH -- this is straightforward.**

5. **PineTS browser bundle size and Vite compatibility**
   - What we know: PineTS is an npm package with TypeScript support. The project uses Vite with ESM.
   - What's unclear: Bundle size impact, tree-shaking support, any Node.js-only dependencies that would fail in browser.
   - Recommendation: Install and test import immediately. If there are Node.js dependencies (like `fs` or `path`), may need Vite polyfills or conditional imports. **Confidence: MEDIUM.**

## Sources

### Primary (HIGH confidence)
- [PineTS Official Docs - Getting Started](https://quantforgeorg.github.io/PineTS/getting-started/) - Installation, native Pine Script execution, PineTS syntax, result access patterns
- [PineTS Official Docs - Initialization and Usage](https://quantforgeorg.github.io/PineTS/initialization-and-usage/) - Constructor parameters, custom OHLCV data, run() return type, error handling
- [PineTS Official Docs - API Coverage: ta](https://quantforgeorg.github.io/PineTS/api-coverage/ta.html) - All 63 ta.* functions confirmed supported
- [PineTS Official Docs - API Coverage: strategy](https://quantforgeorg.github.io/PineTS/api-coverage/strategy.html) - Strategy functions listed (status unclear)
- [PineTS Official Docs - API Coverage: plots](https://quantforgeorg.github.io/PineTS/api-coverage/plots.html) - Plot functions confirmed supported
- [PineTS GitHub Repository](https://github.com/QuantForgeOrg/PineTS) - README, architecture, 269 stars, AGPL-3.0

### Secondary (MEDIUM confidence)
- [PineTS Official Docs - Transpiler Architecture](https://quantforgeorg.github.io/PineTS/architecture/transpiler/) - Uses acorn parser, astring code generator, ScopeManager
- [PineTS Official Docs - Runtime Context](https://quantforgeorg.github.io/PineTS/architecture/runtime/context/) - Context API: $.data, $.ta, $.math, $.let, $.get()
- [PineTS Official Docs - Language Coverage](https://quantforgeorg.github.io/PineTS/lang-coverage/) - Core features done, while/for-in loops missing, objects/enums partial
- [PineTS npm page](https://www.npmjs.com/package/pinets) - v0.6.1, published ~5 days ago
- [@monaco-editor/react](https://www.npmjs.com/package/@monaco-editor/react) - onMount callback pattern for Monaco instance access
- [Monaco setModelMarkers API](https://github.com/microsoft/monaco-editor/issues/790) - IMarkerData format with startLineNumber, startColumn, severity

### Tertiary (LOW confidence)
- Strategy trade event output format -- not documented in any source; needs empirical validation
- PineTS plots data point structure -- documentation says `.data` exists but doesn't specify element shape
- PineTS browser bundle compatibility -- no specific browser/Vite documentation found

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - PineTS is the clear and only choice; npm package verified, 63 indicators confirmed
- Architecture: MEDIUM - Integration pattern is sound but PineTS output formats (plots structure, strategy events) need empirical validation
- Pitfalls: HIGH - Well-documented from official docs, common JS async patterns, Monaco API well-known
- Data pipeline: HIGH - Straightforward OHLCV conversion; existing backend has all the infrastructure
- Strategy support: LOW - API coverage lists functions but implementation status and output format are undocumented

**Research date:** 2026-03-10
**Valid until:** 2026-03-24 (PineTS is actively developed; check for version updates)
