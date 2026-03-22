# Workflow

This document explains the real user flows that are implemented today, the expected result for each flow, and where the flow is still partial.

## Workflow 1: Import and save a dataset

### User steps

1. Open `/imports`
2. Select `Excel` or `CSV`
3. Enter a local file path
4. Set symbol, timeframe, and timezone
5. Review or edit the inferred column mapping
6. Click `Preview source`
7. Click `Save mapping`

### Backend flow

1. Frontend posts `DataSourceConfig` to `POST /data-sources/preview`
2. `DatasetService.preview` asks `DataManager.preview_import` for sample rows and inferred mapping
3. Frontend shows preview information
4. Frontend posts the same `DataSourceConfig` to `POST /data-sources/save`
5. `DatasetService.save` loads the full file, normalizes timestamps and OHLCV columns, writes a dataset CSV, and stores dataset metadata

### Expected result

- preview shows row count, columns, active sheet, inferred mapping, and sample rows
- save returns a `dataset_id`
- saved dataset appears in `/imports` and becomes available for run creation

### Current limitations

- no native file picker yet; file path is typed or pasted manually
- `polygon` exists in the UI contract but the backend loader currently supports only file-based Excel and CSV sources

## Workflow 2: Replay a Python strategy against a dataset

### User steps

1. Save a dataset in `/imports`
2. Open `/workspace`
3. Paste or edit the Python strategy in the Python editor
4. Optionally paste Pine code in the Pine editor
5. Choose run mode and timeframe
6. Click `Run replay`

### Backend flow

1. Frontend posts `ReplayRunRequest` to `POST /runs/replay`
2. `RunService.create_replay_run` loads the saved dataset
3. `PythonStrategyEngine.execute` runs the Python strategy against the normalized frame
4. Candle data is normalized into `CandlePoint[]`
5. If a bridge artifact is attached, Pine series and Pine trades are loaded from it
6. `ComparisonEngine` compares Pine and Python outputs
7. The run is persisted and returned

### Expected result

- Python screen shows candles
- Python price-like indicator series overlay on the candle chart
- mismatch analysis appears in the diff panel
- run appears in `/runs`

### Current limitations

- only price-like indicator series are overlaid directly on the candle chart
- oscillator-like series are not rendered in a second pane yet
- Pine results only appear if a bridge artifact is selected

## Workflow 3: Dataset-backed live playback

### User steps

1. Save a dataset
2. Open `/workspace`
3. Click `Start live run`

### Backend flow

1. Frontend posts the same run payload to `POST /runs/live`
2. `RunService.create_live_run` uses warmup bars first
3. A background thread increments the active dataset by one bar every second
4. Python outputs are recalculated on the growing frame
5. Comparison results are refreshed
6. Frontend subscribes to `/runs/{run_id}/stream`
7. On every event, the frontend refreshes the run from `GET /runs/{run_id}`

### Expected result

- the selected run enters `live`
- candle count increases over time
- comparison state changes as more bars arrive
- `/runs` shows progress like `current/total`

### Current limitations

- the source is a saved historical dataset, not a provider-backed live feed
- there is no pause/resume control yet
- live threading is in-process, not a separate worker service

## Workflow 4: Attach Pine truth through a bridge artifact

### User steps

1. Open `/settings`
2. Paste a JSON artifact into `Bridge JSON payload`
3. Click `Save bridge artifact`
4. Return to `/workspace`
5. Select the artifact from the `Pine bridge artifact` dropdown
6. Run replay or live mode again

### Backend flow

1. Frontend posts to `POST /pine-bridge/artifacts`
2. `BridgeService.create` persists the artifact as JSON
3. `RunService` resolves the selected artifact during run creation
4. Pine indicator series and Pine trade events are used as comparison truth

### Expected result

- Pine screen receives candle data from the run
- Pine indicator series can be overlaid when the uploaded series is price-like
- mismatch analysis compares Python outputs against the uploaded Pine values

### Current limitations

- TradingView automation is not implemented
- the user must provide the exported JSON payload manually
- non-price-like Pine series are listed as hidden rather than rendered in a sub-pane

## Workflow 5: Ask the local LLM for analysis

### User steps

1. Open `/workspace`
2. Choose a local chat model from the LLM panel
3. Click a starter prompt or type a custom prompt
4. Click `Ask LLM`

### Backend flow

1. Frontend calls `GET /chat/models` during startup and refreshes on demand
2. The selected model is sent to `POST /chat`
3. `ChatService` calls `OllamaClient.chat`
4. `OllamaClient` sends the latest user message to Ollama with a plain-text-only system instruction
5. Returned text is sanitized
6. Frontend displays the cleaned response or a fallback status

### Expected result

- user sees which local Ollama models are available
- embedding-only models are not auto-selected for chat
- the assistant returns a plain-text answer without transcript noise

### Current limitations

- the current workspace sends `intent=analysis` only
- there is no token streaming in the frontend yet
- patch application is not wired from the UI into files

## Workflow 6: Permissions and approvals

### User steps

1. Use the approval queue in `/workspace`
2. Toggle a permission row to approve or revoke

### Backend flow

1. Frontend calls `POST /permissions/grant`
2. `PermissionManager` appends the grant to permission history
3. Chat requests can inspect active grants
4. `apply_fix` intent is rejected if Python write access is not active

### Expected result

- permission history appears in the approval queue
- write-sensitive chat actions can be guarded

### Current limitations

- approval entries are append-only history, not a full RBAC system
- the current UI does not yet send `apply_fix` requests
- permission toggles change app behavior, but no file patch is applied automatically
