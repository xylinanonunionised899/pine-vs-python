# Current Status

## Deployment target

This app is designed for **trusted single-user local desktop use only**. It is not designed for, and should not be used as, a networked or multi-user service. All API endpoints are unauthenticated. The backend should only ever bind to `127.0.0.1` (loopback).

This document is the truth-source for what is finished, partial, or still placeholder as of March 10, 2026.

## Finished

### Data import

- Excel preview
- CSV preview
- inferred column mapping
- dataset save to normalized CSV
- saved dataset listing

### Run orchestration

- replay run creation
- dataset-backed live playback
- run persistence
- run listing
- run retrieval
- run progress WebSocket

### Python side

- local Python execution contract
- indicator extraction from numeric and boolean columns
- simple long entry and exit extraction from `long_condition`

### Pine side

- manual bridge artifact upload
- bridge artifact persistence
- bridge artifact selection during run creation

### Comparison

- indicator series comparison
- trade comparison
- mismatch classification and first mismatch output

### Ollama

- local model discovery
- chat-capable filtering
- default model selection
- plain-text prompt shaping
- response sanitization
- fallback behavior for missing models, timeout, offline, and empty cleaned response

### Frontend shell

- route-based layout
- imports page
- workspace page
- runs page
- settings page
- backend-unavailable notice handling

## Partial

### Charts

- candles render
- price-like overlays render
- non-price-like series are detected but not shown in their own pane

### Approvals

- grant history works
- permission checks work in the backend
- UI can toggle approval entries
- patch application flow is not complete

### Pine workflow

- manual bridge artifact path works
- automated TradingView bridge does not exist yet

### Live mode

- incremental playback works
- real market provider live streaming does not exist yet

## Placeholder or planned only

- SQLite persistence as the active store
- DuckDB and Parquet persistence as the active store
- provider-backed Polygon fetch flow
- TradingView automation worker
- local Pine subset runtime
- multi-user auth
- production-grade runtime isolation
- LLM patch generation and file application from the UI
- token streaming in chat
- chart sub-panes for RSI, MACD, and other oscillators
- full Playwright regression suite

## Known issues and limitations

### Storage mismatch

The settings file and older plans reference SQLite and DuckDB, but the running code currently uses JSON and CSV artifact storage under `data/`.

### Chart visibility

Indicators are not guaranteed to appear visually unless:

- a run exists
- the strategy emitted numeric outputs
- the indicator is price-like enough to overlay on the candle scale

This is why Pine or Python charts can appear to show only candles even when indicator data exists.

### Python strategy contract

The Python strategy must define:

```python
def run_strategy(frame: pd.DataFrame) -> pd.DataFrame:
    ...
```

If it does not, the backend run creation fails.

### Live mode naming

Current `live` behavior is replay-based incremental playback from a saved dataset.
It is not external live data.

### Provider gap

`polygon` is visible in the UI and contracts, but the active backend data loader does not yet fetch remote provider data.

### Pine automation gap

The app compares against uploaded Pine results, not a real automated TradingView session yet.

### Security gap

The local Python runtime is not a fully hardened sandbox and should not be treated as a production-grade untrusted-code execution environment.

## Recommended next priorities

1. Add sub-pane indicator rendering so RSI, MACD, and similar outputs are visible.
2. Make provider-backed data fetching real or hide the provider option until implemented.
3. Replace JSON and CSV storage with the planned SQLite and DuckDB layers.
4. Harden the Python execution model.
5. Add Playwright smoke coverage for the route shell and core workflows.

## Release-readiness summary

- Local prototype: yes
- Single-user pilot: yes
- Production-ready system: no — trusted single-user local desktop only; not designed for networked or multi-user deployment
