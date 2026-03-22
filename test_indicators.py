"""Test all 6 pre-built indicator Python strategies execute correctly."""
import sys
sys.path.insert(0, "backend/vendor")
sys.path.insert(0, "backend")
sys.path.insert(0, ".")

import numpy as np
import pandas as pd
from app.services.indicator_service import BUILTIN_INDICATORS
from app.services.dataset_service import dataset_service

# Load the SBIN dataset (18,850 rows)
frame = dataset_service.load_frame("dataset-7a466fb0")
print(f"Dataset: {len(frame)} rows, columns: {list(frame.columns)}")
print()

all_passed = True
for ind in BUILTIN_INDICATORS:
    name = ind["name"]
    python_code = ind["python_code"]
    expected_series = ind["series_names"]

    print(f"=== {name} ===")
    try:
        # Execute the Python strategy
        namespace = {"pd": pd, "np": np, "__builtins__": __builtins__}
        exec(python_code, namespace)
        run_strategy = namespace.get("run_strategy")
        if not run_strategy:
            print(f"  FAIL: No run_strategy function found")
            all_passed = False
            continue

        result = run_strategy(frame.copy())

        # Check expected series exist
        base_cols = {"timestamp", "open", "high", "low", "close", "volume"}
        indicator_cols = [c for c in result.columns if c not in base_cols]

        missing = [s for s in expected_series if s not in result.columns]
        if missing:
            print(f"  FAIL: Missing columns: {missing}")
            all_passed = False
        else:
            print(f"  OK: Series: {indicator_cols}")

        # Show sample values
        for col in expected_series:
            if col in result.columns:
                vals = result[col].dropna()
                non_null = len(vals)
                total = len(result)
                if non_null > 0:
                    first_val = vals.iloc[0]
                    if isinstance(first_val, (float, np.floating)):
                        print(f"  {col}: first={first_val:.6f}, non-null={non_null}/{total}")
                    else:
                        print(f"  {col}: first={first_val}, non-null={non_null}/{total}")
                else:
                    print(f"  {col}: ALL NULL ({total} rows)")

    except Exception as e:
        import traceback
        print(f"  ERROR: {e}")
        traceback.print_exc()
        all_passed = False

    print()

print("=" * 50)
if all_passed:
    print("ALL 6 PYTHON STRATEGIES PASSED")
else:
    print("SOME STRATEGIES FAILED")
