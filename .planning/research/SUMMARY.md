# Research Summary: TradingView Pine Script Automation

**Domain:** Browser automation for dynamic Pine Script execution within a trading strategy comparator
**Researched:** 2026-03-10
**Overall confidence:** MEDIUM (Playwright APIs verified HIGH; TradingView DOM/extraction patterns MEDIUM; indicator extraction approach needs live validation)

## Executive Summary

Adding dynamic Pine Script execution to the Trading Strategy Comparator requires Playwright browser automation of TradingView's web application. The core challenge is NOT running Pine Scripts (TradingView's editor handles compilation) -- it is EXTRACTING the computed indicator values back out. Custom Pine Script indicators are computed client-side in TradingView's browser JavaScript engine, meaning their values never appear in network traffic. The only reliable extraction path is scraping TradingView's "Data Window" panel, which displays exact numerical values for all indicators as the user hovers over chart bars.

The project is well-positioned for this addition: the existing `BridgeArtifact`, `IndicatorSeries`, and `TradeEvent` data contracts already define exactly what the automation layer needs to produce. The existing `ComparisonEngine` and chart components consume these contracts unchanged. The automation layer is purely an input pipeline -- everything downstream is already built.

The technology stack is minimal: Playwright (already in the ecosystem via VYOM), playwright-stealth for anti-bot evasion, and cryptography for session encryption. No new frontend dependencies. No new infrastructure (Celery, Redis). The background worker uses Python's built-in asyncio, matching the existing FastAPI async patterns.

The biggest risks are: (1) TradingView DOM selector breakage (they deploy frequently with obfuscated class names), (2) Cloudflare bot detection blocking headless automation, and (3) the Data Window hover-scrape being slow for large datasets (~100-200ms per bar, so 500 bars = 50-100 seconds). Caching mitigates the speed issue; centralized selectors with fallback chains mitigate the breakage issue; playwright-stealth with persistent browser contexts mitigates the detection issue.

## Key Findings

**Stack:** Playwright 1.58.0 + playwright-stealth 2.0.2 + cryptography 46.0.5. Three new packages. No Celery, no Redis, no new frontend deps.

**Architecture:** Singleton Playwright browser worker running as an asyncio background task within the FastAPI process. Tasks queued via asyncio.Queue. Results delivered via WebSocket (extending existing LiveBarEvent pattern). All extracted data flows through existing BridgeArtifact/BridgeService -- zero changes to downstream pipeline.

**Critical technical insight:** Custom Pine Script indicator values are computed CLIENT-SIDE in TradingView's browser. WebSocket interception only captures raw OHLCV candle data, NOT indicator outputs. The Data Window hover-scrape (moving mouse across chart bars, reading DOM text) is the primary extraction method. This was initially misidentified in early research as "WebSocket interception."

**Critical pitfall:** TradingView DOM selectors change without warning between deployments. All selectors must be centralized in a single registry with fallback chains. A startup health check should validate selectors before accepting automation requests.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Phase 1: Infrastructure + Session** (5 days) - Session management, async worker skeleton, OHLCV data pipeline
   - Addresses: T1 (session), T4 (candle data), T8 (async worker)
   - Avoids: Pitfall #2 (Cloudflare -- by using persistent context + manual login), Pitfall #5 (FastAPI blocking -- by using background tasks from day 1)
   - Rationale: Everything else depends on a working TradingView session and background worker. Test Cloudflare/anti-bot early to validate the approach before investing in extraction.

2. **Phase 2: Pine Script Execution** (5-7 days) - Paste, compile, detect errors
   - Addresses: T2 (paste + apply), T3 (error detection), T6 (symbol/timeframe), T7 (error handling)
   - Avoids: Pitfall #3 (CodeMirror -- by using clipboard paste), Pitfall #4 (DOM breakage -- by building selector registry)
   - Rationale: Must be able to run Pine Scripts before extracting data from them. This phase validates the entire browser automation pipeline end-to-end.

3. **Phase 3: Data Extraction** (8-10 days) - The hard part. Indicator values, trade events.
   - Addresses: T5 (indicator extraction), T9 (contract mapping), D3 (trade events), D5 (multi-indicator)
   - Avoids: Pitfall #1 (canvas scraping -- by using Data Window), Pitfall #7 (race conditions -- by waiting for chart stability)
   - Rationale: This is the highest-risk, highest-value phase. Budget extra time. The Data Window hover-scrape needs careful coordinate mapping, chart scroll handling, and warmup-bar handling.

4. **Phase 4: Integration + Polish** (5-7 days) - Wire to frontend, add caching, auto-run
   - Addresses: D1 (auto-run), D4 (caching), D6 (progress WebSocket), D7 (session health), D10 (selector health check)
   - Avoids: Pitfall #6 (account ban -- by adding rate limits and cooldowns)
   - Rationale: Core pipeline must work before adding convenience features. Caching is critical for UX (30-60s per run without it) but should not be added until the pipeline is stable (premature caching hides bugs).

**Phase ordering rationale:**
- Session MUST come first (everything depends on authenticated TradingView access)
- Pine Script execution MUST precede extraction (cannot extract what hasn't been computed)
- Extraction MUST precede frontend integration (frontend needs real data to display)
- Caching and polish come last (cannot optimize what doesn't work yet)

**Critical path:** T1 (session) -> T8 (worker) -> T2 (paste/compile) -> T5 (extract indicators) -> T9 (map to contracts) -> D2 (comparison, already built)

**Research flags for phases:**
- Phase 2: LIKELY needs deeper research -- TradingView DOM selectors must be discovered live (training data selectors are stale). Budget a discovery/exploration day.
- Phase 3: LIKELY needs deeper research -- Data Window hover-scrape coordinate mapping and chart scrolling behavior needs live experimentation. The exact DOM selectors for Data Window values need validation.
- Phase 1: Standard patterns, unlikely to need research (Playwright storage_state is well-documented, asyncio.Queue is standard Python)
- Phase 4: Standard patterns, unlikely to need research (extends existing WebSocket/caching patterns in the codebase)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (Playwright + stealth + crypto) | HIGH | All packages verified on PyPI with current versions. Playwright is Microsoft-maintained, well-documented. |
| Features (what to build) | HIGH | Requirements are clear from PROJECT.md. Existing contracts define the output format. |
| Architecture (how to structure) | HIGH | Singleton browser worker + asyncio.Queue is a well-established pattern. Reusing BridgeArtifact is a direct codebase reading. |
| Data extraction (indicator values) | MEDIUM | Data Window hover-scrape is the correct approach but DOM selectors need live validation. The bar-to-pixel coordinate mapping needs experimentation. |
| Anti-bot (Cloudflare bypass) | MEDIUM | playwright-stealth + persistent context + manual login is the standard approach, but TradingView's specific detection may have evolved. |
| DOM selectors | LOW | All TradingView selectors in this research are based on training data and community patterns. They WILL need updating against the live site. |
| TradingView free tier limits | HIGH | Verified from official Pine Script documentation: 1 indicator/chart, 5K bars, 20s execution timeout. |

## Gaps to Address

- **Live DOM selector discovery:** All TradingView selectors need validation against the current live site. Budget a discovery session in Phase 2.
- **Data Window bar count vs viewport:** How many bars are visible at different zoom levels? Can you scroll left to access older bars during extraction? Needs live testing.
- **Keyboard navigation reliability:** Using arrow keys instead of mouse hover for bar navigation -- does TradingView update the Data Window on keyboard nav? Needs testing.
- **Cloudflare detection threshold:** At what automation intensity does Cloudflare start blocking? Needs empirical testing with the actual TradingView account.
- **Pine Script v6 features:** log.info() and other Pine v6 features that could enable faster extraction methods need investigation during implementation.
- **TradingView free tier indicator limit:** The 1-indicator-per-chart limit on free tier may conflict with scripts that plot multiple indicators. Workaround (run each as separate execution, merge results) needs validation.
- **Session lifetime:** How long do TradingView free-tier sessions actually last before expiring? Community reports vary (30-90 days). Needs empirical observation.

## Files Created

| File | Purpose |
|------|---------|
| `D:\python , pine script\.planning\research\SUMMARY.md` | This file -- executive summary with roadmap implications |
| `D:\python , pine script\.planning\research\STACK.md` | Technology recommendations (Playwright, stealth, crypto) with extraction architecture |
| `D:\python , pine script\.planning\research\FEATURES.md` | Feature landscape: 9 table stakes, 10 differentiators, 11 anti-features |
| `D:\python , pine script\.planning\research\ARCHITECTURE.md` | System structure, component boundaries, data flow, patterns |
| `D:\python , pine script\.planning\research\PITFALLS.md` | 15 domain pitfalls with prevention strategies |
