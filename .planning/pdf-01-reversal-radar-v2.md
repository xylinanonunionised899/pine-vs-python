# PDF 01: Reversal Radar v2

## Source

- PDF: `C:\Users\sakth\Downloads\ind\indictr pine (1).pdf`
- Extraction tool: `C:\Program Files\Git\mingw64\bin\pdftotext.exe`
- Cached text: `data/cache/pdf_batch/indictr_pine__1_.txt`
- Script kind: Pine indicator, not Pine strategy
- Header:
  - `//@version=6`
  - `indicator("Reversal Radar v2", shorttitle="RevRadar", overlay=true, max_labels_count=500)`

## What this script does

This indicator is a multi-detector reversal scanner. It aggregates seven detector families:

1. ReversalDots / Liquidity Trap
2. SelRevBase / Structural Divergence
3. BBBreak / Band Rejection
4. SnapBB / Panic Snap
5. EngBB / Capitulation Engulf
6. Volume Climax
7. Failed Breakout

It also includes:

- shared Bollinger band calculations
- ATR-based filters
- New York session blocking
- VIX-based filters using `request.security("CBOE:VIX", ...)`
- MTF bias table display
- plotshape and alertcondition outputs

## Support matrix

### Convertible exactly in principle

- shared ATR and Bollinger calculations
- ReversalDots signal logic
- Structural Divergence signal logic
- Band Rejection signal logic
- Volume Climax signal logic
- Failed Breakout state machine
- signal aggregation counts

### Visual-only and safe to skip

- legend table
- MTF bias table display
- diamond stack plotting
- alertcondition declarations

### Execution-critical dependencies

- `SnapBB` depends on external VIX series:
  - `request.security("CBOE:VIX", "D", open[1], lookahead=barmerge.lookahead_on)`
  - `request.security("CBOE:VIX", timeframe.period, close)`
- `EngBB` also depends on external VIX series and uses the same gating
- Session logic is hardcoded for `America/New_York`
- Failed Breakout and PMH/PML logic assumes U.S. premarket and RTH windows

## What is solved now

The app no longer has a hard one-dataset-only limitation for Python validation.

- Replay and live runs can now attach companion datasets through `run_config.companion_dataset_ids`
- Python strategies can read companion frames through `external_frames`, `companion_frames`, or `get_external_frame(name)`
- The Imports page now lets a saved dataset be attached as a companion series to the run
- Runs now warn clearly when a Pine script uses `request.security` and a Pine bridge artifact is still missing

## Why PDF 01 is still blocked

The remaining blocker is input availability, not the companion-runtime code path.

To continue PDF 01 end to end, this project still needs:

- a saved companion dataset for `CBOE:VIX`
- a Pine bridge artifact for exact Pine parity, because PineTS still cannot be treated as exact source-of-truth for `request.security` scripts

Without those two inputs, the batch cannot reach `aligned + saved` without changing trading logic.

## Batch result

- Status: `blocked`
- Saved to library: `no`
- Batch advance: `stopped at PDF 01`

## Requirement to unblock

PDF 01 can move to `aligned + saved` when all of the following are present:

1. primary market dataset for the target symbol and timeframe
2. companion VIX dataset saved in the app with symbol `CBOE:VIX`
3. Pine bridge artifact imported into the app for exact Pine output comparison