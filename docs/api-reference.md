# API Reference

Base URL:

```text
http://127.0.0.1:8000
```

## Health and dependencies

### `GET /health`

Returns basic API liveness.

Example response:

```json
{
  "status": "ok",
  "timestamp": "2026-03-10T18:42:11.239827+00:00"
}
```

### `GET /dependencies/status`

Returns runtime dependency status.

Example response:

```json
{
  "backend": {
    "name": "backend",
    "available": true,
    "detail": "API process supports replay, live, and bridge workflows."
  },
  "ollama": {
    "name": "ollama",
    "available": true,
    "detail": "Ollama API reachable: {\"version\":\"0.x.x\"}"
  },
  "tradingview_bridge": {
    "name": "tradingview_bridge",
    "available": true,
    "detail": "Manual bridge artifact upload is supported. Session automation can be added later."
  },
  "market_provider": {
    "name": "market_provider",
    "available": false,
    "detail": "No market API key configured; dataset-driven live mode remains available."
  }
}
```

## Data sources

### `POST /data-sources/preview`

Preview a source and infer a column mapping.

Request body:

```json
{
  "type": "excel",
  "name": "SBIN local workbook",
  "file_path": "C:/Users/sakth/Downloads/SBIN_5.xlsx",
  "provider": null,
  "symbol": "SBIN",
  "timeframe": "5m",
  "timezone": "Asia/Calcutta",
  "mapping": {
    "timestamp": "dt",
    "open": "o",
    "high": "h",
    "low": "l",
    "close": "c",
    "volume": "v"
  },
  "session": {
    "timezone": "Asia/Calcutta",
    "market_calendar": null,
    "session_start": null,
    "session_end": null
  },
  "extra": {}
}
```

Example response:

```json
{
  "preview": {
    "name": "SBIN local workbook",
    "type": "excel",
    "timeframe": "5m",
    "timezone": "Asia/Calcutta",
    "mapping": {
      "timestamp": "dt",
      "open": "o",
      "high": "h",
      "low": "l",
      "close": "c",
      "volume": "v"
    },
    "exists": true,
    "file_path": "C:\\Users\\sakth\\Downloads\\SBIN_5.xlsx",
    "format": "excel",
    "sheet_names": ["Sheet1"],
    "active_sheet": "Sheet1",
    "row_count": 18850,
    "columns": ["t", "o", "h", "l", "c", "v", "dt"],
    "inferred_mapping": {
      "timestamp": "dt",
      "open": "o",
      "high": "h",
      "low": "l",
      "close": "c",
      "volume": "v"
    },
    "sample_rows": []
  },
  "capabilities": {
    "supports_file_upload": true,
    "supports_symbol_fetch": false,
    "supports_local_replay": true,
    "supports_live_append": true
  },
  "validation_issues": []
}
```

### `POST /data-sources/save`

Normalize and persist a dataset.

Request body:

- same shape as `POST /data-sources/preview`

Example response:

```json
{
  "dataset_id": "dataset-a1b2c3d4",
  "name": "SBIN local workbook",
  "symbol": "SBIN",
  "timeframe": "5m",
  "timezone": "Asia/Calcutta",
  "row_count": 18850,
  "columns": ["timestamp", "open", "high", "low", "close", "volume"],
  "data_path": "D:\\python , pine script\\data\\cache\\datasets\\dataset-a1b2c3d4.csv"
}
```

### `GET /data-sources`

List saved datasets.

Example response:

```json
[
  {
    "dataset_id": "dataset-a1b2c3d4",
    "name": "SBIN local workbook",
    "symbol": "SBIN",
    "timeframe": "5m",
    "row_count": 18850
  }
]
```

## Runs

### `POST /runs/replay`

Create a deterministic replay run.

Request body:

```json
{
  "dataset_id": "dataset-a1b2c3d4",
  "run_config": {
    "mode": "pine_bridge",
    "symbol": "SBIN",
    "timeframe": "5m",
    "date_from": null,
    "date_to": null,
    "one_open_position": true,
    "tolerance": 0.001,
    "warmup_bars": 100,
    "selected_outputs": ["ema_fast", "long_condition"],
    "timezone": "Asia/Calcutta"
  },
  "python_artifact": {
    "language": "python",
    "name": "Python EMA Strategy",
    "source_code": "import pandas as pd\\n\\ndef run_strategy(frame: pd.DataFrame) -> pd.DataFrame:\\n    frame = frame.copy()\\n    frame[\"ema_fast\"] = frame[\"close\"].ewm(span=21, adjust=False).mean()\\n    frame[\"long_condition\"] = frame[\"close\"] > frame[\"ema_fast\"]\\n    return frame\\n",
    "declared_outputs": ["ema_fast", "long_condition"],
    "permissions": {
      "read_allowed": true,
      "write_allowed": false
    },
    "adapter_metadata": {
      "engine": "local-python"
    }
  },
  "pine_artifact": {
    "language": "pine",
    "name": "Complex Pine Strategy",
    "source_code": "//@version=5\\nstrategy(\"Complex Pine Strategy\", overlay=true)\\nemaFast = ta.ema(close, 21)\\nplot(emaFast, color=color.orange)\\n",
    "declared_outputs": ["ema_fast", "longCondition"],
    "permissions": {
      "read_allowed": true,
      "write_allowed": false
    },
    "adapter_metadata": {
      "export_contract": "series + trades"
    }
  },
  "bridge_artifact_id": "bridge-b1c2d3e4"
}
```

Response:

- returns a full `RunStatus`
- includes candles, Python series, Pine series, trade events, comparison, warnings, lifecycle, and progress

### `POST /runs/live`

Create a dataset-backed incremental playback run.

Request body:

- same shape as `POST /runs/replay`

Response:

- returns a `RunStatus` with `lifecycle: "live"`
- progress updates continue over WebSocket

### `GET /runs`

List all runs.

### `GET /runs/{run_id}`

Return a full `RunStatus` for one run.

Example partial response:

```json
{
  "run_id": "run-1234abcd",
  "lifecycle": "completed",
  "mode": "pine_bridge",
  "symbol": "SBIN",
  "timeframe": "5m",
  "dataset_id": "dataset-a1b2c3d4",
  "dataset_name": "SBIN local workbook",
  "bridge_artifact_id": "bridge-b1c2d3e4",
  "candles": [],
  "python_series": [],
  "pine_series": [],
  "trade_events": [],
  "comparison": {
    "summary": {
      "aligned": false,
      "total_series": 1,
      "mismatched_series": 1,
      "total_trade_events": 0,
      "mismatched_trade_events": 0
    },
    "series_mismatches": [],
    "trade_mismatches": [],
    "first_mismatch": null,
    "unsupported_feature_warnings": [],
    "suggested_next_action": null,
    "run_mode": "pine_bridge",
    "dataset_id": "dataset-a1b2c3d4",
    "live": false,
    "artifact_refs": ["dataset-a1b2c3d4", "bridge-b1c2d3e4"]
  },
  "warnings": [],
  "live_progress": 18850,
  "live_total": 18850
}
```

## WebSockets

### `WS /runs/{run_id}/stream`

Sends a `LiveBarEvent` once per second for active live runs.

Example event:

```json
{
  "run_id": "run-1234abcd",
  "lifecycle": "live",
  "current_index": 101,
  "total": 18850,
  "latest_candle": {
    "timestamp": "2025-02-27T03:50:00+00:00",
    "open": 713.8,
    "high": 714.2,
    "low": 713.5,
    "close": 713.72,
    "volume": 12034.0
  },
  "comparison": null,
  "updated_at": "2026-03-10T18:42:11.239827+00:00"
}
```

### `WS /ws/stream`

Currently a placeholder endpoint that returns one informational message and closes.

## Pine bridge

### `GET /pine-bridge/artifacts`

List saved bridge artifacts.

### `POST /pine-bridge/artifacts`

Create a bridge artifact from manual JSON.

Request body:

```json
{
  "name": "SBIN bridge artifact",
  "symbol": "SBIN",
  "timeframe": "5m",
  "source_code": "//@version=5 ...",
  "indicator_series": [
    {
      "name": "ema_fast",
      "pane": "main",
      "style": {
        "color": "#f4b942"
      },
      "warmup_bars": 100,
      "values": [
        {
          "timestamp": "2025-02-27T03:45:00Z",
          "value": 713.95
        }
      ]
    }
  ],
  "trade_events": [],
  "notes": "Manual TradingView export artifact"
}
```

Response:

- returns the saved `BridgeArtifact`

## Permissions

### `GET /permissions`

List permission grant history.

### `POST /permissions/grant`

Grant or revoke access.

Request body:

```json
{
  "target": "python_code",
  "access": "write",
  "scope": "single_action",
  "approved": true,
  "ttl_minutes": 15,
  "audit_note": "User approved one write action"
}
```

Response:

- returns the stored `PermissionGrant`

## Chat

### `GET /chat/health`

Return Ollama binary and base URL information.

### `GET /chat/models`

Return locally available Ollama models.

Example response:

```json
[
  {
    "name": "qwen3.5-9b-claude:latest",
    "model": "qwen3.5-9b-claude:latest",
    "size": 5612345678,
    "modified_at": "2026-03-10T18:42:11.239827+00:00",
    "chat_capable": true
  },
  {
    "name": "nomic-embed-text:latest",
    "model": "nomic-embed-text:latest",
    "size": 274000000,
    "modified_at": "2026-03-10T18:42:11.239827+00:00",
    "chat_capable": false
  }
]
```

### `POST /chat`

Send a chat request to Ollama or receive a structured fallback.

Request body:

```json
{
  "model": "qwen3.5-9b-claude:latest",
  "intent": "analysis",
  "messages": [
    {
      "role": "user",
      "content": "Explain the first mismatch between Pine and Python."
    }
  ],
  "include_targets": ["pine_code", "python_code", "run_artifacts"],
  "run_id": "run-1234abcd"
}
```

Example success response:

```json
{
  "model": "qwen3.5-9b-claude:latest",
  "content": "The app chat path is confirmed to be working.",
  "requires_approval": false,
  "proposed_patch": null,
  "status": "ok",
  "error_class": null,
  "fallback_used": false
}
```

Example fallback response:

```json
{
  "model": "missing-model:latest",
  "content": "Selected model is not available locally. Model 'missing-model:latest' is not available locally. No mismatch detected yet.",
  "requires_approval": false,
  "proposed_patch": null,
  "status": "fallback",
  "error_class": "model_missing",
  "fallback_used": true
}
```

## Comparison demo endpoint

### `POST /comparison/sample`

This is a demo endpoint only.
It generates a fixed comparison example from hard-coded sample data.

Request body:

```json
{
  "tolerance": 0.001
}
```

## Notes and caveats

- `polygon` is part of the public `DataSourceConfig` contract, but provider-backed fetching is not yet implemented in `DataManager.load_source_frame`.
- `apply_fix` is part of the chat contract, but the current UI sends analysis requests only.
- `WS /ws/stream` is placeholder-only.
