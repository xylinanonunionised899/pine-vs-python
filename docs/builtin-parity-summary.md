# Built-In Indicator Parity Certification

**Last run:** 2026-03-16 08:06 UTC  
**Dataset:** `dataset-demo-5m` — Demo Dataset (EMA 5m · 300 bars)  
**Result:** 6/6 pass, 0 fail/error

## Summary

| Indicator | Status | Produced series | Issues |
|-----------|--------|-----------------|--------|
| EMA Crossover | ✅ pass | `ema_fast`, `ema_slow`, `long_condition` | — |
| RSI | ✅ pass | `rsi`, `long_condition`, `short_condition` | — |
| MACD | ✅ pass | `macd_line`, `signal_line`, `histogram`, `long_condition` | — |
| Super Trend | ✅ pass | `supertrend`, `direction`, `long_condition` | — |
| Bollinger Bands | ✅ pass | `bb_middle`, `bb_upper`, `bb_lower`, `long_condition` | — |
| VWAP 3-Band | ✅ pass | `vwap`, `vwap_upper1`, `vwap_lower1`, `vwap_upper2`, `vwap_lower2`, `vwap_upper3`, `vwap_lower3`, `long_condition` | — |

## Detail

### ✅ EMA Crossover (`ind-ema-crossover`)

- **Status:** pass
- **Bars:** 300 (warmup 50)
- **Expected:** `ema_fast`, `ema_slow`, `long_condition`
- **Produced:** `ema_fast`, `ema_slow`, `long_condition`

### ✅ RSI (`ind-rsi`)

- **Status:** pass
- **Bars:** 300 (warmup 50)
- **Expected:** `rsi`, `long_condition`, `short_condition`
- **Produced:** `rsi`, `long_condition`, `short_condition`

### ✅ MACD (`ind-macd`)

- **Status:** pass
- **Bars:** 300 (warmup 50)
- **Expected:** `macd_line`, `signal_line`, `histogram`, `long_condition`
- **Produced:** `macd_line`, `signal_line`, `histogram`, `long_condition`

### ✅ Super Trend (`ind-supertrend`)

- **Status:** pass
- **Bars:** 300 (warmup 50)
- **Expected:** `supertrend`, `direction`, `long_condition`
- **Produced:** `supertrend`, `direction`, `long_condition`

### ✅ Bollinger Bands (`ind-bollinger-bands`)

- **Status:** pass
- **Bars:** 300 (warmup 50)
- **Expected:** `bb_middle`, `bb_upper`, `bb_lower`, `long_condition`
- **Produced:** `bb_middle`, `bb_upper`, `bb_lower`, `long_condition`

### ✅ VWAP 3-Band (`ind-vwap-bands`)

- **Status:** pass
- **Bars:** 300 (warmup 50)
- **Expected:** `vwap`, `vwap_upper1`, `vwap_lower1`, `vwap_upper2`, `vwap_lower2`, `vwap_upper3`, `vwap_lower3`, `long_condition`
- **Produced:** `vwap`, `vwap_upper1`, `vwap_lower1`, `vwap_upper2`, `vwap_lower2`, `vwap_upper3`, `vwap_lower3`, `long_condition`

## Caveats

- This harness runs **Python only**. Pine Script execution requires the frontend PineTS engine.
- Pine↔Python parity is validated manually via the Alignment tab in the app.
- `long_condition` / `short_condition` are boolean series; null-fraction check is skipped for them.

## Re-running

```powershell
cd "D:\python , pine script"
C:\Users\sakth\Desktop\vayu\.venv\Scripts\python.exe scripts\certify_builtins.py
```
