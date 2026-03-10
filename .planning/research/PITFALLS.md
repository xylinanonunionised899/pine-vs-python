# Domain Pitfalls: TradingView Pine Script Automation via Playwright

**Domain:** Browser automation of TradingView for dynamic Pine Script execution and data extraction
**Researched:** 2026-03-10
**Overall confidence:** MEDIUM (official docs verified for Pine Script limits and Playwright APIs; anti-bot and DOM structure claims based on training data -- flagged accordingly)

---

## Critical Pitfalls

Mistakes in this category cause fundamental architecture failures, full rewrites, or permanent account loss.

---

### Pitfall 1: TradingView Charts Are Canvas-Based -- DOM Scraping Cannot Extract Chart Data

**What goes wrong:** Developers assume they can query DOM elements to read candlestick values, indicator lines, or trade markers from TradingView charts. TradingView renders its charts on an HTML5 `<canvas>` element. There are no DOM nodes for individual candles, indicator points, or overlays. CSS selectors cannot reach pixel data inside a canvas.

**Why it happens:** The TradingView chart *looks* like a rich interactive widget with tooltips and crosshairs, so developers assume there is a DOM tree behind it. In reality, the interactive behavior is implemented via JavaScript event handlers on the canvas, and all rendering is GPU-accelerated pixel drawing.

**Consequences:**
- Building an entire DOM-based extraction pipeline that returns nothing
- Attempting OCR on canvas screenshots (fragile, slow, inaccurate)
- Weeks of wasted effort on the wrong extraction approach

**Prevention:**
1. **Do NOT try to scrape chart pixels.** Instead, extract data from the **Data Window** panel (the sidebar that shows OHLCV and indicator values when you hover over a bar). This panel renders actual DOM text nodes that update as you move the crosshair.
2. **Intercept WebSocket messages.** TradingView loads chart data via WebSocket connections (`wss://data.tradingview.com/socket.io/websocket` or similar). Playwright can intercept these with `page.on("websocket")` and parse the incoming JSON/binary frames to get raw OHLCV and indicator series data.
3. **Use the "Export chart data" CSV feature** (available via right-click on chart or keyboard shortcut). This is the most reliable extraction path for strategy/indicator data but only works for some data types and requires user interaction.
4. **Pine Script `log.*()` functions** can output computed values to Pine Logs, which are rendered as DOM text in the Logs panel. Design Pine Scripts to explicitly log the values you need to extract.

**Warning signs:** Your selector queries for chart data return `null` or empty arrays. You find yourself writing pixel-color-matching code.

**Phase relevance:** Must be resolved in the architecture/design phase before any extraction code is written. This is the single most important architectural decision.

**Confidence:** HIGH (TradingView's canvas rendering is well-documented and verifiable by inspecting DevTools on any TradingView chart)

---

### Pitfall 2: Cloudflare Bot Protection Blocks Headless Browsers

**What goes wrong:** TradingView uses Cloudflare's bot management (not just basic Cloudflare, but advanced bot detection). A default Playwright headless browser gets blocked with a Cloudflare challenge page (the "Checking your browser..." interstitial) or an outright 403. The automation never reaches the TradingView chart.

**Why it happens:** Cloudflare detects headless browsers through multiple signals:
- `navigator.webdriver` property being `true`
- Missing or inconsistent browser fingerprint (WebGL, Canvas, AudioContext hashes)
- Missing browser plugins/extensions metadata
- Inconsistent User-Agent vs actual browser capabilities
- TLS fingerprint (JA3/JA4) mismatches
- Behavioral analysis (instant navigation, no mouse movement, no scroll patterns)
- Chrome DevTools Protocol detection

**Consequences:**
- Complete inability to load TradingView pages
- Sporadic "works sometimes, fails sometimes" behavior as Cloudflare adjusts detection thresholds
- Account flagging if you bypass challenges but trigger behavioral analysis

**Prevention:**
1. **Use `headed` mode (not headless) during development and initial session setup.** Run `Browser(headless=False)` for the login/session-capture step. Save the storage state. Then attempt headless for subsequent runs.
2. **Use a persistent browser context** with `browser.new_context(storage_state="session.json")` to reuse an authenticated session rather than logging in each time. Cloudflare is more suspicious of fresh sessions.
3. **Playwright's Chromium with `channel: "chrome"`** uses the real Chrome browser binary, which has a more authentic fingerprint than the bundled Chromium. Use `playwright.chromium.launch(channel="chrome")`.
4. **Add human-like delays.** Use `page.wait_for_timeout(random_between(500, 2000))` between actions. Never execute actions at machine speed.
5. **Consider `playwright-extra` with stealth plugin** (`playwright-stealth` for Python) to patch common detection vectors (`navigator.webdriver`, `chrome.runtime`, etc.).
6. **Do NOT run multiple concurrent browser instances** against TradingView. Single instance, sequential operations.

**Warning signs:** Responses contain "Just a moment..." or "Checking your browser" text. Page content is a Cloudflare challenge page instead of TradingView UI.

**Detection code:**
```python
# Check if Cloudflare blocked you
content = await page.content()
if "Just a moment" in content or "challenge-platform" in content:
    raise CloudflareBlockedError("Cloudflare challenge detected")
```

**Phase relevance:** Must be addressed in Phase 1 (session management). If Cloudflare bypass is unreliable, the entire project approach needs reconsideration.

**Confidence:** MEDIUM (TradingView's specific Cloudflare configuration may vary; the general detection vectors are well-known)

---

### Pitfall 3: TradingView Session Expiry and Cookie Rotation

**What goes wrong:** Saved session cookies expire or get rotated by TradingView, causing silent authentication failures. The automation loads what appears to be TradingView but is actually the logged-out state, which has a completely different DOM structure. Pine Script editor is not available without login.

**Why it happens:**
- TradingView session tokens have finite lifetimes (typically days to weeks, not permanent)
- TradingView may invalidate sessions when it detects unusual access patterns
- Cloudflare `cf_clearance` cookies have short lifetimes (often 15-30 minutes)
- Cookie `SameSite` and `Secure` flags may prevent proper restoration
- TradingView updates its authentication flow periodically

**Consequences:**
- Silent failures where automation runs but operates on logged-out pages
- Pine Script editor unavailable (requires login)
- Data extraction returns public-only data instead of user's indicators
- Automation appears to work but produces wrong/empty results

**Prevention:**
1. **Validate session health before every automation run.** After loading TradingView, check for a known logged-in indicator:
   ```python
   # Check if actually logged in
   user_menu = page.locator('[data-name="header-user-menu-button"]')
   if not await user_menu.is_visible(timeout=5000):
       raise SessionExpiredError("Not logged in")
   ```
2. **Implement automatic re-authentication.** When session validation fails, trigger a fresh login flow (headed mode) and update the stored session.
3. **Store session state with timestamps.** Track when the session was last captured and proactively refresh before expected expiry.
4. **Save FULL storage state** (cookies + localStorage + sessionStorage), not just cookies. TradingView uses localStorage for user preferences and some auth tokens.
5. **Separate Cloudflare cookies from TradingView cookies.** `cf_clearance` expires faster than TradingView session cookies. You may need to re-solve Cloudflare challenges even when TradingView auth is still valid.

**Warning signs:** Automation starts failing after working for a few hours/days. Page structure changes unexpectedly. Pine editor is not found.

**Phase relevance:** Core Phase 1 requirement. Session management is foundational -- every other feature depends on it.

**Confidence:** HIGH (session expiry is standard web authentication behavior; Playwright's `storage_state` API is officially documented)

---

### Pitfall 4: TradingView DOM Structure Is Obfuscated and Changes Without Warning

**What goes wrong:** Selectors break after TradingView deploys updates. TradingView uses dynamically generated CSS class names (e.g., `class="tv-header-wWqp3F8k"`) that change with every build. Hard-coded selectors that work today break tomorrow.

**Why it happens:**
- TradingView uses CSS Modules or similar tooling that generates unique class name hashes per build
- TradingView deploys frequently (often weekly or more)
- No public commitment to DOM stability -- it is not a public API
- A/B testing means different users may see different DOM structures simultaneously
- Free vs paid accounts render different UI layouts

**Consequences:**
- Selectors stop matching, automation silently fails or throws TimeoutError
- Maintenance burden: constant selector updates after every TradingView release
- Flaky tests that pass sometimes and fail other times (due to A/B testing)

**Prevention:**
1. **Prefer `data-*` attribute selectors** over CSS classes. TradingView uses some stable `data-name` attributes on key elements (e.g., `[data-name="header-user-menu-button"]`, `[data-name="pine-editor-button"]`). These are more stable than class names.
2. **Use ARIA roles and labels** where available. Elements like buttons and menus often have `role` and `aria-label` attributes that are more stable.
3. **Use text content selectors as fallback.** `page.get_by_text("Pine Editor")` is more resilient than class-based selectors.
4. **Build a selector abstraction layer.** Centralize all TradingView selectors in a single config file so breakages require updating one file, not hunting through code:
   ```python
   # selectors.py -- single source of truth
   SELECTORS = {
       "pine_editor_tab": '[data-name="pine-editor-button"], text="Pine Editor"',
       "pine_editor_textarea": '.pine-editor-content textarea, [class*="editor"] textarea',
       "add_to_chart_button": 'button:has-text("Add to chart")',
       "errors_panel": '[class*="errors"], [data-name="pine-editor-errors"]',
   }
   ```
5. **Implement selector health checks** that run on startup and report which selectors are broken before attempting the full workflow.
6. **Use composite selectors** with multiple fallbacks separated by commas.

**Warning signs:** `TimeoutError` on previously working selectors. New TradingView UI elements appearing that your automation doesn't account for.

**Phase relevance:** Selector strategy must be defined in architecture/design. The abstraction layer should be built in Phase 1 alongside session management.

**Confidence:** HIGH (CSS module hash generation is a widely known practice; TradingView's obfuscated classes are visible in DevTools)

---

### Pitfall 5: Pine Script Compilation vs Runtime Errors Require Different Handling

**What goes wrong:** Automation treats all Pine Script errors the same way. But compilation errors (syntax errors, type mismatches) appear immediately in the editor's error panel, while runtime errors (execution timeout, memory exceeded, division by zero on specific bars) may only appear after the script runs for several seconds and may manifest as partial results, chart warnings, or silent failures.

**Why it happens:**
- Pine Script has a two-phase execution: compilation (server-side, instant) then execution (bar-by-bar, time-consuming)
- Compilation errors are shown inline in the Pine Editor with red underlines and an error count badge
- Runtime errors may appear as:
  - A "Script execution timed out" banner
  - A "Study error" or "Strategy error" notification
  - A partial chart with missing data points
  - An error count in the Pine Editor status bar
  - Pine Logs with `log.error()` entries
- Some scripts compile successfully but fail on specific symbols, timeframes, or date ranges

**Consequences:**
- Automation reports "success" when Pine Script actually hit a runtime error
- Extracted data is partial or incorrect without any error indication
- Different behavior on different symbols/timeframes causes inconsistent results

**Prevention:**
1. **Implement multi-stage error checking:**
   ```
   Stage 1: After "Add to chart" click, wait 2-3s, check for compilation errors
   Stage 2: Wait for chart to finish rendering (loading spinner gone)
   Stage 3: Check for runtime error banners/notifications
   Stage 4: Verify expected indicator outputs actually appeared on chart
   ```
2. **Check the Pine Editor error panel explicitly:**
   ```python
   error_indicator = page.locator('[class*="error"]').filter(has_text="Error")
   if await error_indicator.count() > 0:
       error_text = await error_indicator.text_content()
       raise PineCompilationError(error_text)
   ```
3. **Verify indicator presence on chart** after supposed successful execution. If your Pine Script should plot 3 indicators but the Data Window only shows 2, something failed silently.
4. **Set explicit timeouts** for Pine execution. Free accounts get 20 seconds execution time; if your wait exceeds this, the script likely timed out.
5. **Log and categorize all error types** for debugging. Create an enum:
   ```python
   class PineErrorType(Enum):
       COMPILATION = "compilation"     # Syntax, type errors
       RUNTIME = "runtime"             # Timeout, memory, division by zero
       PARTIAL = "partial_failure"     # Script ran but some bars failed
       NETWORK = "network"             # TradingView server error
   ```

**Warning signs:** Data extraction returns fewer data points than expected. Chart shows "Error" badge but automation reports success.

**Phase relevance:** Error handling framework should be built in Phase 2 (Pine Script execution). Critical for producing reliable comparison results.

**Confidence:** HIGH (Pine Script compilation/execution model and specific limits verified from official TradingView documentation)

---

### Pitfall 6: Account Ban or Restriction from Automated Access

**What goes wrong:** TradingView detects automated access patterns and bans or restricts the account. This can range from temporary rate limiting to permanent account termination. TradingView's Terms of Service prohibit automated access.

**Why it happens:**
- TradingView ToS explicitly prohibits scraping and automated access
- Rapid, repetitive actions (many script changes in succession) trigger rate limiting
- Consistent access from the same IP with bot-like patterns
- Cloudflare behavioral analysis flags the account
- Running scripts that repeatedly compile and fail (triggers the 1-hour compilation ban after 3 consecutive timeouts -- this is an official Pine Script limitation)

**Consequences:**
- Temporary account lockout (hours to days)
- Permanent account ban (loss of saved scripts, watchlists, settings)
- IP-level blocking affecting all accounts from that IP
- The 1-hour compilation ban after 3 consecutive compilation timeouts is an official TradingView enforcement, not just bot detection

**Prevention:**
1. **Use a dedicated TradingView account** for automation. Never automate on your primary account with saved strategies and watchlists.
2. **Implement aggressive rate limiting.** Minimum 10-second delay between Pine Script compilations. Minimum 30-second delay between full script-change cycles. Never exceed 20-30 script runs per hour.
3. **Pre-validate Pine Script locally** before sending to TradingView. Check for obvious syntax errors (unclosed brackets, unknown functions) to avoid wasting compilation attempts:
   ```python
   def pre_validate_pine(code: str) -> list[str]:
       errors = []
       # Check bracket balance
       if code.count('(') != code.count(')'):
           errors.append("Unbalanced parentheses")
       # Check for required //@version tag
       if not re.match(r'//@version=\d+', code):
           errors.append("Missing //@version directive")
       return errors
   ```
4. **Implement exponential backoff** when errors occur. If TradingView returns errors, increase delays between attempts.
5. **Track compilation attempts** and proactively pause before hitting the 3-consecutive-timeout ban threshold.
6. **Use a queue system** that batches and throttles Pine Script executions rather than running them on-demand.

**Warning signs:** Increasingly frequent Cloudflare challenges. TradingView showing captchas. "Too many requests" errors. Account receiving warning emails.

**Phase relevance:** Rate limiting must be designed into the architecture from Phase 1. The queue/throttle system is a core component, not an afterthought.

**Confidence:** HIGH (the 3-consecutive-compilation-timeout ban is verified from official Pine Script documentation; ToS prohibition of automation is standard for financial platforms)

---

## Moderate Pitfalls

Mistakes that cause significant debugging time or feature reliability issues.

---

### Pitfall 7: Chart Rendering Delays and Non-Deterministic Load Times

**What goes wrong:** Automation clicks "Add to chart" and immediately tries to extract data, but the chart hasn't finished rendering. TradingView charts load asynchronously: the chart frame appears quickly, but data points, indicators, and overlays stream in over seconds. Extraction too early returns incomplete data.

**Why it happens:**
- TradingView loads historical data asynchronously via WebSocket
- Indicator calculations happen server-side and results stream back
- Chart zoom level affects how many bars need to render
- Network latency varies, especially for data-heavy indicators
- TradingView may lazy-load older bars as user scrolls left

**Prevention:**
1. **Wait for the loading spinner to disappear** as a minimum baseline:
   ```python
   await page.wait_for_selector('[class*="spinner"]', state="hidden", timeout=30000)
   ```
2. **Wait for chart data stability.** Poll the Data Window values every 500ms and wait until they stop changing:
   ```python
   async def wait_for_chart_stable(page, timeout=30000):
       prev_data = None
       stable_count = 0
       start = time.time()
       while time.time() - start < timeout / 1000:
           current_data = await extract_data_window_values(page)
           if current_data == prev_data and current_data is not None:
               stable_count += 1
               if stable_count >= 3:  # Stable for 1.5s
                   return current_data
           else:
               stable_count = 0
           prev_data = current_data
           await page.wait_for_timeout(500)
       raise TimeoutError("Chart did not stabilize")
   ```
3. **Never use fixed `sleep()` durations.** A 5-second sleep might be too short for complex strategies and too long for simple indicators. Always use condition-based waits.
4. **Account for "Deep Backtesting" mode** which can take minutes for complex strategies.

**Warning signs:** Data extraction returns different numbers of data points on different runs. First few data points are always `NaN` or zero.

**Phase relevance:** Phase 2 (data extraction). The stability-check pattern should be a reusable utility.

**Confidence:** MEDIUM (async loading is standard for web charting; specific TradingView loading patterns based on training data)

---

### Pitfall 8: Timezone and DST Mismatches in Candle Timestamps

**What goes wrong:** Extracted candle timestamps don't match the Python strategy's timestamps, causing the comparison engine to produce incorrect diffs. TradingView displays chart time in the user's selected timezone (which may be Exchange timezone, UTC, or local timezone), while the Python side may use UTC, exchange timezone, or the system's local timezone.

**Why it happens:**
- TradingView chart timezone is a user preference, not a fixed value
- Pine Script `time` returns UNIX timestamps in milliseconds (UTC), but displayed times are timezone-adjusted
- The Data Window shows human-readable timestamps in the chart's display timezone
- DST transitions cause 1-hour shifts that affect alignment
- Different exchanges have different trading hours and timezone conventions
- Indian markets (NSE/BSE) use IST (UTC+5:30) with no DST, but comparing against US markets introduces DST complexity

**Prevention:**
1. **Standardize on UTC internally.** Convert all extracted timestamps to UTC immediately. Never store or compare timezone-aware display strings.
2. **Set TradingView chart timezone explicitly** via automation before extracting data:
   ```python
   # Set chart to UTC timezone via settings
   await page.click('[data-name="settings-button"]')
   await page.click('text="Timezone"')
   await page.click('text="UTC"')
   ```
3. **Extract UNIX timestamps, not formatted strings.** If intercepting WebSocket data, timestamps come as UNIX epoch (UTC). If reading Data Window text, you must parse with the correct timezone context.
4. **Handle DST transitions in alignment logic.** When comparing Pine output (e.g., US/Eastern with DST) against Python output, ensure both sides account for the same DST rules.
5. **Test with known data.** Use a specific date range with a known DST transition (e.g., March second Sunday, November first Sunday for US) to verify alignment doesn't break.

**Warning signs:** Comparison engine shows "all bars misaligned by 1 hour" during certain months. Pine and Python results match for months then suddenly diverge.

**Phase relevance:** Phase 2-3 (comparison engine integration). Must be designed into the data model from the start.

**Confidence:** HIGH (timezone handling in financial data is a well-documented problem domain)

---

### Pitfall 9: Memory Leaks in Long-Running Playwright Instances

**What goes wrong:** The background worker process that runs Playwright grows in memory over time, eventually consuming all available RAM and crashing. This is especially severe when running many Pine Script executions sequentially without proper cleanup.

**Why it happens:**
- Each page navigation accumulates browser memory (DOM nodes, JavaScript heap, WebSocket connections)
- TradingView is a heavy single-page application that does not release resources when navigating between chart views
- Playwright's `BrowserContext` retains all page history and caches
- Failed navigations leave orphaned event listeners
- Screenshot captures consume memory if not properly discarded
- WebSocket message interception buffers accumulate if not consumed

**Prevention:**
1. **Create a fresh BrowserContext for each batch of operations** (e.g., every 5-10 script runs), not one context for the entire process lifetime:
   ```python
   async def execute_pine_batch(scripts: list, session_path: str):
       browser = await playwright.chromium.launch(channel="chrome")
       try:
           for i, script in enumerate(scripts):
               if i % 5 == 0:  # Fresh context every 5 runs
                   if 'context' in dir():
                       await context.close()
                   context = await browser.new_context(storage_state=session_path)
                   page = await context.new_page()
                   await page.goto("https://www.tradingview.com/chart/")
               await execute_single_script(page, script)
       finally:
           await browser.close()
   ```
2. **Close pages explicitly** after extracting data. Don't leave stale pages open.
3. **Set resource limits** on the worker process. Use `resource.setrlimit` (Linux/WSL) or monitor with `psutil` (Windows) and restart the worker when memory exceeds a threshold.
4. **Disable image loading** if you only need data (not screenshots):
   ```python
   await context.route("**/*.{png,jpg,jpeg,gif,svg,webp}", lambda route: route.abort())
   ```
5. **Clear browser cache periodically** with `context.clear_cookies()` and create new contexts.

**Warning signs:** Worker process memory grows monotonically over hours. System becomes sluggish after many script runs. OOM kills in production.

**Phase relevance:** Phase 1 (worker architecture). The context-recycling pattern must be built into the worker from the start.

**Confidence:** MEDIUM (Playwright memory behavior is well-known; TradingView-specific memory pressure based on training data observations)

---

### Pitfall 10: Free Account Limitations Block Key Automation Features

**What goes wrong:** Features critical to automation are unavailable or severely limited on TradingView's free tier, and the automation silently fails or produces limited results.

**Why it happens:** TradingView free accounts have significant restrictions:
- **1 indicator per chart** (paid: 2-25 depending on plan)
- **5,000 historical bars** (paid: up to 40,000)
- **20-second script execution timeout** (paid: 40 seconds)
- **No multiple charts per tab** (limits parallel extraction)
- **Limited `request.*()` calls** (40 vs 64 on Ultimate)
- **100,000 intrabar limit** vs 200,000 on Ultimate
- **No export to CSV** on some data types
- **Ads and pop-ups** that interfere with automation
- **Limited saved chart layouts** (may interfere with automation state)

**Consequences:**
- Complex Pine Scripts with multiple indicators fail on free accounts
- Limited historical data means backtests are less meaningful
- Scripts that work on paid accounts time out on free accounts
- Pop-ups and ads break selector-based navigation
- One-indicator limit means you cannot test multi-indicator strategies

**Prevention:**
1. **Design for free-tier constraints from day one.** Assume 1 indicator per chart, 5K bars, 20s timeout.
2. **Handle ads and pop-ups proactively.** Register handlers to dismiss common popups:
   ```python
   # Dismiss upgrade prompts, cookie banners, survey popups
   page.add_locator_handler(
       page.get_by_text("Maybe later"),
       lambda: page.get_by_text("Maybe later").click()
   )
   page.add_locator_handler(
       page.get_by_text("Not now"),
       lambda: page.get_by_text("Not now").click()
   )
   ```
3. **For multi-indicator strategies on free tier:** Run each indicator as a separate script execution and merge results in Python. Accept the slower execution time.
4. **Document which features require paid tier** so users know what to expect. Make it a clear setting:
   ```python
   TRADINGVIEW_PLAN = "free"  # free | essential | plus | premium | expert | ultimate
   MAX_INDICATORS = 1 if TRADINGVIEW_PLAN == "free" else ...
   ```
5. **Consider Essential plan ($12.95/month)** if free tier limitations are blocking core functionality. It provides 2 indicators per chart and 10K historical bars.

**Warning signs:** "Upgrade to unlock" modals appear during automation. Scripts compile but only partial indicators display. Data extraction returns fewer bars than expected.

**Phase relevance:** Must be acknowledged in Phase 1 requirements. UI should show the current plan's limitations.

**Confidence:** HIGH (TradingView plan limitations are officially documented and verified)

---

### Pitfall 11: Pine Script Version Incompatibility

**What goes wrong:** Users paste Pine Script v3, v4, or v5 code into the automation, but the automation assumes a specific version. Different Pine versions have incompatible syntax, and TradingView's Pine editor auto-detects version from the `//@version=N` header, which affects available functions, variable scoping rules, and plot behavior.

**Why it happens:**
- Pine Script has gone through major breaking changes between v1-v6
- v3 used `study()` instead of v5's `indicator()`
- v4 introduced `var` keyword scoping changes
- v5 introduced namespaces (`ta.sma` instead of `sma`)
- v6 is latest with methods, objects, and additional features
- Scripts found online may be any version
- Users may paste code without a `//@version` header (defaults to v1)

**Prevention:**
1. **Detect and validate Pine version before execution:**
   ```python
   def detect_pine_version(code: str) -> int:
       match = re.search(r'//@version=(\d+)', code)
       if match:
           return int(match.group(1))
       return 1  # Default (very old, likely broken)
   ```
2. **Warn users about old versions.** v1-v3 scripts are likely to fail or produce unexpected results. Recommend converting to v5/v6.
3. **Test with all common versions** (v4, v5, v6) during development. v5 and v6 cover the vast majority of modern scripts.
4. **The Pine Editor on TradingView handles version detection itself** -- your automation just needs to paste the code and let TradingView compile it. The pitfall is in error handling: error messages differ by version.

**Warning signs:** Scripts that work in TradingView's web editor fail through automation. Error messages reference functions that should exist.

**Phase relevance:** Phase 2 (Pine Script execution). Version detection should be part of the pre-validation step.

**Confidence:** HIGH (Pine Script versioning is officially documented)

---

## Minor Pitfalls

Issues that cause annoyance, minor bugs, or debugging time but are not structurally damaging.

---

### Pitfall 12: TradingView Pine Editor Uses CodeMirror, Not a Standard Textarea

**What goes wrong:** Automation tries to type Pine Script code into the Pine Editor using `page.fill()` or `page.type()` on a `<textarea>`, but the Pine Editor is a CodeMirror (or similar rich code editor) instance. Standard input methods may not work, or may not trigger the editor's change detection.

**Prevention:**
1. **Use keyboard shortcuts to select all and paste.** This is more reliable than trying to interact with CodeMirror's internal DOM:
   ```python
   # Click into the Pine editor area
   await pine_editor.click()
   # Select all existing content
   await page.keyboard.press("Control+A")
   # Delete it
   await page.keyboard.press("Delete")
   # Paste new content from clipboard
   # (Set clipboard first via page.evaluate or system clipboard)
   await page.evaluate(f'navigator.clipboard.writeText({json.dumps(pine_code)})')
   await page.keyboard.press("Control+V")
   ```
2. **Alternative: Use TradingView's JavaScript API internally** if you can access the editor instance:
   ```python
   await page.evaluate('''
       // CodeMirror API (if accessible)
       const editor = document.querySelector('.CodeMirror').CodeMirror;
       editor.setValue(arguments[0]);
   ''', pine_code)
   ```
3. **Verify the code was actually entered** by reading it back from the editor before clicking "Add to chart."

**Warning signs:** Pine Editor shows empty content after typing. Only first line appears. Code is entered but syntax highlighting doesn't activate.

**Phase relevance:** Phase 2 (Pine Script execution). Quick to resolve once understood.

**Confidence:** MEDIUM (TradingView's editor technology may have changed; CodeMirror is common but not confirmed for latest version)

---

### Pitfall 13: Network Instability During Data Extraction

**What goes wrong:** Intermittent network issues cause partial page loads, WebSocket disconnections, or incomplete data streams. The automation either crashes or silently produces incomplete results.

**Prevention:**
1. **Implement retry logic with exponential backoff** for all network-dependent operations:
   ```python
   async def with_retry(coro_fn, max_retries=3, base_delay=2):
       for attempt in range(max_retries):
           try:
               return await coro_fn()
           except (TimeoutError, NetworkError) as e:
               if attempt == max_retries - 1:
                   raise
               delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
               await asyncio.sleep(delay)
   ```
2. **Detect WebSocket disconnection** and wait for reconnection before extracting data.
3. **Validate extraction completeness.** Check that the number of extracted data points matches expected bar count for the selected timeframe and date range.
4. **Set Playwright navigation timeout** appropriately (30-60 seconds instead of default 30 seconds for TradingView's heavy pages).

**Warning signs:** Intermittent `TimeoutError` on navigation. Extracted data has gaps. Different data point counts on identical runs.

**Phase relevance:** Phase 2 (data extraction). Standard reliability engineering.

**Confidence:** HIGH (standard web automation reliability pattern)

---

### Pitfall 14: Playwright Process Cleanup on Windows

**What goes wrong:** On Windows (this project's platform), Playwright browser processes sometimes survive after the Python process crashes or is killed. Orphaned `chrome.exe` or `chromium.exe` processes accumulate, consuming RAM and potentially locking ports.

**Prevention:**
1. **Always use `async with` or explicit `finally` blocks:**
   ```python
   async with async_playwright() as p:
       browser = await p.chromium.launch(channel="chrome")
       try:
           # ... automation code
       finally:
           await browser.close()
   ```
2. **Register an atexit handler** to kill orphaned processes:
   ```python
   import atexit, subprocess
   def cleanup_browsers():
       subprocess.run(["taskkill", "/F", "/IM", "chrome.exe", "/T"],
                      capture_output=True)
   atexit.register(cleanup_browsers)
   ```
3. **Use a process manager** in the background worker that monitors and kills zombie browser processes.
4. **Set Playwright's `PLAYWRIGHT_BROWSERS_PATH`** to a known location so you can identify which Chrome processes are Playwright-spawned vs user's regular Chrome.

**Warning signs:** Task Manager shows many `chrome.exe` processes after automation errors. System memory usage climbs over multiple automation sessions.

**Phase relevance:** Phase 1 (worker process architecture). Must be built into the worker lifecycle.

**Confidence:** HIGH (well-known Windows-specific Playwright issue)

---

### Pitfall 15: TradingView Data Window Hover-Based Extraction Is Fragile

**What goes wrong:** The primary non-canvas data extraction method (reading values from the Data Window as the crosshair moves over bars) requires pixel-precise mouse movements and is sensitive to chart zoom, scroll position, and window size.

**Prevention:**
1. **Set a consistent viewport size** before extraction:
   ```python
   context = await browser.new_context(
       viewport={"width": 1920, "height": 1080},
       storage_state="session.json"
   )
   ```
2. **Use keyboard navigation** (left/right arrow keys) to move between bars instead of mouse hover. This is more deterministic:
   ```python
   for i in range(num_bars):
       data = await read_data_window(page)
       results.append(data)
       await page.keyboard.press("ArrowLeft")  # Move to previous bar
       await page.wait_for_timeout(100)  # Let Data Window update
   ```
3. **Prefer WebSocket interception** over Data Window scraping when possible. It provides the raw data without needing UI interaction.
4. **Prefer the CSV export** path for bulk historical data. Data Window scraping should be a fallback for indicator values that aren't in the CSV export.

**Warning signs:** Extracted values skip bars or duplicate bars. Values don't change when moving between bars. Extraction speed is extremely slow (seconds per bar).

**Phase relevance:** Phase 2 (data extraction). Extraction strategy is a key architectural decision.

**Confidence:** MEDIUM (Data Window extraction approach based on TradingView UI knowledge; specific behavior may vary)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation | Severity |
|-------------|---------------|------------|----------|
| Session management (Phase 1) | Cloudflare blocks headless browser (#2), Session expiry (#3) | Use `channel="chrome"`, headed mode for login, storage_state persistence, session health checks | CRITICAL |
| Worker architecture (Phase 1) | Memory leaks (#9), Process cleanup (#14) | Context recycling every N runs, atexit handlers, process monitoring | HIGH |
| Pine Script execution (Phase 2) | Editor is not a textarea (#12), Version incompatibility (#11) | Clipboard-based paste (Ctrl+A, Ctrl+V), version detection + validation | MEDIUM |
| Error handling (Phase 2) | Compilation vs runtime errors (#5), Silent partial failures | Multi-stage error checking after each execution, indicator presence verification | HIGH |
| Data extraction (Phase 2) | Canvas-based charts (#1), Hover fragility (#15) | WebSocket interception as primary path, Data Window as secondary, never canvas scraping | CRITICAL |
| Rate limiting (Phase 2) | Account ban (#6), Compilation ban (3 timeouts) | 10s+ delay between compilations, pre-validation, dedicated account | HIGH |
| Comparison/alignment (Phase 3) | Timezone/DST mismatch (#8) | UTC standardization, explicit timezone setting, DST transition testing | MEDIUM |
| Selector maintenance (ongoing) | DOM structure changes (#4) | Selector abstraction layer, `data-name` attributes, health checks on startup | HIGH |
| Free tier operation (ongoing) | 1 indicator limit, 5K bars, ads/popups (#10) | Design for constraints, popup dismissal handlers, plan-aware configuration | MEDIUM |
| Network reliability (ongoing) | Partial loads, WebSocket drops (#13) | Retry with backoff, completeness validation, appropriate timeouts | MEDIUM |

---

## TradingView-Specific Technical Notes

### Pine Script Execution Limits (Official, Verified)

| Limit | Free/Basic | Paid Plans | Ultimate |
|-------|-----------|------------|----------|
| Script execution timeout | 20 seconds | 40 seconds | 40 seconds |
| Compilation timeout | 2 minutes (all plans) | 2 minutes | 2 minutes |
| Compilation ban trigger | 3 consecutive timeouts = 1 hour ban | Same | Same |
| Indicators per chart | 1 | 2-25 | 25 |
| Historical bars | 5,000 | 10,000-25,000 | 40,000 |
| Max plot count | 64 | 64 | 64 |
| Max `request.*()` calls | 40 | 40 | 64 |
| Max backtesting orders | 9,000 | 9,000 | 9,000 (1M with Deep BT) |
| Compiled tokens limit | 100,000 per script | Same | Same |
| Collection elements | 100,000 max | Same | Same |

### Data Extraction Strategy Ranking

| Method | Reliability | Speed | Complexity | Recommended |
|--------|------------|-------|------------|-------------|
| WebSocket interception | HIGH | FAST | HIGH | Primary for OHLCV data |
| Pine Logs (`log.*()`) | HIGH | MEDIUM | MEDIUM | Primary for indicator values |
| CSV export (right-click) | HIGH | SLOW | MEDIUM | Bulk historical data |
| Data Window keyboard nav | MEDIUM | SLOW | MEDIUM | Fallback for indicator values |
| Data Window mouse hover | LOW | VERY SLOW | HIGH | Avoid if possible |
| Canvas pixel analysis | VERY LOW | SLOW | VERY HIGH | Never use |

---

## Sources

- TradingView Pine Script Documentation: Limitations (https://www.tradingview.com/pine-script-docs/writing/limitations) -- HIGH confidence, official docs
- TradingView Pine Script Documentation: Debugging (https://www.tradingview.com/pine-script-docs/writing/debugging) -- HIGH confidence, official docs
- TradingView Pine Script Documentation: Welcome/Intro (https://www.tradingview.com/pine-script-docs/welcome) -- HIGH confidence, official docs
- Playwright Python Documentation: Authentication (https://playwright.dev/python/docs/auth) -- HIGH confidence, official docs
- Playwright Python Documentation: Navigations (https://playwright.dev/python/docs/navigations) -- HIGH confidence, official docs
- Playwright Python Documentation: Browser Context Cookies API -- HIGH confidence, official docs
- TradingView canvas rendering architecture, Cloudflare protection details, DOM obfuscation patterns -- MEDIUM confidence, based on training data and general web automation knowledge
- Free vs paid account limitations -- HIGH confidence, verified from official Pine Script limitation docs
