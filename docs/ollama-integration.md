# Ollama Integration

This document explains how local Ollama is integrated into the app today.

## Goals

- detect which local models are installed
- choose a safe default chat model
- send a clean prompt to Ollama
- sanitize noisy output before it reaches the UI
- fail gracefully when Ollama is unavailable or slow

## Current configuration

The backend reads the Ollama binary path from `backend/app/core/settings.py`:

```text
C:\Users\sakth\AppData\Local\Programs\Ollama\ollama.exe
```

The app talks to the Ollama HTTP API at:

```text
http://127.0.0.1:11434
```

## Active code path

### Backend

- `backend/app/api/chat.py`
- `backend/app/services/chat_service.py`
- `backend/app/services/ollama_client.py`

### Frontend

- `frontend/src/components/chat/LLMChat.tsx`
- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/app/App.tsx`

## Model discovery

The app uses:

```text
GET /chat/models
```

That endpoint calls `OllamaClient.list_models`, which reads `/api/tags` from the local Ollama server.

Each model is returned as:

- `name`
- `model`
- `size`
- `modified_at`
- `chat_capable`

Current chat-capable rule:

- any model whose name does not contain `embed` is treated as chat-capable

This is why:

- `qwen3.5-9b-claude:latest` is chat-capable
- `nomic-embed-text:latest` is not

## Default model selection

The frontend picks the current model in this order:

1. keep the current selection if it is still available and chat-capable
2. prefer `qwen3.5-9b-claude:latest`
3. otherwise use the first chat-capable model
4. otherwise use `offline-fallback`

## Prompt shaping

The app sends a plain-text-only prompt to Ollama.

Important details:

- it uses only the latest user message as the prompt
- it sends a short system instruction that asks for plain text only
- it disables streaming in the current implementation
- it uses a low temperature

## Response sanitization

The app removes common local-model noise before returning text to the frontend.

Sanitization removes:

- ANSI escape sequences
- `<think>...</think>` blocks
- `<analysis>...</analysis>` blocks
- tokenizer markers like `<|im_start|>`
- role transcript lines like `user:` and `assistant:`
- duplicate paragraphs and excessive blank lines

If the cleaned text becomes empty, the backend returns a structured fallback response instead of blank content.

## Chat statuses

Current chat status values:

- `ok`
- `fallback`
- `error`

Current error classes:

- `ollama_unreachable`
- `model_missing`
- `timeout`
- `cleaned_response_empty`
- `permission_required`

## Fallback behavior

Fallback is used when:

- the selected model is missing
- Ollama is offline or unreachable
- the request times out
- the cleaned answer is empty
- the frontend explicitly chooses `offline-fallback`

Fallback responses include:

- `status`
- `error_class`
- `fallback_used`
- a human-readable message

## Permission behavior

If the request intent is `apply_fix` and Python write permission is not active:

- the backend returns `status=error`
- `error_class=permission_required`
- `requires_approval=true`

The current workspace UI does not yet send `apply_fix`, but the backend is ready to reject it safely.

## What is working now

- local model discovery
- chat-capable filtering
- default selection logic
- clean plain-text responses
- clear fallback responses
- model refresh from the UI

## What is not implemented yet

- token streaming in the UI
- retrieval augmentation
- patch application from chat into files
- message history beyond the latest user prompt
- deep model capability classification beyond the simple `embed` filter

## Operational checks

### Verify Ollama is installed

```powershell
Test-Path "C:\Users\sakth\AppData\Local\Programs\Ollama\ollama.exe"
```

### List models

```powershell
& "C:\Users\sakth\AppData\Local\Programs\Ollama\ollama.exe" list
```

### Run a direct local test

```powershell
& "C:\Users\sakth\AppData\Local\Programs\Ollama\ollama.exe" run qwen3.5-9b-claude:latest "Reply with one short sentence."
```

### Check the app model endpoint

```powershell
Invoke-WebRequest http://127.0.0.1:8000/chat/models
```

### Check the app chat endpoint

```powershell
$body = @{
  model = "qwen3.5-9b-claude:latest"
  intent = "analysis"
  messages = @(@{ role = "user"; content = "Reply with one short sentence." })
  include_targets = @("pine_code", "python_code", "run_artifacts")
  run_id = $null
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://127.0.0.1:8000/chat" -Method Post -ContentType "application/json" -Body $body
```

## Troubleshooting

### No models appear in the UI

Likely causes:

- Ollama is not running
- the API is not reachable at `127.0.0.1:11434`
- the selected model list request failed and the UI fell back silently to an empty list

### The chat returns fallback instead of a real answer

Check:

- whether the selected model is installed
- whether the model timed out during a cold start
- whether Ollama returned only hidden transcript or analysis text that got sanitized away

### The UI shows `offline-fallback`

That means the frontend could not select a chat-capable local model and is using the safe fallback path.
