# Backend Responsibilities

This document maps the current backend modules to their responsibilities and clarifies what each service does today.

## Entry point

### `backend/app/main.py`

Responsibilities:

- creates the FastAPI app
- configures CORS for the Vite frontend
- registers all routers
- exposes `/health`
- exposes `WS /runs/{run_id}/stream`
- exposes placeholder `WS /ws/stream`

## API routers

### `backend/app/api/data_sources.py`

Responsibilities:

- preview a source
- save a normalized dataset
- list saved datasets

Important note:

- the public source contract includes `polygon`, but the current implementation only loads Excel and CSV files

### `backend/app/api/runs.py`

Responsibilities:

- list runs
- fetch a run by ID
- create replay runs
- create live runs

Request contract:

- `dataset_id`
- `run_config`
- `python_artifact`
- optional `pine_artifact`
- optional `bridge_artifact_id`

### `backend/app/api/pine_bridge.py`

Responsibilities:

- list manual Pine bridge artifacts
- save manual Pine bridge artifacts

### `backend/app/api/permissions.py`

Responsibilities:

- list permission grant history
- create a grant or revocation entry

### `backend/app/api/chat.py`

Responsibilities:

- expose Ollama health information
- list local models
- proxy chat requests through `ChatService`

### `backend/app/api/dependencies.py`

Responsibilities:

- report whether backend dependencies are available

### `backend/app/api/comparison.py`

Responsibilities:

- expose a sample comparison endpoint for development or demo use

Important note:

- this endpoint is not part of the main user workflow

## Core modules

### `backend/app/core/data_manager.py`

Responsibilities:

- inspect Excel and CSV sources
- infer column mapping
- load source frames
- normalize timestamps and OHLCV fields
- convert normalized frames into `CandlePoint[]`
- describe source capabilities

Current limitations:

- no provider-backed fetch implementation
- no resampling engine
- no calendar or session filtering

### `backend/app/core/python_engine.py`

Responsibilities:

- run user Python strategy code
- limit imports to an allowlist
- require `run_strategy(frame)` to return a `pandas.DataFrame`
- derive indicator series from numeric or boolean result columns
- derive simple long entry and exit trade events from `long_condition`

Current limitations:

- this is not a hardened sandbox
- there is no resource isolation beyond a limited import surface
- trade extraction is based only on `long_condition`
- short logic and richer order models are not implemented

### `backend/app/core/comparison_engine.py`

Responsibilities:

- compare Pine and Python indicator series
- compare Pine and Python trades
- classify mismatches
- produce `ComparisonResult`

## Services

### `backend/app/services/dataset_service.py`

Responsibilities:

- wrap `DataManager` for preview and save flows
- create dataset artifacts and persist metadata
- load saved dataset frames from CSV

Storage behavior:

- normalized data is written to CSV
- dataset metadata is written to JSON index files

### `backend/app/services/run_service.py`

Responsibilities:

- create replay runs
- create live runs
- persist run state
- resolve bridge artifacts
- call the Python engine
- call the comparison engine
- emit latest live event snapshots

Current live behavior:

- implemented with a background thread
- increments one bar per second
- recalculates Python outputs on each step

Current limitations:

- in-process background thread instead of dedicated worker
- no cancel or pause control
- no distributed job handling

### `backend/app/services/bridge_service.py`

Responsibilities:

- persist bridge artifacts as JSON
- list bridge artifacts
- fetch bridge artifacts by ID

### `backend/app/services/permission_manager.py`

Responsibilities:

- append permission grants to storage
- check active access for a target and access level
- list permission history

Current limitations:

- append-only history rather than a richer access-control model
- no user identity layer

### `backend/app/services/chat_service.py`

Responsibilities:

- validate chat intent conditions
- enforce write approval for `apply_fix`
- call `OllamaClient`
- convert errors into structured fallback responses
- add mismatch context into fallback responses
- log per-request status

### `backend/app/services/ollama_client.py`

Responsibilities:

- discover local models
- classify chat-capable versus embedding-only models
- send plain-text requests to Ollama
- sanitize noisy model output
- raise structured chat errors

### `backend/app/services/dependency_service.py`

Responsibilities:

- report backend availability
- test Ollama binary presence and API reachability
- report bridge capability
- report market provider key presence

### `backend/app/services/storage.py`

Responsibilities:

- create artifact directories
- manage JSON index files
- upsert records
- read and write JSON payloads

Important note:

- this is the active persistence layer today
- SQLite and DuckDB settings exist in configuration, but are not yet used by the storage implementation

## Shared contracts

### `shared/python/contracts.py`
### `shared/typescript/contracts.ts`

Responsibilities:

- keep frontend and backend payload shapes aligned
- define datasets, runs, strategies, indicator series, trades, comparison, permissions, and chat contracts

## Settings

### `backend/app/core/settings.py`

Responsibilities:

- centralize environment-backed settings
- define default Ollama path
- define target paths for planned SQLite and DuckDB integration

Important note:

- several settings describe the target architecture, not the current active persistence implementation
