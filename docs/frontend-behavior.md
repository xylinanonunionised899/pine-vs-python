# Frontend Behavior

This document describes the route-level behavior of the current frontend and the important UI assumptions for future work.

## App shell

The frontend is a single React application with route-based navigation:

- `/imports`
- `/workspace`
- `/runs`
- `/settings`

Core state lives in `frontend/src/app/App.tsx`.
That file:

- loads dependency status, datasets, runs, permissions, bridge artifacts, and Ollama models on startup
- stores the currently selected dataset, run, bridge artifact, and chat model
- owns the backend notice banner and action busy states
- opens a WebSocket when the selected run is live

## Shared UI behaviors

### Backend unavailable handling

If a fetch fails at the network layer, the API service converts it into a user-facing message:

```text
Backend unavailable at http://127.0.0.1:8000. Start backend\run-backend.ps1 and retry.
```

This message is shown through `backendNotice`.

### Chat model selection

- models are fetched from `GET /chat/models`
- only `chat_capable` models are auto-selectable in chat dropdowns
- preferred default is `qwen3.5-9b-claude:latest`
- if no chat-capable model is found, the UI falls back to `offline-fallback`

### Run streaming

- when the current run lifecycle is `live`, the app opens `WS /runs/{run_id}/stream`
- each WebSocket event triggers a fresh `GET /runs/{run_id}`
- the run list and current run state are updated from the returned payload

## `/imports`

Purpose:

- preview a local source
- edit mapping
- save a reusable dataset

Visible controls:

- source type
- dataset name
- local file path
- symbol
- timeframe
- timezone
- timestamp/open/high/low/close/volume mapping inputs
- `Preview source`
- `Save mapping`

Behavior:

- `Preview source` calls `POST /data-sources/preview`
- if the preview returns `inferred_mapping`, the current mapping is updated in state
- `Save mapping` calls `POST /data-sources/save`
- on success, the app refreshes datasets and navigates to `/workspace`
- the right column lists saved datasets
- `Use dataset` sets the selected dataset in app state

Expected output:

- row count
- columns
- active sheet for Excel
- sample rows

Current gaps:

- no OS file picker
- no inline validation hints per field
- no saved mapping presets beyond saved datasets

## `/workspace`

Purpose:

- edit Pine and Python code
- launch replay or live runs
- inspect chart output and mismatches
- ask the local LLM questions
- review permission history

Top toolbar:

- run mode selector
- timeframe input
- Pine bridge artifact selector
- `Refresh Pine export`
- `Run replay`
- `Start live run`

Main split:

- left card: Pine editor + Pine chart
- right card: Python editor + Python chart

Bottom dock:

- mismatch analysis panel
- approval queue

Right sidebar:

- Ollama chat

### Chart behavior

The chart component renders:

- candles from the current run
- price-like indicator series as line overlays
- a summary message for non-price-like series that are not currently rendered on the candle scale

Important implementation detail:

- the chart decides whether a series is "price-like" by comparing indicator values to the candle price range
- only up to three overlay series are drawn
- oscillators like RSI or MACD histogram values are not yet rendered in a separate pane

This is the main reason a user may think an indicator is "missing" even when the series exists in run data.

### Editor behavior

- editors store artifact source code and metadata in app state
- Pine editor does not execute Pine locally
- Python editor content is sent to the backend when a run is created

### Diff panel behavior

If a run has comparison data, the panel shows:

- aligned yes/no
- series mismatch count
- trade mismatch count
- mismatch list
- suggested next action
- warning banner

If no run exists yet, the panel shows a placeholder message.

### Approval queue behavior

- each permission row has an approve or revoke button
- toggling sends `POST /permissions/grant`
- rows represent history rather than a deduplicated current state table

### LLM chat behavior

- starter prompts update the text area
- `Ask LLM` sends the current prompt to the backend
- the response panel shows loading, connected, fallback, or error text
- current UI uses analysis-only prompts

Current gaps:

- no code diff preview in the UI yet
- no true patch application flow
- no multi-pane indicator charting
- no crosshair synchronization between Pine and Python charts yet

## `/runs`

Purpose:

- inspect replay and live run history

Behavior:

- loads all runs from `GET /runs`
- shows symbol, mode, dataset, lifecycle, progress, and first mismatch summary
- `Open` sets the selected run and lets the workspace reuse that run state

Current gaps:

- no filtering
- no artifact download buttons
- no delete or archive action

## `/settings`

Purpose:

- inspect dependency readiness
- choose the chat model
- inspect local model availability
- save manual Pine bridge artifacts

Left column:

- dependency cards from `GET /dependencies/status`
- chat model selector
- `Refresh models`
- available model list with `chat-capable` labeling

Right column:

- read-only Pine source snapshot
- bridge JSON text area
- `Save bridge artifact`
- saved artifact list

Current gaps:

- no TradingView login or session automation UI
- no provider API key editing UI
- no bridge artifact validation preview before save

## UI behaviors that future work should preserve

- route-based navigation
- backend-unavailable messaging instead of silent blank failures
- local-first defaults for dataset path and chat model
- ability to work without Ollama through structured fallback responses
