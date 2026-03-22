# Production Readiness

## Final position

This project is acceptable for **trusted single-user local desktop deployment**.

It is **not** acceptable for:

- networked deployment
- multi-user deployment
- untrusted-code execution
- internet-exposed API hosting

## Acceptable target

Acceptable production target for this repository means:

- one local desktop user
- backend bound to loopback only
- trusted local code execution
- desktop installer distribution
- documented release verification before shipping

## Hardening completed

The current v1 includes these important hardening steps:

- localhost-oriented deployment target
- startup warning on non-loopback backend bind
- local file-path validation before import reads
- proper HTTP error shaping for common bad-input and missing-resource cases
- atomic JSON writes with per-file locking
- isolated test data root to avoid wiping real user data
- Python execution wall-clock timeout
- live run cancellation, cleanup, and failed-state handling
- machine-agnostic Ollama path resolution
- documented parity and smoke verification paths

## Known non-goals and limits

### Python execution

The Python runtime still executes trusted user code and is **not a true sandbox**.

This remains acceptable only because the deployment target is a trusted local user on their own machine.

### Authentication

There is no multi-user auth model because this app is not meant to be exposed as a shared service.

### Storage model

The active storage model is still local JSON and CSV artifacts, not a server-grade storage stack.

### Live data

The current live mode is dataset playback, not provider-backed real-time market data.

### Pine truth

Some exact Pine parity scenarios still require manual bridge artifacts.

## If the target changes

If this project ever needs to become:

- networked
- multi-user
- remotely accessible
- safe for untrusted user-submitted code

then this v1 architecture is **not sufficient**.

That would require:

- real authentication and authorization
- process or container isolation for strategy execution
- stronger persistence and concurrency guarantees
- stricter file-access boundaries
- network-aware deployment and observability

Those changes should be treated as a new architecture phase, not a small extension of this v1.
