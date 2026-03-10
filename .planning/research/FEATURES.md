# Feature Landscape

**Domain:** TradingView Pine Script Automation via Playwright (for Trading Strategy Comparator)
**Researched:** 2026-03-10
**Mode:** Ecosystem + Feasibility (brownfield addition to existing FastAPI + React + TypeScript app)

---

## Table Stakes

Features users expect from a TradingView Pine Script automation tool integrated into a strategy comparator. Missing any of these makes the tool feel broken or fundamentally incomplete.

| # | Feature | Why Expected | Complexity | Notes |
|---|---------|--------------|------------|-------|
| T1 | **TradingView session login + persistence** | Without persistent auth, every run requires manual login -- unusable for automation | Medium | Store session via Playwright `storage_state` (cookies + localStorage as JSON). TradingView sessions last ~30-90 days on free tier. Must survive backend restarts via encrypted file storage (Fernet, matching existing VYOM pattern). Initial login MUST be manual (headed browser) because TradingView uses CAPTCHA + optional 2FA that cannot be reliably automated. The existing `settings.tradingview_session_file` path and `PineBridgeEngine.handshake()` session check already anticipate this. |
| T2 | **Pine Script paste + apply in Pine Editor** | The entire value proposition -- paste arbitrary Pine Script into TradingView's Pine Editor and trigger execution | High | TradingView's Pine Editor uses a CodeMirror-like custom editor. Standard Playwright `fill()` does NOT work. Must use clipboard-based paste: `page.evaluate("navigator.clipboard.writeText(code)")` then `Ctrl+V`. Steps: (1) open Pine Editor panel, (2) `Ctrl+A` to select all, (3) `Delete` to clear, (4) clipboard paste, (5) click "Add to chart" / "Save and apply". DOM selectors change across TradingView deployments -- centralize in a Page Object Model with fallback selectors (data-name > aria-label > text content). |
| T3 | **Pine Script compilation error detection** | Users must know if their script has syntax errors vs executed successfully | Medium | After clicking "Add to chart," TradingView shows compilation errors inline in the Pine Editor panel. Scrape the error panel DOM for error text. Return structured errors with line number and message when possible. Without this, users see a blank chart and have no idea why. Map errors to a new `compile_error` status in the task lifecycle. |
| T4 | **OHLCV candle data extraction** | The comparator needs candle data aligned with Pine output for chart rendering and Pine-vs-Python comparison | Medium | **CRITICAL DECISION: Use `tvdatafeed` library, NOT Playwright, for candle data.** `tvdatafeed` connects directly to TradingView's WebSocket API (no browser needed), returns up to 5000 bars of OHLCV, supports all timeframes (1min to monthly), and is fast (2-3 seconds). This decouples candle data acquisition from the slow browser automation pipeline. Reserve Playwright exclusively for Pine Script execution and indicator extraction. Alternatively, reuse candles from the existing dataset if the user has already imported data for the same symbol/timeframe. |
| T5 | **Indicator series extraction (computed plot values)** | Core use case -- extract what the Pine Script actually computes so it can be compared against the Python implementation | Very High | **This is the hardest and most important feature.** Pine Script indicators are computed CLIENT-SIDE in the browser. They do NOT appear in WebSocket messages (WebSocket only delivers raw OHLCV). Three viable extraction approaches (see Deep Dive section below). **Recommended: Data Window hover-scrape** -- move mouse across chart bars, read indicator values from TradingView's Data Window panel. Slow (~100-200ms per bar) but reliable, exact numerical values, works on free tier, requires no script modification. |
| T6 | **Symbol + timeframe configuration** | Users must match the TradingView chart to the same instrument/period as their Python strategy | Low | Use URL parameters: `https://www.tradingview.com/chart/?symbol=NSE:NIFTY&interval=D`. Timeframe codes: `1`=1min, `5`=5min, `15`=15min, `60`=1h, `D`=daily, `W`=weekly, `M`=monthly. Validate symbol existence before launching expensive browser automation (use `tvdatafeed` search or the existing TradingView search box). |
| T7 | **Execution timeout + structured error handling** | Browser automation is inherently fragile -- network issues, TradingView updates, rate limits, browser crashes | Medium | Must handle: (1) page load timeouts (TradingView is a heavy SPA, 5-15s load), (2) Pine compilation hanging, (3) TradingView CAPTCHA/rate limiting triggering mid-session, (4) stale DOM selectors after TV updates, (5) browser crash recovery. Use Playwright's built-in timeout mechanisms + retry with exponential backoff at the action level (not task level). Return structured error types so frontend can display actionable messages (timeout, compilation error, session expired, rate limited). |
| T8 | **Async/background execution** | Pine Script via TradingView takes 10-60 seconds -- cannot block the FastAPI API thread | Medium | Use `asyncio.Queue` + background `asyncio.Task` started in FastAPI's lifespan hook. The existing codebase has a precedent: `RunService._live_loop()` uses background threads. WebSocket push to frontend for progress updates (matches existing `LiveBarEvent` pattern). The existing `RunLifecycle` enum already models `draft -> running -> completed/failed` states. |
| T9 | **Result format matching existing contracts** | Must produce `IndicatorSeries[]`, `TradeEvent[]`, `CandlePoint[]` that the existing comparison engine and chart components consume | Medium | The codebase already defines the complete data contract in `shared/python/contracts.py`: `IndicatorSeries`, `IndicatorPoint`, `TradeEvent`, `CandlePoint`, `BridgeArtifact`. The TV automation layer is purely a PRODUCER that emits these existing types. No new data models needed for the core pipeline. The existing `BridgeService.create()` and `ComparisonEngine` consume `BridgeArtifact` objects unchanged. |

---

## Differentiators

Features that set this tool apart from manually running Pine Script on TradingView or from existing open-source tools. Not expected by default, but provide significant value.

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| D1 | **Auto-run on paste (zero-click execution)** | User pastes Pine Script in Monaco editor, it automatically executes on TradingView and results appear on the Pine chart -- no manual steps, no button clicks required | Medium | PROJECT.md explicitly requires this: "Any Pine Script pasted into the Pine editor must execute and display its candles + indicators on the Pine screen." Debounce the paste/edit event (wait 1.5-2s after last keystroke before triggering automation). Add a manual "Run" button as fallback for when debounce behavior is undesirable. Frontend triggers POST to `/tv-automation/run`, receives `task_id`, opens WebSocket for progress. |
| D2 | **Pine vs Python side-by-side comparison with mismatch diff** | The killer feature -- see exactly where Pine and Python indicator implementations diverge, bar by bar, with mismatch classification | Low (already built) | The `ComparisonEngine` and `DiffPanel` components already exist and work. The `ComparisonResult` model includes `series_mismatches`, `trade_mismatches`, `DiffClassification` (warmup_window, numeric_tolerance, pine_only_function_gap, etc.). Once TV automation produces `IndicatorSeries[]`, the entire comparison pipeline activates for free. This is the architectural payoff of the brownfield approach. |
| D3 | **Strategy trade event extraction** | Extract `strategy.entry()` / `strategy.exit()` trade events from Pine strategies, enabling trade-level comparison against Python implementation | High | TradingView's "Strategy Tester" panel (bottom tab, visible when a `strategy()` script runs) shows a "List of Trades" table: Trade #, Type (Long/Short), Signal, Date/Time, Price, Contracts, Profit, Cumulative Profit. Playwright scrapes this table and maps to existing `TradeEvent` contract. This enables comparing Pine strategy trades vs Python strategy trades -- uniquely valuable for validating strategy portability. |
| D4 | **Result caching by script+context hash** | Cache extracted Pine results keyed by `hash(source_code + symbol + timeframe + date_range)` -- skip re-execution for identical inputs | Low | Hash the inputs using hashlib, check SQLite before launching Playwright. Save extracted series + trades associated with the hash. Massive UX improvement since each TradingView run takes 30-60s. The existing `BridgeArtifact` model is almost this already -- extend with a `content_hash` field and a lookup-by-hash query. Invalidate cache when user explicitly requests a fresh run. |
| D5 | **Multi-indicator extraction in single pass** | Extract ALL plotted indicator series from one Pine Script in a single TradingView session, regardless of how many `plot()` calls the script has | Medium | A Pine Script may plot 5+ overlays (SMA, EMA, Bollinger Bands, etc.). The Data Window panel shows ALL plotted values for the hovered bar simultaneously. Each hover yields all visible indicator names + values in one DOM read. This is a natural property of the hover-scrape approach, not additional work -- but it needs to be designed for from the start (collecting a dict of series, not a single value). |
| D6 | **Granular progress reporting via WebSocket** | Real-time progress updates during Pine execution: "Connecting... Pasting code... Compiling... Extracting bar 150/500..." | Low-Medium | The existing WebSocket infrastructure supports `LiveBarEvent`. Extend with a `TVStreamEvent` type with granular statuses: `queued -> starting -> navigating -> injecting -> compiling -> extracting -> completed/failed`. During extraction phase, report `progress_pct` based on bars extracted vs total. Key UX improvement because 30-60s of silence with no feedback feels broken. |
| D7 | **Session health monitoring + auto-recovery** | Detect when TradingView session expires or browser context crashes, auto-recover or notify user proactively | Medium | Periodic cookie validation: navigate to TradingView, check for user menu selector (authenticated) vs sign-in redirect (expired). If session dies: (1) attempt to re-use persistent context, (2) if still expired, set status to `login_required` and notify frontend. The existing `DependencyStatus.tradingview_bridge` field in contracts already has `available: bool` and `detail: str` for exactly this purpose. |
| D8 | **Headless vs visible browser toggle** | Let users watch the Playwright automation happen (debugging) or run headless (production speed) | Low | Straightforward Playwright config: `launch(headless=True/False)`. Add a toggle in Settings page and backend config. The VYOM project already has this pattern (`--no-headless` flag). Essential for debugging selector issues and understanding why automation fails. |
| D9 | **Screenshot-on-failure debugging** | When any Playwright step fails, automatically capture a screenshot of the browser state for debugging | Low | `await page.screenshot(path=f"data/tv_session/debug/fail_{task_id}.png", full_page=True)`. Include screenshot path in the error response. Invaluable for diagnosing headless automation failures where you cannot see what went wrong. Store in `data/tv_session/debug/` with task_id naming. |
| D10 | **Selector health check on startup** | On backend startup, validate that critical TradingView DOM selectors still work before accepting automation requests | Medium | Navigate to TradingView chart, verify key selectors exist: Pine Editor button, Data Window, symbol search, user menu. If selectors are broken (TradingView deployed an update), flag the bridge as `unavailable` with a specific message ("TradingView DOM changed, selectors need update"). Prevents confusing failures during actual Pine runs. |

---

## Anti-Features

Features to explicitly NOT build. These are traps that seem valuable but create maintenance nightmares, violate project constraints, or provide negative ROI.

| # | Anti-Feature | Why Avoid | What to Do Instead |
|---|--------------|-----------|-------------------|
| A1 | **Local Pine Script interpreter/parser** | Pine Script is a complex, evolving language: v1-v6, 300+ built-in functions, library imports, `request.security()` for multi-timeframe, `strategy.*` for trade management, `array.*`, `matrix.*`, `map.*` data structures. Building even a 50% subset interpreter is a multi-month project that will permanently lag behind TradingView's implementation. The existing `PineLocalEngine` wisely limits itself to validation-only. | Use TradingView as the execution engine via Playwright. That is the entire architectural premise of the bridge approach. |
| A2 | **Real-time live data streaming** | PROJECT.md explicitly marks this out of scope. Real-time requires: persistent WebSocket to TradingView, constant browser session, handling market hours/holidays, dealing with TradingView's streaming rate limits, and fundamentally different data flow architecture. Enormous complexity for a comparison tool that needs historical replay, not live feeds. | Focus on historical data. User picks a date range, automation extracts that range. Use `tvdatafeed` with `TvDatafeedLive` only if historical replay proves insufficient. |
| A3 | **TradingView alerts/notifications** | Out of scope per PROJECT.md. Alerts require webhook infrastructure (public URL, server hosting, SSL), TradingView alert configuration UI, notification delivery, and ongoing monitoring. Completely orthogonal to strategy comparison. | If users want alerts, they configure them directly in TradingView. |
| A4 | **Multi-user session management** | Out of scope per PROJECT.md (single user local tool). Multi-user adds: per-user cookie encryption, concurrent browser instances (each ~150-300MB RAM), session isolation, user authentication layer for the tool itself. | Single TradingView session, single user, single browser context. Store one set of cookies. |
| A5 | **TradingView paid API / Charting Library** | PROJECT.md explicitly says "use free browser automation instead." TradingView's paid Charting Library and Broker API have different licensing (commercial agreement required), data provider requirements, and completely different architecture (embed library vs automate web app). | Playwright automation against the free TradingView web application at tradingview.com. |
| A6 | **Pixel-based chart scraping (OCR/vision)** | Tempting to screenshot the chart and use vision AI (VYOM's qwen3.5 is multimodal) to read indicator values. Fatally flawed for numerical comparison: accuracy depends on chart zoom, color scheme, overlapping lines, axis scale, font rendering. A 1-pixel misread turns 142.35 into 142.85. The comparison engine needs exact float values (tolerance 1e-6 per `RunConfig`), not OCR approximations. | Use Data Window text scraping (DOM-based, exact numerical values as formatted strings). |
| A7 | **Automatic Pine Script code injection/modification** | Do NOT auto-modify user's Pine Script to add export helpers, `log.info()` wrappers, or extra `plot()` calls. Users paste their real production scripts and expect them to run unmodified. Injecting code can: (1) break scripts at Pine compiler limits (`max_bars_back`, `max_labels_count`), (2) conflict with variable names, (3) change script behavior, (4) confuse users when the "source code" shown differs from what they pasted. | Run user's script exactly as-is. Extract data from TradingView's UI surfaces (Data Window, Strategy Tester panel). If wrapper injection proves necessary as an optimization, make it strictly opt-in with clear disclosure of what was modified. |
| A8 | **Scraping TradingView community/public scripts** | The `openclaw-tradingview` project does this for automated backtesting. Violates TradingView Terms of Service and is irrelevant to this tool's use case. Users bring their own scripts they want to compare against their Python implementation. | Only execute user-provided Pine Script. Never browse, download, or index community scripts. |
| A9 | **Concurrent multi-symbol/multi-tab browser sessions** | Running multiple TradingView browser contexts simultaneously sounds efficient but creates: (1) cookie conflicts (same session, different state), (2) TradingView rate limiting / bot detection, (3) high memory usage (~150-300MB per Playwright context), (4) race conditions in shared browser state. | Sequential execution with an `asyncio.Queue`. One symbol/script at a time. Cache results aggressively so repeated runs are near-instant. Estimated 30-60s per run is acceptable for a comparison tool. |
| A10 | **WebSocket interception for indicator values** | The existing STACK.md recommends this, but it is INCORRECT for custom Pine indicators. TradingView's WebSocket (`wss://data.tradingview.com/`) delivers raw OHLCV market data and some server-computed signals. Custom Pine Script indicators are computed CLIENT-SIDE in the browser's JavaScript runtime. Their computed values do NOT flow through the WebSocket. The `du` (data update) messages contain series updates for OHLCV, not for user-defined `plot()` outputs. The `tradingview-scraper` library (0xrushi, 396 stars) confirms this -- it extracts OHLCV, not custom indicators. | Use Data Window hover-scrape for indicator extraction (DOM text, exact values). Use `tvdatafeed` or WebSocket for OHLCV candle data only. |
| A11 | **Pine Script syntax highlighting improvements in Monaco** | Monaco already has basic Pine Script syntax mode. Deep Pine Script highlighting (autocompletion, type inference, error squiggles) requires parsing Pine Script's grammar -- which is undocumented, version-dependent, and a rabbit hole. | Use existing Monaco Pine mode. Users who want better IDE experience use TradingView's native editor directly. |

---

## Indicator Data Extraction -- Deep Dive

This is the single most technically challenging feature and the one where existing research (including the prior version of this document) had the most significant inaccuracies. A detailed analysis is warranted.

### The Core Problem

TradingView computes custom Pine Script indicator values INSIDE the browser. When you add an EMA(20) indicator via Pine Script, the calculation happens in TradingView's client-side JavaScript engine. The resulting values are never sent over the network -- they exist only in the browser's memory and are rendered onto the chart canvas.

This means you CANNOT extract custom indicator values by:
- Intercepting WebSocket messages (those carry OHLCV, not indicator data)
- Intercepting HTTP responses (no server round-trip for computed values)
- Using `tradingview-ta` (returns pre-built analysis summaries, not custom Pine plots)

You CAN extract custom indicator values by:
- Reading them from TradingView's UI surfaces that display the computed values as text

### Approach 1: Data Window Hover-Scrape (RECOMMENDED -- PRIMARY)

**How it works:** TradingView's "Data Window" is a right-side panel that shows all indicator values for whichever bar the mouse cursor is hovering over. Playwright moves the mouse across the chart, one bar position at a time, and reads the Data Window DOM for each position.

**Implementation:**
1. Enable Data Window panel (keyboard shortcut or sidebar button click)
2. Query chart canvas bounding box for mouse coordinate mapping
3. For each bar position (left to right or right to left):
   a. Move mouse to the chart at the pixel x-coordinate corresponding to this bar
   b. Wait briefly (~50-100ms) for Data Window to update
   c. Read all indicator name/value pairs from Data Window DOM
   d. Also read the timestamp/OHLCV row to align data with correct bar
4. Assemble `IndicatorSeries[]` from collected per-bar data

**Performance:**
- ~100-200ms per bar (mouse move + DOM settle + DOM read)
- 200 bars = 20-40 seconds
- 500 bars = 50-100 seconds
- 1000 bars = 100-200 seconds

**Pros:**
- Works on free TradingView tier
- Returns exact numerical values (text, not pixels)
- Captures ALL plotted indicators simultaneously (multi-indicator in single pass)
- No Pine Script modification required
- Values match exactly what TradingView displays to the user

**Cons:**
- Slow: O(n_bars) with significant constant factor
- Bar-to-pixel mapping requires understanding chart zoom, scroll position, and bar spacing
- Must handle chart scrolling for bars beyond the visible window
- DOM selectors for Data Window change with TradingView updates
- Some indicators show "n/a" for warmup bars (need to handle gracefully)

**Mitigation for speed:**
- Extract only the user's date range, not all visible bars
- Cache results aggressively (D4) so re-runs are instant
- Show progress (D6) so users know extraction is working
- Consider extracting every Nth bar for a "quick preview" mode, then fill in details

**Confidence: MEDIUM** -- The approach is sound and used by the `tradingview-mcp` project for chart data. DOM selectors need live validation against current TradingView.

### Approach 2: Strategy Tester Panel Scrape (for strategies with trades)

**How it works:** When a Pine `strategy()` script runs, TradingView shows a "Strategy Tester" tab in the bottom panel with trade lists, performance metrics, and an equity curve. Playwright scrapes the trade table.

**Data available:**
- List of Trades: Trade #, Type (Long Entry/Exit, Short Entry/Exit), Signal name, Date/Time, Price, Contracts/Shares, Profit (absolute and %), Cumulative Profit, Bars in trade
- Performance Summary: Net Profit, Total Trades, Win Rate, Profit Factor, Max Drawdown, Sharpe Ratio
- Equity Curve: visualized but also available as data in the performance table

**Maps to:** Existing `TradeEvent` contract (timestamp, side, price, qty, reason, source_engine).

**Confidence: MEDIUM** -- Strategy Tester DOM is more stable than chart DOM because it uses standard HTML tables.

### Approach 3: Internal JavaScript API Access (EXPERIMENTAL)

**How it works:** TradingView exposes chart internals on `window.TradingView` or similar global objects. Playwright can `page.evaluate()` JavaScript to probe these objects for computed study/indicator data.

**Example probe:**
```javascript
// These API surfaces are undocumented and obfuscated
window.TradingView?.activeChart?.()?.getAllStudies()
window._exposed_chartWidget?.studies_?.()
```

**Pros:** If it works, it is fast (single JS call, no mouse movement).
**Cons:** Completely undocumented. Object names are minified and change between deployments. May be removed or break without notice.
**Verdict:** Investigate during implementation as an optimization. Do NOT rely on it for the primary path.

**Confidence: LOW** -- Undocumented internal API.

### Recommended Extraction Pipeline

| Data Type | Primary Method | Fallback | Confidence |
|-----------|---------------|----------|------------|
| OHLCV candles | `tvdatafeed` library (no browser) | Existing dataset if same symbol/TF | HIGH |
| Indicator plot values | Data Window hover-scrape | JS API probe (if available) | MEDIUM |
| Strategy trade events | Strategy Tester panel DOM scrape | None | MEDIUM |
| Compilation errors | Pine Editor error panel DOM | Console log monitoring | HIGH |
| Script version (v4/v5/v6) | Regex on `//@version=N` header | Assume v5 | HIGH |

---

## Feature Dependencies

```
T1 (Session Login) ─────────────────────────────────┐
                                                      v
T6 (Symbol/TF Config) ───> T2 (Pine Paste+Apply) ───> T3 (Error Detection)
                                   │
                                   v
                    T5 (Indicator Extraction) ───> T9 (Contract Format)
                                   │                        │
                                   v                        v
                    D3 (Trade Event Extraction)     D2 (Pine-vs-Python Comparison)
                                   │                   [already built]
                                   v
                    D4 (Result Caching)

T4 (OHLCV Data) ── independent (tvdatafeed, no browser needed)
                    Can run in parallel with T1/T2 development

T7 (Error Handling) ── cross-cutting concern, applies to all Playwright features
T8 (Async Worker) ── infrastructure prerequisite before any feature ships to users

D1 (Auto-run) ── requires T2 + T8 + frontend wiring
D5 (Multi-indicator) ── inherent to T5 Data Window approach (all indicators per hover)
D6 (Progress WS) ── requires T8, extends existing LiveBarEvent pattern
D7 (Session Health) ── requires T1, extends existing DependencyStatus
D8 (Headless Toggle) ── standalone config, trivial
D9 (Screenshot Debug) ── standalone, applies to T7 error handling
D10 (Selector Health) ── requires T2 selectors to be defined first
```

**Critical path:** T1 -> T8 -> T2 -> T5 -> T9 -> D2 (existing)

This is the minimum chain to get "paste Pine Script, see comparison with Python" working end-to-end.

---

## MVP Recommendation

### Phase 1: Infrastructure + Data Foundation (Days 1-5)

Build the foundation that everything else depends on.

1. **T8 - Async worker infrastructure** -- Set up `asyncio.Queue`, `TVTask` model, `TVAutomationService` skeleton, WebSocket endpoint for progress. Use existing `RunLifecycle` state machine as reference.
2. **T1 - Session login + persistence** -- Implement `TVSessionManager` with Playwright `storage_state`. Manual login flow (headed browser, user authenticates, cookies saved encrypted).
3. **T4 - OHLCV candle data via tvdatafeed** -- Integrate `tvdatafeed` library for fast OHLCV extraction. Validate symbol+timeframe before launching browser automation. This also provides candles for the chart panel without depending on Playwright.

### Phase 2: Core Playwright Automation (Days 6-15)

Build the Pine Script execution pipeline.

4. **T2 - Pine Script paste + apply** -- Core Playwright automation with Page Object Model. Navigate to chart, open Pine Editor, paste code, click Apply. Centralized selectors dict.
5. **T3 - Compilation error detection** -- After applying, check for error panel. Return structured errors.
6. **T6 - Symbol + timeframe configuration** -- Set via URL parameters or toolbar interaction. Validate against `tvdatafeed` symbol list.
7. **T7 - Error handling + D9 (screenshot on failure)** -- Timeouts, retries, structured error types, debug screenshots.

### Phase 3: Data Extraction -- The Hard Part (Days 16-25)

This is where the real value gets created.

8. **T5 + D5 - Indicator series extraction (multi-indicator)** -- Data Window hover-scrape. This is the most complex feature. Budget extra time for: bar-to-pixel coordinate mapping, chart scrolling for non-visible bars, handling "n/a" warmup values, parsing various number formats.
9. **T9 - Result format mapping** -- Convert extracted data into `IndicatorSeries[]`, `TradeEvent[]`, `CandlePoint[]`. Create `BridgeArtifact` via existing `BridgeService`.

### Phase 4: Integration + Polish (Days 26-35)

Wire everything together and add quality-of-life features.

10. **D1 - Auto-run on paste** -- Frontend debounce + API trigger. Monaco editor onChange -> debounce -> POST /tv-automation/run.
11. **D3 - Strategy trade event extraction** -- Scrape Strategy Tester panel for trade lists.
12. **D6 - Progress WebSocket** -- Granular status updates during extraction.
13. **D4 - Result caching** -- Hash-based deduplication in SQLite.
14. **D7 - Session health monitoring** -- Periodic validation, frontend status indicator.
15. **D10 - Selector health check** -- Startup validation of critical selectors.

### Defer (Add When Needed)

- **D8** (Headless toggle) -- Trivial config change, add whenever debugging is needed
- **Pine Script version detection** -- Simple regex, non-critical

---

## Complexity Budget Summary

| Feature | Estimated Days | Risk Level | Risk Factors |
|---------|---------------|------------|--------------|
| T1 Session management | 2-3 | Low | Well-understood Playwright `storage_state` API |
| T2 Pine paste + apply | 3-5 | **High** | TradingView DOM selectors, CodeMirror editor interaction, selector breakage |
| T3 Error detection | 1-2 | Medium | Depends on T2 selector stability |
| T4 OHLCV via tvdatafeed | 1-2 | Low | Mature library, straightforward API |
| T5 Indicator extraction | **5-8** | **Very High** | Hover-scrape complexity, bar-pixel mapping, chart scrolling, number parsing |
| T6 Symbol/TF config | 0.5-1 | Low | URL parameters, well-documented |
| T7 Error handling | 2-3 | Medium | Cross-cutting concern, many edge cases |
| T8 Async worker | 2-3 | Low | Standard FastAPI/asyncio patterns, existing codebase precedent |
| T9 Contract mapping | 1-2 | Low | Contracts already defined in `shared/python/contracts.py` |
| D1 Auto-run on paste | 1-2 | Low | Frontend debounce + existing API patterns |
| D3 Trade extraction | 3-4 | Medium | Strategy Tester panel scraping, table parsing |
| D4 Result caching | 1 | Low | Hash + SQLite lookup, straightforward |
| D5 Multi-indicator | 0 (part of T5) | -- | Natural property of Data Window approach |
| D6 Progress WebSocket | 1-2 | Low | Extends existing LiveBarEvent infrastructure |
| D7 Session health | 1-2 | Low | Periodic check + existing DependencyStatus |
| D9 Screenshot debug | 0.5 | Low | Single Playwright API call |
| D10 Selector health | 1-2 | Medium | Needs selector inventory first |
| **Total** | **~25-40 days** | | T2 and T5 are the schedule risk items |

---

## Key Correction from Prior Research

The prior version of this document and STACK.md recommended **WebSocket interception as the primary extraction method for indicator values** and dismissed Data Window scraping as "LOW reliability." This was incorrect.

**What is actually true:**
- TradingView WebSocket (`wss://data.tradingview.com/`) delivers raw OHLCV market data and server-side computed signals
- Custom Pine Script indicators (`plot()`, `plotshape()`, `strategy.entry()` outputs) are computed CLIENT-SIDE in the browser's JavaScript runtime
- Computed indicator values do NOT flow through the WebSocket -- they exist only in browser memory and rendered UI
- The `tradingview-scraper` library (396 stars) and `tvdatafeed` both confirm they extract OHLCV data, NOT custom indicator values
- The Data Window panel is the only reliable UI surface that displays exact computed indicator values as formatted text

**The ARCHITECTURE.md correctly identifies Data Window scraping as the primary extraction method.** The STACK.md recommendation to use WebSocket interception for indicators should be corrected.

---

## Sources

- **tradingview-mcp** (ali-rajabpour): Playwright-based TradingView chart automation, session via cookie extraction, ~150MB headless browser memory. Demonstrates Playwright + TradingView session persistence pattern. Confidence: MEDIUM (5 stars, but working approach).
- **tvdatafeed** (rongardF): WebSocket-based OHLCV extraction from TradingView, up to 5000 bars, no browser needed. v2.0.0 removed Selenium dependency. Supports live data callbacks. Confidence: HIGH (mature library, widely used).
- **tradingview-ta**: Pre-computed technical analysis API (buy/sell/neutral summaries). Cannot run custom Pine Scripts. Last significant update Oct 2022. Confidence: HIGH (for understanding what it does NOT do).
- **tradingview-multi-tab-stock-scraper** (Onyeksman): Async Playwright scraping of TradingView financial data tables. Demonstrates multi-tab Playwright pattern. Confidence: MEDIUM.
- **0xrushi/tradingview-scraper** (396 stars): WebSocket protocol implementation for TradingView real-time data. Confirms WebSocket delivers OHLCV, not custom indicators. Confidence: MEDIUM.
- **openclaw-tradingview**: Autonomous Pine Script backtesting pipeline -- scrapes community scripts, generates Python backtests. Early stage (4 stars, 2 commits). Confidence: LOW.
- **Existing codebase analysis**: `contracts.py` (IndicatorSeries, TradeEvent, BridgeArtifact, ComparisonResult), `pine_bridge_engine.py`, `pine_local_engine.py`, `bridge_service.py`, `settings.py`. Confidence: HIGH (direct source code reading).
- **TradingView DOM structure**: Pine Editor panel, Data Window panel, Strategy Tester panel, chart canvas behavior. Based on training data + ecosystem patterns. Confidence: MEDIUM (DOM selectors are stale, behavior patterns are likely stable).
- **Playwright storage_state API**: Official documented feature for session persistence. Confidence: HIGH.
