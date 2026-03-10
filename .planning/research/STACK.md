# Technology Stack: TradingView Pine Script Automation

**Project:** Trading Strategy Comparator -- Dynamic Pine Script Engine
**Researched:** 2026-03-10
**Mode:** Brownfield addition to existing FastAPI + React + TypeScript app

## Recommended Stack

### Core Automation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| playwright (Python) | 1.58.0 | Browser automation for TradingView | Already in ecosystem (VYOM project), best Python browser automation library, async-native, Microsoft-maintained, storage_state API for session persistence. Superior to Selenium in every dimension: speed, reliability, API design. | HIGH |
| playwright-stealth | 2.0.2 | Anti-bot evasion for TradingView | TradingView uses Cloudflare and fingerprinting. Without stealth patches, headless Playwright triggers bot detection. This is the actively maintained fork (Feb 2026) with configurable evasion techniques. Not bulletproof but sufficient for logged-in sessions with persistent context. | MEDIUM |
| cryptography | 46.0.5 | Encrypt stored TradingView session cookies | Session JSON files contain auth tokens. Fernet symmetric encryption (same pattern as VYOM auth/credential_store). Never store plaintext session files. | HIGH |

### Data Extraction

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Playwright DOM scraping | (part of playwright) | Extract custom Pine Script indicator values from Data Window panel | Custom Pine indicators are computed CLIENT-SIDE in the browser. Their values do NOT flow through WebSocket. The Data Window panel is the only reliable UI surface displaying exact computed values as formatted text. Hover-scrape (move mouse across bars, read Data Window DOM) is the primary extraction method. | MEDIUM |
| tradingview-scraper | 0.4.20 | OHLCV candle data via WebSocket (no browser needed) | Provides WebSocket protocol implementation for TradingView's raw OHLCV data feed. Use ONLY for candle data, NOT for custom indicator values. Decouples candle acquisition from the slow browser pipeline. | MEDIUM |

### Background Worker

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| asyncio (stdlib) | Python 3.11 built-in | Async task orchestration | Playwright is async-native. FastAPI is async-native. Use asyncio.create_task() for background Pine execution. No need for Celery -- this is a single-user local tool, not a distributed system. | HIGH |
| asyncio.Queue | Python 3.11 built-in | Pine Script execution queue | Rate-limit TradingView interactions. Queue scripts, process one at a time with cooldown. Simple, no external deps. | HIGH |

### Existing Stack (NO CHANGES)

| Technology | Version | Purpose | Status |
|------------|---------|---------|--------|
| FastAPI | existing | Backend API | Keep as-is, add new router for automation endpoints |
| React + TypeScript | existing | Frontend | Keep as-is, add PineAutomation tab/components |
| Vite | existing | Frontend build | No changes |
| Monaco Editor | existing | Pine Script editor | Already handles Pine syntax |
| lightweight-charts | existing | Chart rendering | Already renders candles + indicators |
| SQLite + DuckDB | existing | Storage | Extend for automation results |
| Pydantic | existing | Data contracts | Extend BridgeArtifact model |

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| Selenium / selenium-wire | Playwright is strictly superior: faster, more reliable, better async support, better API. Selenium is legacy. |
| Celery / Redis / RabbitMQ | Massive overkill for a single-user local tool. asyncio.Queue handles the job. Celery adds Redis dependency, worker management, serialization complexity -- all unnecessary. |
| tradingview-ta (v3.3.0) | Only extracts pre-computed technical analysis summaries (buy/sell/neutral). Cannot run custom Pine Scripts. Last updated Oct 2022 -- effectively abandoned. |
| undetected-playwright (v0.3.0) | Last updated May 2024. playwright-stealth is more actively maintained (Feb 2026) and better documented. |
| Puppeteer (Node.js) | Would require a Node.js sidecar process. The project is Python-native. Playwright Python has feature parity. |
| TradingView Charting Library | Requires a paid license and TradingView partnership. Irrelevant for automation of the TradingView web app. |
| browser-use (from VYOM) | High-level AI browser agent. Too abstract for precise DOM manipulation needed here. We need direct Playwright control over specific TradingView elements, not LLM-driven browsing. |
| WebSocket interception for INDICATOR values | **CRITICAL:** TradingView WebSocket delivers raw OHLCV market data only. Custom Pine Script indicators (plot(), plotshape(), strategy signals) are computed CLIENT-SIDE in the browser's JavaScript runtime. Their computed values do NOT appear in WebSocket messages. Use WebSocket only for candle data. |
| OCR / Vision / Screenshot-based extraction | Lossy, slow, viewport-dependent. The comparison engine needs exact floats (tolerance 1e-6). OCR introduces unacceptable precision errors. |

## CRITICAL: Data Extraction Architecture

This is the single most important technical decision for the project.

### What works for WHAT

| Data Type | Extraction Method | Why This Method | Confidence |
|-----------|------------------|-----------------|------------|
| OHLCV candle data | `tradingview-scraper` WebSocket OR reuse imported dataset | WebSocket carries raw market data. No browser needed. Fast (2-3s). | HIGH |
| Custom indicator values (SMA, EMA, custom plots) | **Data Window hover-scrape via Playwright** | Computed client-side in browser JS. Only visible in Data Window panel as DOM text. Must move mouse bar-by-bar and read values. | MEDIUM |
| Strategy trade events | **Strategy Tester panel DOM scrape via Playwright** | Trade table rendered as HTML in Strategy Tester tab. Standard table scraping. | MEDIUM |
| Compilation errors | **Pine Editor error panel DOM via Playwright** | Errors shown inline in editor panel. | HIGH |

### Why WebSocket Interception Does NOT Work for Indicators

TradingView's architecture:
1. Browser connects to `wss://data.tradingview.com/` via WebSocket
2. Server sends raw OHLCV market data (open, high, low, close, volume per bar)
3. Browser's JavaScript Pine Script engine computes indicator values LOCALLY
4. Computed values exist ONLY in browser memory and rendered UI
5. Values are NEVER sent back over the wire

This means `tradingview-scraper` and similar WebSocket-based tools extract OHLCV only, never custom `plot()` output. The Data Window hover-scrape is the primary extraction path.

### Data Window Hover-Scrape Pattern

```python
async def extract_indicators(page: Page, bar_count: int) -> list[IndicatorSeries]:
    """
    Move mouse across chart bars, read indicator values from Data Window panel.
    ~100-200ms per bar. 200 bars = 20-40 seconds.
    """
    # 1. Enable Data Window panel
    await page.keyboard.press("Alt+d")
    await page.wait_for_selector('[data-name="legend-source-item"]')

    # 2. Get chart bounding box for coordinate mapping
    chart = await page.query_selector('.chart-markup-table')
    box = await chart.bounding_box()

    series_data: dict[str, list] = {}

    # 3. Sweep cursor across chart bars
    for i in range(bar_count):
        x = box['x'] + (i / bar_count) * box['width']
        y = box['y'] + box['height'] / 2
        await page.mouse.move(x, y)
        await page.wait_for_timeout(100)  # Let Data Window update

        # 4. Read all indicator name/value pairs from Data Window DOM
        values = await page.evaluate('''() => {
            const items = document.querySelectorAll(
                '[data-name="legend-source-item"] [class*="valuesWrapper"] > div'
            );
            return Array.from(items).map(el => ({
                name: el.querySelector('[class*="title"]')?.textContent?.trim(),
                value: el.querySelector('[class*="value"]')?.textContent?.trim()
            }));
        }''')

        for v in values:
            if v['name'] and v['value']:
                series_data.setdefault(v['name'], []).append(v['value'])

    # 5. Convert to IndicatorSeries
    return [
        IndicatorSeries(name=name, values=[
            IndicatorPoint(timestamp=..., value=float(v)) for v in vals
        ])
        for name, vals in series_data.items()
    ]
```

**Performance mitigation:**
- Cache results by `hash(pine_code + symbol + timeframe)` -- re-runs are instant
- Show granular progress: "Extracting bar 150/500..."
- Extract only the user's date range, not all visible bars
- Consider keyboard arrow key navigation instead of mouse (more deterministic)

### Alternative: Keyboard Navigation (More Deterministic)

```python
# Instead of mouse coordinate math, use arrow keys:
await page.keyboard.press("End")      # Go to latest bar
for i in range(bar_count):
    data = await read_data_window(page)
    results.append(data)
    await page.keyboard.press("ArrowLeft")  # Previous bar
    await page.wait_for_timeout(100)
```

This avoids pixel-to-bar coordinate mapping entirely. More reliable, same speed.

## TradingView-Specific Automation Patterns

### Authentication and Session Persistence

TradingView uses cookie-based authentication. Two approaches:

**Approach A: storage_state (simpler, recommended for start)**

```python
# FIRST TIME: Manual login, save session
async def save_tradingview_session():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)  # Visible for manual login
        context = await browser.new_context()
        page = await context.new_page()
        await page.goto("https://www.tradingview.com/accounts/signin/")
        await page.wait_for_url("**/chart/**", timeout=120_000)
        await context.storage_state(path="session/tv_session.json")
        await browser.close()

# SUBSEQUENT RUNS: Reuse session
async def reuse_session():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(storage_state="session/tv_session.json")
        page = await context.new_page()
        await page.goto("https://www.tradingview.com/chart/")
```

**Approach B: launch_persistent_context (more robust for long-term)**

```python
async def launch_with_persistent_session():
    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir="./data/tv_browser_profile",
            headless=True,
            viewport={"width": 1920, "height": 1080},
            locale="en-US",
            timezone_id="Asia/Calcutta",
        )
        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto("https://www.tradingview.com/chart/")
        return context, page
```

**Critical:** Encrypt session files at rest with Fernet. Add `data/tv_browser_profile/` and `session/` to `.gitignore`.

### Pine Script Editor Interaction

TradingView's Pine Script editor is CodeMirror-based. Standard `fill()` does NOT work.

```python
async def paste_pine_script(page, pine_code: str):
    # 1. Open Pine Script editor panel
    pine_tab = page.locator('[data-name="pine-editor"]')
    await pine_tab.click()

    # 2. Focus the editor area
    editor = page.locator('.pine-editor-content .view-lines')
    await editor.click()

    # 3. Select all and clear
    await page.keyboard.press("Control+A")
    await page.keyboard.press("Delete")

    # 4. Paste via clipboard (most reliable for CodeMirror)
    await page.evaluate(
        "(code) => navigator.clipboard.writeText(code)", pine_code
    )
    await page.keyboard.press("Control+V")
```

**IMPORTANT:** Grant clipboard permissions in browser context:
```python
context = await browser.new_context(
    permissions=["clipboard-read", "clipboard-write"],
    ...
)
```

### Triggering Compilation

```python
async def run_pine_script(page):
    add_to_chart = page.locator('[data-name="add-to-chart"]')
    await add_to_chart.click()

    # Wait for compilation: chart legend update OR error panel
    await page.wait_for_timeout(2000)  # Initial settle

    # Check for compilation errors
    error_panel = page.locator('.pine-editor-errors')
    if await error_panel.count() > 0:
        error_text = await error_panel.text_content()
        raise PineCompilationError(error_text)

    # Wait for indicator to appear in chart legend
    await page.wait_for_selector('[data-name="legend-source-item"]', timeout=30_000)
```

### Anti-Bot Configuration

```python
from playwright_stealth import stealth_async

async def create_stealth_context(playwright):
    browser = await playwright.chromium.launch(
        headless=True,
        channel="chrome",  # Use real Chrome binary for better fingerprint
        args=["--disable-blink-features=AutomationControlled"],
    )
    context = await browser.new_context(
        storage_state="session/tv_session.json",
        viewport={"width": 1920, "height": 1080},
        permissions=["clipboard-read", "clipboard-write"],
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    )
    page = await context.new_page()
    await stealth_async(page)
    return browser, context, page
```

### TradingView URL Pattern for Symbol/Timeframe

```python
chart_url = f"https://www.tradingview.com/chart/?symbol={symbol}&interval={timeframe}"
# Timeframe codes: 1=1min, 5=5min, 15=15min, 60=1h, D=1day, W=1week, M=1month
```

## Architecture Integration Points

### New Backend Components

```
backend/app/
  api/
    tv_automation.py          # NEW: FastAPI router for automation endpoints
  services/
    tv_session_service.py     # NEW: Session management (save/load/encrypt)
    tv_automation_service.py  # NEW: Playwright orchestration + task queue
  models/
    tv_contracts.py           # NEW: TVTask, TVTaskStatus models

workers/tradingview_bridge/
    tv_worker.py              # NEW: Singleton Playwright browser worker
    session_manager.py        # NEW: Cookie/localStorage persistence
    script_injector.py        # NEW: Pine Script paste + compile
    data_extractor.py         # NEW: Data Window hover-scrape + Strategy Tester scrape
    tradingview_page.py       # NEW: Page Object Model with centralized selectors
    selectors.py              # NEW: All TradingView DOM selectors with fallbacks
```

### New Frontend Components

```
frontend/src/
  pages/
    PineAutomationPage.tsx    # NEW: Tab for managing TV automation
  components/
    automation/
      TVSessionStatus.tsx     # NEW: Shows TV session health
      TVRunControls.tsx       # NEW: Run/stop buttons
      TVProgressBar.tsx       # NEW: Extraction progress
      TVResultView.tsx        # NEW: Extracted data summary
  services/
    websocket.ts              # EXTEND: add connectTVStream()
    api.ts                    # EXTEND: add TV automation endpoints
```

## Installation

```bash
# Core automation (3 new packages)
pip install playwright==1.58.0
pip install playwright-stealth==2.0.2
pip install cryptography==46.0.5

# Install browser binaries (one-time)
playwright install chromium

# Optional: For OHLCV candle data without browser
pip install tradingview-scraper==0.4.20
```

**No new frontend dependencies needed.** React, Monaco, lightweight-charts already cover all UI needs.

## Version Pinning Rationale

| Package | Pinned Version | Why Pin |
|---------|---------------|---------|
| playwright | 1.58.0 | Browser automation is version-sensitive. Chromium binary must match. |
| playwright-stealth | 2.0.2 | Evasion techniques tuned to specific browser versions. |
| cryptography | 46.0.5 | Security package -- pin to audited version. |
| tradingview-scraper | 0.4.20 | Pre-alpha, API may change between minor versions. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Browser automation | Playwright 1.58.0 | Selenium 4.x | Slower, worse async, worse API, no WebSocket interception |
| Browser automation | Playwright 1.58.0 | browser-use (AI agent) | Too high-level; we need precise DOM control, not LLM-driven browsing |
| Anti-bot | playwright-stealth 2.0.2 | undetected-playwright 0.3.0 | Stale (May 2024), less maintained |
| Background worker | asyncio.Queue | Celery 5.6.2 | Overkill for single-user; adds Redis, serialization, worker management |
| Session encryption | cryptography (Fernet) | python-jose / PyJWT | Not encrypting JWTs; encrypting session files. Fernet is simpler, symmetric. |
| Indicator extraction | Data Window hover-scrape | WebSocket interception | **WebSocket does NOT carry custom indicator values.** Pine indicators are computed client-side. WebSocket only has OHLCV. |
| Indicator extraction | Data Window hover-scrape | tradingview-ta 3.3.0 | Only pre-computed analysis, cannot access custom Pine Script plot() output. |
| OHLCV extraction | tradingview-scraper WS | Playwright page scraping | WebSocket is faster and does not require a browser page for raw candle data. |

## Sources

- Playwright Python docs: https://playwright.dev/python/ (HIGH confidence -- official docs, verified Feb 2026)
- Playwright 1.58.0: https://pypi.org/project/playwright/ (HIGH confidence -- PyPI, released Jan 2026)
- playwright-stealth 2.0.2: https://pypi.org/project/playwright-stealth/ (HIGH confidence -- PyPI, released Feb 2026)
- tradingview-scraper 0.4.20: https://pypi.org/project/tradingview-scraper/ (MEDIUM confidence -- pre-alpha, confirms WS = OHLCV only)
- cryptography 46.0.5: https://pypi.org/project/cryptography/ (HIGH confidence -- PyPI, released Feb 2026)
- TradingView client-side Pine computation: Confirmed by tradingview-scraper (only extracts OHLCV), tvdatafeed (only extracts OHLCV), and absence of indicator data in WebSocket protocol (MEDIUM confidence -- community consensus, not officially documented)
- TradingView Data Window panel for indicator values: Community automation projects (tradingview-mcp) (MEDIUM confidence -- DOM selectors need live validation)
- TradingView Pine Editor DOM structure: Community observation (LOW confidence -- changes between deployments, selectors must be validated live)
