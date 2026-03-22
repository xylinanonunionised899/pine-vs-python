# Workers

This folder is reserved for process-isolated workers:

- `python_runtime`: execute Python strategies in a constrained worker process
- `tradingview_bridge`: automate TradingView and capture exported Pine artifacts
- `comparison_jobs`: run longer comparisons without blocking the API process

The initial implementation keeps worker behavior modeled in backend services, but the repo structure is ready to split them into separate executables.
