# Bugs Fixed — Session Log

## 2026-03-11: Super Trend Python Code — ALL NULL Output

**Symptom**: The `supertrend` column in Super Trend Python strategy output was ALL NULL (18,850 NaN values).

**Root Cause**: The `st` array was initialized with `np.full(n, np.nan)` but `st[0]` was never explicitly set. The loop starting at `i=1` had a condition `if st[i-1] == final_upper[i-1]` which could never be true since `st[0]` was NaN (NaN != anything).

**Fix** in `backend/app/services/indicator_service.py` (Super Trend BUILTIN_INDICATORS entry):
```python
# Initialize first bar — MUST be set before the loop
if n > 0:
    st[0] = final_upper[0]
    direction[0] = 1.0
```

Also added NaN handling for early bars where ATR hasn't warmed up:
```python
if np.isnan(final_lower[i]) or np.isnan(final_lower[i - 1]):
    final_lower[i] = final_lower[i] if not np.isnan(final_lower[i]) else final_lower[i - 1]
```

**Verification**: After fix, `supertrend` shows 18,841/18,850 non-null (9 bar warmup from ATR period=10).

---

## 2026-03-11: Corrupted permissions.json — Backend 500 Error

**Symptom**: `GET /permissions` returned HTTP 500 Internal Server Error. Backend logs showed `json.decoder.JSONDecodeError: Extra data: line 137 column 2`.

**Root Cause**: The file `data/artifacts/permissions.json` had corrupted content appended after the valid JSON array closing bracket:
```json
  }
]true
  }
]
```
The valid array ended at `]` on line 137, but `true\n  }\n]` was appended (likely from a race condition in concurrent writes).

**Fix**: Removed the extra `true\n  }\n]` content after the valid JSON array closing bracket.

**Impact**: This 500 error on `/permissions` was causing the preview browser's `refreshCore()` to fail intermittently, which prevented `state.indicators` from being populated. Once fixed, the Library page loaded all 6 indicators correctly.

---

## 2026-03-11: Alignment Tab — False-Positive 100% Match

**Symptom**: Alignment tab showed 100% match for all series even when data should differ.

**Root Cause**: When matching series by name between Pine and Python, all-null series (where both sides have no data) were counted as perfect matches, inflating the overall match percentage.

**Fix**: Added filtering in `alignment.ts` to exclude series where both Pine and Python values are all-null from the alignment report.

---

## 2026-03-11: Alignment Tab — 0% Match on Correct Data

**Symptom**: Alignment showed 0% match despite both engines producing correct output.

**Root Cause**: The wrong dataset was selected — the 3-row "Fixture dataset" instead of the 18,850-row "SBIN local workbook". With only 3 rows, Pine's indicator warmup period meant all computed values were NaN, producing no valid comparisons.

**Fix**: User selected the correct dataset (18,850 rows). This was a usage issue, not a code bug.
