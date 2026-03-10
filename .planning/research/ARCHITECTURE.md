# Architecture Patterns: TradingView Pine Script Automation

**Domain:** Browser automation for financial charting platform
**Researched:** 2026-03-10

## Recommended Architecture

```
                       Frontend (React + TypeScript)
                              |
                     [REST + WebSocket]
                              |
                       FastAPI Backend
                     /        |        \
              Existing    TV Automation   Existing
              Routes      Router (NEW)   Services
                              |
                     TV Automation Service
                     /                    \
              Session Manager         Execution Queue
              (encrypt/decrypt        (asyncio.Queue)
               cookies, validate)           |
                                     Bridge Worker
                                     (Playwright instance)
                                    /        |        \
                              Stealth    Pine Editor   Data Extractor
                              Config     Interaction   (Data Window +
                                              |        Strategy Tester)
                                         TradingView
                                         Browser Tab
```

### Component Boundaries

| Component | Responsibility | Location | Communicates With |
|-----------|---------------|----------|-------------------|
| TVAutomationRouter | REST + WebSocket API endpoints for Pine automation | `backend/app/api/tv_automation.py` | TVAutomationService, Frontend |
| TVAutomationService | Orchestrates task lifecycle, queuing, status tracking | `backend/app/services/tv_automation_service.py` | TVWorker, TVTaskQueue, BridgeService, RunService |
| TVTaskQueue | Serializes automation tasks (one-at-a-time execution) | `backend/app/services/tv_task_queue.py` | TVAutomationService, TVWorker |
| TVWorker | Owns and drives the single Playwright browser instance | `workers/tradingview_bridge/tv_worker.py` | TradingView (via Playwright), TVDataExtractor, TVSessionManager |
| TVSessionManager | Persists/restores TradingView login cookies + localStorage | `workers/tradingview_bridge/session_manager.py` | TVWorker, filesystem (`data/tv_session/`) |
| TVDataExtractor | Extracts indicator values, candles, trades from TradingView | `workers/tradingview_bridge/data_extractor.py` | TVWorker (receives Page), BridgeArtifact model |
| TVScriptInjector | Pastes Pine Script into TradingView editor, triggers compilation | `workers/tradingview_bridge/script_injector.py` | TVWorker (receives Page) |
| TradingViewPage | Page Object Model encapsulating all TradingView DOM selectors | `workers/tradingview_bridge/tradingview_page.py` | TVScriptInjector, TVDataExtractor |
| PineAutomationPage | Frontend page: editor, controls, progress, results | `frontend/src/pages/PineAutomationPage.tsx` | api.ts, websocket.ts |

### Why This Boundary Structure

1. **TVWorker is separate from TVAutomationService** because the browser instance is a heavy, stateful resource. The service manages the "what" (task lifecycle); the worker manages the "how" (browser interaction). This separation means the service can be tested without a real browser.

2. **TVTaskQueue exists as its own component** because TradingView cannot handle concurrent Pine Script loads -- only one script can compile at a time. The queue serializes requests and provides back-pressure. Using `asyncio.Queue` (not Celery, not Redis) because this is a single-user local tool.

3. **TVDataExtractor is separate from TVWorker** because extraction logic changes frequently (DOM selectors shift with TradingView updates) while browser lifecycle code is stable. Isolating extraction makes it easy to update selectors without touching the browser management layer.

4. **TVSessionManager is separate** because session persistence is its own concern: encrypt/decrypt cookies, handle expiry, detect invalidation. The worker just calls `session_manager.load()` and `session_manager.save()`.

## Where the Playwright Browser Instance Lives

**Recommendation: In-process background task within the FastAPI process.**

### Why NOT a Separate Process

- This is a single-user local tool -- no need for process isolation or horizontal scaling
- Inter-process communication adds complexity (IPC, serialization, health checks) with zero benefit here
- Playwright's async API works natively with FastAPI's asyncio event loop
- The existing `_live_loop` in RunService already uses background threads -- same conceptual pattern

### Why NOT Celery/Redis

- Massive over-engineering for a single-user tool running on one machine
- Adds two infrastructure dependencies (Redis + Celery worker) for zero throughput gain
- The task queue is simply "run one Pine Script at a time" -- `asyncio.Queue(maxsize=5)` handles this

### Implementation Pattern

```python
# TVWorker -- singleton, created once at FastAPI startup

class TVWorker:
    def __init__(self):
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None
        self._lock = asyncio.Lock()  # One task at a time

    async def startup(self):
        """Called from FastAPI lifespan event."""
        playwright = await async_playwright().start()
        self._browser = await playwright.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"]
        )

    async def shutdown(self):
        """Called from FastAPI lifespan event."""
        if self._browser:
            await self._browser.close()

    async def ensure_context(self) -> BrowserContext:
        """Create or reuse browser context with session persistence."""
        if self._context is None:
            self._context = await self._browser.new_context(
                storage_state=self._load_session_if_exists(),
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 ..."  # Real Chrome UA
            )
        return self._context
```

The FastAPI lifespan hook starts/stops the worker:

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    await tv_worker.startup()
    asyncio.create_task(tv_automation_service.process_queue())
    yield
    await tv_worker.shutdown()

app = FastAPI(lifespan=lifespan)
```

**Confidence: HIGH** -- This pattern is well-established for Playwright + FastAPI integration.

## Data Flow: Pine Script Code to Frontend Chart

### Complete Happy Path

```
1. User pastes Pine Script in Monaco editor (PineAutomationPage)
         |
         v
2. Frontend POST /api/tv-automation/run
   Body: { pine_code, symbol, timeframe, dataset_id? }
         |
         v
3. TVAutomationService validates, creates task, enqueues
   Returns: { task_id, status: "queued" }
         |
         v
4. Frontend opens WebSocket: /tv-automation/{task_id}/stream
   Receives progress events: queued -> starting -> navigating ->
   injecting -> compiling -> extracting -> completed/failed
         |
         v
5. TVWorker (background) processes the task:
   a. Ensure browser context (load session)
   b. Navigate to TradingView chart (correct symbol + timeframe)
   c. Open Pine Editor panel
   d. Clear existing code, paste new Pine Script
   e. Click "Add to chart" / compile
   f. Wait for indicator to render (poll DOM for completion)
   g. Extract indicator data via TVDataExtractor
   h. Extract candle data
         |
         v
6. TVDataExtractor produces:
   - list[IndicatorSeries]   (indicator values with timestamps)
   - list[TradeEvent]        (if strategy with entries/exits)
   - error messages          (if Pine compilation failed)
         |
         v
7. TVAutomationService:
   a. Creates BridgeArtifact via existing BridgeService
   b. Updates task status to "completed"
   c. Sends final WebSocket event with artifact_id
         |
         v
8. Frontend receives completed event with bridge_artifact_id
   a. Calls existing GET /pine-bridge/artifacts/{id} for data
   b. Renders candles + indicator overlays on ChartPanel
   c. Optionally auto-triggers comparison run with Python strategy
```

### Key Design Decision: Reuse BridgeArtifact

The extracted TradingView data flows into the **existing** `BridgeArtifact` model and `BridgeService`. This means:
- The existing `RunService` works unchanged -- it already consumes `bridge_artifact_id`
- The existing `ComparisonEngine` works unchanged -- it already compares `pine_series` vs `python_series`
- The existing chart components work unchanged -- they already render `IndicatorSeries`

The automation layer is purely an **input pipeline** that produces `BridgeArtifact` objects. Everything downstream is already built.

**Confidence: HIGH** -- Direct reading of the existing codebase contracts.

## Data Extraction Strategy

This is the most technically challenging and fragile component. Three methods, in order of reliability.

### Method 1: Data Window Scraping (PRIMARY -- RECOMMENDED)

TradingView has a "Data Window" panel that shows exact indicator values for the bar under the cursor. Most reliable because it displays computed values as formatted text.

```python
class TVDataExtractor:
    async def extract_via_data_window(self, page: Page, bar_count: int) -> list[IndicatorSeries]:
        """
        1. Open Data Window panel (Alt+D or via menu)
        2. Position cursor at each bar (leftmost to rightmost)
        3. Read indicator values from the Data Window DOM
        4. Build IndicatorSeries from collected values
        """
        await page.keyboard.press("Alt+d")
        await page.wait_for_selector('[data-name="legend-source-item"]')

        chart = await page.query_selector('.chart-markup-table')
        box = await chart.bounding_box()
        series_data: dict[str, list[IndicatorPoint]] = {}

        for i in range(bar_count):
            x = box['x'] + (i / bar_count) * box['width']
            y = box['y'] + box['height'] / 2
            await page.mouse.move(x, y)
            await page.wait_for_timeout(50)

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
                if v['name'] not in series_data:
                    series_data[v['name']] = []
                series_data[v['name']].append(
                    IndicatorPoint(timestamp=..., value=float(v['value']))
                )

        return [
            IndicatorSeries(name=name, values=points)
            for name, points in series_data.items()
        ]
```

**Pros:** Exact computed values. Works for any indicator. No code modification needed.
**Cons:** Slow for large datasets (must sweep cursor). DOM selectors are fragile.
**Confidence: MEDIUM** -- DOM selectors need validation against current TradingView.

### Method 2: Strategy Tester Scraping (for trade events)

TradingView's Pine strategies produce trade data in the "Strategy Tester" panel.

```python
async def extract_strategy_trades(self, page: Page) -> list[TradeEvent]:
    await page.click('[data-name="backtesting"]')
    await page.wait_for_selector('[class*="report"]')
    await page.click('text="List of Trades"')
    await page.wait_for_selector('table')

    trades = await page.evaluate('''() => {
        const rows = document.querySelectorAll('[class*="report"] table tbody tr');
        return Array.from(rows).map(row => {
            const cells = row.querySelectorAll('td');
            return {
                type: cells[0]?.textContent?.trim(),
                signal: cells[1]?.textContent?.trim(),
                datetime: cells[2]?.textContent?.trim(),
                price: cells[3]?.textContent?.trim(),
                contracts: cells[4]?.textContent?.trim(),
            };
        });
    }''')
    return self._parse_trade_rows(trades)
```

### Method 3: WebSocket Interception (for candle data)

Intercept TradingView's internal WebSocket messages carrying OHLCV data. TradingView uses a custom protocol with `~m~LENGTH~m~` framing.

```python
async def capture_websocket_data(self, page: Page):
    collected = []
    def on_ws(ws):
        def on_frame(payload):
            if "timescale_update" in str(payload):
                collected.append(payload)
        ws.on("framereceived", on_frame)
    page.on("websocket", on_ws)
    # ... trigger chart load, then parse collected messages
```

**Confidence: LOW** -- WebSocket protocol is undocumented and may change. Use as supplementary method for candle data, not primary.

### Recommended Extraction Priority

1. **Data Window scraping** -- primary method for indicator values
2. **Strategy Tester scraping** -- for trade events from Pine strategies
3. **WebSocket interception** -- supplementary for candle data (or use imported dataset candles)

## Session Persistence Strategy

### How TradingView Sessions Work

TradingView authentication relies on:
1. **Cookies**: `sessionid`, `sessionid_sign`, `device_t` -- primary auth tokens
2. **localStorage**: Chart settings, layout preferences
3. **Session duration**: Free tier sessions last 30-90 days

### Recommended: Playwright `storage_state`

```python
class TVSessionManager:
    SESSION_DIR = Path("data/tv_session")
    STATE_FILE = SESSION_DIR / "storage_state.json"

    async def save(self, context: BrowserContext) -> None:
        self.SESSION_DIR.mkdir(parents=True, exist_ok=True)
        state = await context.storage_state()
        encrypted = self._encrypt(json.dumps(state))
        self.STATE_FILE.write_bytes(encrypted)

    def load(self) -> dict | None:
        if not self.STATE_FILE.exists():
            return None
        encrypted = self.STATE_FILE.read_bytes()
        return json.loads(self._decrypt(encrypted))

    async def is_valid(self, page: Page) -> bool:
        await page.goto("https://www.tradingview.com/chart/")
        try:
            await page.wait_for_selector(
                '[data-name="header-user-menu-button"]', timeout=10000
            )
            return True
        except:
            return False
```

### Login Flow

Manual login required for initial setup (TradingView uses CAPTCHA, 2FA):

1. User clicks "Login to TradingView" on PineAutomationPage
2. Backend launches browser in **headed mode** (visible)
3. User logs in manually (handles CAPTCHA, 2FA)
4. Backend detects successful login
5. Backend saves `storage_state` encrypted to disk
6. Subsequent runs use headless mode with saved state

**Confidence: HIGH** -- `storage_state` is Playwright's documented, stable API.

## Async Execution Model

### Why Pine Script Execution Is Slow

| Phase | Duration | What Happens |
|-------|----------|--------------|
| Navigate to chart | 2-5s | Load TradingView chart page |
| Switch symbol/timeframe | 1-3s | If different from current |
| Open Pine Editor | 0.5-1s | Panel animation |
| Paste + compile | 2-10s | Pine compilation (complexity-dependent) |
| Wait for render | 1-5s | Chart redraws with indicator |
| Extract data | 3-15s | Sweep cursor across bars |
| **Total** | **10-40s** | Typical range |

### Task Lifecycle

```python
class TVTaskStatus(str, Enum):
    QUEUED = "queued"
    STARTING = "starting"
    LOGIN_REQUIRED = "login_required"
    NAVIGATING = "navigating"
    INJECTING = "injecting"
    COMPILING = "compiling"
    COMPILE_ERROR = "compile_error"
    EXTRACTING = "extracting"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
```

## Patterns to Follow

### Pattern 1: Centralized Selector Registry

All TradingView DOM selectors in one dict with fallback chains. When TradingView changes DOM, update one file.

```python
SELECTORS = {
    "pine_editor_btn": '[data-name="open-pine-editor"]',
    "pine_editor_textarea": '.pine-editor textarea',
    "compile_btn": '[data-name="add-script-to-chart"]',
    "compile_error": '[class*="error"]',
    "data_window_btn": '[data-name="data-window"]',
    "chart_canvas": '.chart-markup-table',
    "user_menu": '[data-name="header-user-menu-button"]',
    "strategy_tester": '[data-name="backtesting"]',
}
```

### Pattern 2: Retry with Exponential Backoff

TradingView pages sometimes fail to load. Retry at the action level.

```python
async def with_retry(action, max_retries=3, base_delay=2.0):
    for attempt in range(max_retries):
        try:
            return await action()
        except (TimeoutError, PlaywrightError) as e:
            if attempt == max_retries - 1:
                raise
            delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
            await asyncio.sleep(delay)
```

### Pattern 3: Screenshot on Failure

When automation fails headlessly, capture a screenshot for debugging.

```python
async def _execute_with_screenshot(self, task, action):
    try:
        return await action()
    except Exception as e:
        path = f"data/tv_session/debug/fail_{task.task_id}.png"
        await self._page.screenshot(path=path, full_page=True)
        task.error_message = f"{str(e)} -- Screenshot: {path}"
        raise
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: New Browser Per Request
Launch takes 2-5s + page load 3-5s + session reload. Use singleton browser.

### Anti-Pattern 2: Hardcoded Selectors in Business Logic
TradingView DOM changes frequently. Centralize selectors.

### Anti-Pattern 3: Synchronous Playwright in FastAPI Routes
Blocks event loop for 10-40s. Use background tasks + WebSocket.

### Anti-Pattern 4: OCR/Screenshot-Based Data Extraction
Lossy, slow, viewport-dependent. Use Data Window text or WebSocket interception.

### Anti-Pattern 5: Unencrypted Session Files
Contains auth tokens. Always encrypt with Fernet.

## File Structure

```
backend/app/
  api/
    tv_automation.py           # NEW: REST + WebSocket endpoints
  services/
    tv_automation_service.py   # NEW: Task orchestration
    tv_task_queue.py           # NEW: asyncio.Queue wrapper
  models/
    tv_contracts.py            # NEW: TVTask, TVTaskStatus, etc.

workers/tradingview_bridge/
  __init__.py
  tv_worker.py                 # NEW: Playwright browser singleton
  session_manager.py           # NEW: Cookie/localStorage persistence
  script_injector.py           # NEW: Paste Pine Script, trigger compile
  data_extractor.py            # NEW: Extract indicator values
  tradingview_page.py          # NEW: Page Object Model for TV DOM
  selectors.py                 # NEW: Centralized DOM selectors

frontend/src/
  pages/
    PineAutomationPage.tsx     # NEW: Main automation UI
  components/
    automation/
      TVSessionStatus.tsx      # NEW: Session state indicator
      TVRunControls.tsx        # NEW: Run/stop/cancel buttons
      TVProgressBar.tsx        # NEW: Execution progress
      TVResultView.tsx         # NEW: Show extracted data summary
  services/
    websocket.ts               # EXTEND: add connectTVStream()
    api.ts                     # EXTEND: add TV automation endpoints

data/
  tv_session/
    storage_state.json         # Encrypted Playwright storage state
    debug/                     # Failure screenshots
```

## Sources

- Playwright Python documentation: `storage_state`, `BrowserContext`, `evaluate`, network interception -- HIGH confidence (official docs)
- Existing codebase: `RunService`, `BridgeService`, `ComparisonEngine`, `BridgeArtifact` models -- HIGH confidence (directly read)
- TradingView DOM structure and Data Window behavior -- MEDIUM confidence (training data, needs live verification)
- TradingView WebSocket protocol (`~m~` framing) -- LOW confidence (undocumented, community reverse-engineered)
- Anti-detection patterns -- MEDIUM confidence (general browser automation knowledge)
