# PDF 02: Baha'i Reversal Points [CC]

## Source

- PDF: `C:\Users\sakth\Downloads\ind\indictr pine (2).pdf`
- Extracted text: `data/cache/pdf_batch/indictr_pine__2_.txt`
- Saved library entry: `ind-pdf02-bahai-reversal-points-cc`
- Library folder: `data/indicators/baha-i-reversal-points-cc`
- Validation dataset: `C:\Users\sakth\Downloads\SBIN_5.xlsx`
- Normalized dataset artifact: `dataset-742fe7e3`

## Script kind

- Pine indicator
- Overlay reversal marker study
- No external symbol dependency

## Original logic summary

The indicator counts repeated higher highs and lower lows over a rolling window and turns those counts into a three-state reversal score.

- `lpSum`: rolling count of `low < low[lbLength]`
- `hpSum`: rolling count of `high > high[lbLength]`
- `slo`: `1` when `lpSum >= length`, `-1` when `hpSum >= length`, otherwise `0`
- `sig`: strengthens the `slo` state into `2/1/-1/-2` depending on whether the state is increasing or decreasing versus the prior bar
- Buy and sell conditions come from `sig` crossover/crossunder behavior and are equivalent to the plotted reversal transitions on the default configuration

## Converted scope

### Converted exactly for the app flow

- `lpSum`
- `hpSum`
- `slo`
- `sig`
- `strong_buy_signal`
- `strong_sell_signal`
- `all_buy_signals`
- `all_sell_signals`
- `long_condition`
- `short_condition`
- visible `buy_marker` and `sell_marker` series for chart display

### Adjusted for PineTS compatibility

The original Pine uses a same-symbol `request.security()` wrapper with a user-selectable resolution. PineTS failed on that path during local execution.

For the app-safe Pine copy, the saved library version uses the exact default chart-timeframe equivalent:

- original default behavior: `request.security(syminfo.tickerid, "", ...)` with non-repaint handling
- saved app behavior: direct chart-timeframe series using `high[1] / low[1] / open[1] / close[1]` when repainting is disabled

This preserves the default non-repainting path used in the app validation run.

### Not preserved in the app-safe Pine copy

- non-default `Resolution` override via `request.security()`
- `alertcondition(...)` declarations

## Validation result

### Python execution

Ran successfully on `SBIN_5.xlsx`.

- rows: `18850`
- buy signals: `83`
- sell signals: `78`
- buy markers: `83`
- sell markers: `78`

### PineTS execution

Ran successfully on the same normalized candle set.

Core plot keys returned by PineTS:

- `buy_marker`
- `sell_marker`
- `lp_sum`
- `hp_sum`
- `slo`
- `sig`
- `long_condition`
- `short_condition`
- `strong_buy_signal`
- `strong_sell_signal`
- `all_buy_signals`
- `all_sell_signals`

Signal counts from PineTS:

- `long_condition`: `83`
- `short_condition`: `78`
- `strong_buy_signal`: `83`
- `strong_sell_signal`: `78`
- `all_buy_signals`: `83`
- `all_sell_signals`: `78`

### Series comparison

Exact zero-mismatch comparison was confirmed for:

- `lp_sum`
- `hp_sum`
- `slo`
- `sig`
- `long_condition`
- `short_condition`
- `strong_buy_signal`
- `strong_sell_signal`
- `all_buy_signals`
- `all_sell_signals`

## Batch result

- Status: `saved`
- Saved to library: `yes`
- Ready to advance to next PDF: `yes`

## Notes for future work

If TradingView-exact behavior is needed for non-default higher-timeframe resolution settings, this PDF should get a bridge-artifact validation pass later. For the current app workflow and default configuration, the saved Pine/Python pair is aligned.