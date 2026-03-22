"""
Built-in indicator parity certification harness.

Runs every built-in from data/indicators/index.json through the Python strategy
engine and validates that:
  - all expected series_names are produced
  - no series is entirely null/NaN after the warmup window
  - execution completes without error

Optionally merges Pine results from docs/builtin-parity-pine.json (written by
`npm run test:parity`) to produce a combined Pine↔Python parity report.

Writes two artefacts to docs/:
  - builtin-parity-report.json   (machine-readable, one record per indicator)
  - builtin-parity-summary.md    (human-readable checklist)

Usage (from repo root):

  # Python-only
  PYTHONPATH="D:/python , pine script" \\
      C:/Users/sakth/Desktop/vayu/.venv/Scripts/python.exe \\
      scripts/certify_builtins.py

  # Pine + Python combined
  cd "D:/python , pine script/frontend" && npm run test:parity
  cd "D:/python , pine script"
  python scripts/certify_builtins.py --include-pine

  # Strict mode: fail if only demo dataset is available
  python scripts/certify_builtins.py --strict

Flags:
  --strict        Exit 1 if only the demo dataset is available (results
                  are written as demo-fallback but not treated as certified).
  --include-pine  Load docs/builtin-parity-pine.json and include Pine status
                  in the combined report.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

# ── bootstrap sys.path ────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[1]          # D:\python , pine script
BACKEND = ROOT / "backend"                          # D:\python , pine script\backend
for p in (str(ROOT), str(BACKEND)):
    if p not in sys.path:
        sys.path.insert(0, p)

import pandas as pd

from app.core.python_engine import PythonStrategyEngine
from app.models.contracts import RunConfig, StrategyArtifact
from app.services.storage import storage_service

WARMUP = 50
TOLERANCE = 0.001


# ── CLI args ──────────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail if only the demo dataset is available (not a canonical SBIN/real dataset)",
    )
    parser.add_argument(
        "--include-pine",
        action="store_true",
        dest="include_pine",
        help="Load docs/builtin-parity-pine.json and include Pine status in the report",
    )
    return parser.parse_args()


# ── dataset resolution ─────────────────────────────────────────────────────────

def _resolve_dataset() -> tuple[str, str, pd.DataFrame, bool]:
    """Return (dataset_id, dataset_name, frame, is_demo).

    Prefers the first non-demo saved dataset (SBIN etc.) over the demo dataset.
    """
    records = storage_service.list_records(storage_service.datasets_index)
    non_demo = [r for r in records if r.get("dataset_id") != "dataset-demo-5m"]
    target = non_demo[0] if non_demo else next(
        (r for r in records if r.get("dataset_id") == "dataset-demo-5m"), None
    )
    if target is None:
        raise RuntimeError(
            "No saved dataset found. Import a dataset before running certification."
        )

    data_path = Path(target["data_path"])
    if not data_path.exists():
        raise FileNotFoundError(f"Dataset CSV not found: {data_path}")

    frame = pd.read_csv(data_path)

    # Normalise column names via the saved mapping
    mapping: dict[str, str] = target.get("mapping") or {}
    rename = {v: k for k, v in mapping.items() if v and k != v}
    if rename:
        frame = frame.rename(columns=rename)

    # Parse timestamp to datetime
    if "timestamp" in frame.columns:
        frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)

    is_demo = target.get("dataset_id") == "dataset-demo-5m"
    return target["dataset_id"], target["name"], frame, is_demo


# ── Pine results loader ────────────────────────────────────────────────────────

def _load_pine_results(pine_report_path: Path) -> dict[str, dict[str, Any]]:
    """Return a map of indicator_id → Pine result dict."""
    if not pine_report_path.exists():
        return {}
    raw: list[dict[str, Any]] = json.loads(pine_report_path.read_text(encoding="utf-8"))
    return {r["indicator_id"]: r for r in raw}


# ── single-indicator Python certification ─────────────────────────────────────

def _certify_python(
    entry: dict[str, Any],
    frame: pd.DataFrame,
    dataset_id: str,
) -> dict[str, Any]:
    indicator_id: str = entry["indicator_id"]
    name: str = entry["name"]
    expected_series: list[str] = entry.get("series_names", [])

    artifact = StrategyArtifact(
        language="python",
        name=name,
        source_code=entry["python_code"],
        declared_outputs=expected_series,
        adapter_metadata={"engine": "local-python"},
    )
    run_config = RunConfig(
        mode="local_compare",
        symbol="CERT",
        timeframe="5m",
        one_open_position=True,
        tolerance=TOLERANCE,
        warmup_bars=WARMUP,
        selected_outputs=expected_series,
        timezone="UTC",
    )

    status = "pass"
    issues: list[str] = []
    produced: list[str] = []

    try:
        python_series, _trades, enriched = PythonStrategyEngine().execute(
            artifact, frame, run_config
        )
        produced = [s.name for s in python_series]

        for sname in expected_series:
            if sname not in produced:
                issues.append(f"missing series: {sname!r}")

        post_warmup = enriched.iloc[WARMUP:]
        for sname in produced:
            if sname in post_warmup.columns:
                null_frac = post_warmup[sname].isna().mean()
                if null_frac == 1.0:
                    issues.append(f"all-null series after warmup: {sname!r}")
                elif null_frac > 0.5:
                    issues.append(f">{null_frac:.0%} null values post-warmup: {sname!r}")

    except Exception as exc:
        status = "error"
        issues.append(f"execution error: {exc}")

    if issues and status != "error":
        status = "fail"

    return {
        "indicator_id": indicator_id,
        "name": name,
        "dataset_id": dataset_id,
        "python_status": status,
        "python_issues": issues,
        "python_series": produced,
        "expected_series": expected_series,
        "bars_used": len(frame),
        "warmup": WARMUP,
        "certified_at": datetime.now(UTC).isoformat(),
    }


# ── combine Python + Pine results ─────────────────────────────────────────────

def _combine(
    py_result: dict[str, Any],
    pine_result: dict[str, Any] | None,
    is_demo: bool,
) -> dict[str, Any]:
    combined = dict(py_result)
    combined["is_demo_fallback"] = is_demo

    if pine_result:
        combined["pine_status"] = pine_result.get("status", "unknown")
        combined["pine_issues"] = pine_result.get("issues", [])
        combined["pine_series"] = pine_result.get("produced_series", [])

        # Parity: compare series names between Python and Pine
        py_names = set(py_result.get("python_series", []))
        pine_names = set(pine_result.get("produced_series", []))
        expected = set(py_result.get("expected_series", []))

        py_only = (py_names - pine_names) & expected
        pine_only = (pine_names - py_names) & expected

        parity_issues: list[str] = []
        if py_only:
            parity_issues.append(f"Python-only series: {sorted(py_only)}")
        if pine_only:
            parity_issues.append(f"Pine-only series: {sorted(pine_only)}")

        both_pass = py_result["python_status"] == "pass" and pine_result.get("status") == "pass"
        combined["parity_status"] = "pass" if (both_pass and not parity_issues) else "fail"
        combined["parity_issues"] = parity_issues
    else:
        combined["pine_status"] = "not_run"
        combined["pine_issues"] = []
        combined["pine_series"] = []
        combined["parity_status"] = "python_only"
        combined["parity_issues"] = []

    return combined


# ── report writers ─────────────────────────────────────────────────────────────

def _write_json(results: list[dict[str, Any]], dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"[OK] JSON report -> {dest}")


def _write_markdown(
    results: list[dict[str, Any]],
    dataset_id: str,
    dataset_name: str,
    is_demo: bool,
    include_pine: bool,
    dest: Path,
) -> None:
    lines: list[str] = []
    now = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    total = len(results)
    py_passed = sum(1 for r in results if r["python_status"] == "pass")
    pine_passed = sum(1 for r in results if r.get("pine_status") == "pass") if include_pine else None
    parity_passed = sum(1 for r in results if r.get("parity_status") == "pass") if include_pine else None

    demo_note = " *(demo-fallback — not canonical certification)*" if is_demo else ""

    lines += [
        "# Built-In Indicator Parity Certification",
        "",
        f"**Last run:** {now}  ",
        f"**Dataset:** `{dataset_id}` — {dataset_name}{demo_note}  ",
        f"**Python:** {py_passed}/{total} pass  ",
    ]
    if include_pine and pine_passed is not None:
        lines += [
            f"**Pine:** {pine_passed}/{total} pass  ",
            f"**Parity (Pine↔Python):** {parity_passed}/{total} pass  ",
        ]
    lines.append("")

    if is_demo:
        lines += [
            "> ⚠️ **Demo-fallback mode** — results use the seeded 300-bar synthetic dataset.",
            "> For full certification, import a real dataset (e.g. SBIN_5.xlsx) and re-run.",
            "",
        ]

    # Summary table
    if include_pine:
        lines += [
            "## Summary",
            "",
            "| Indicator | Python | Pine | Parity | Notes |",
            "|-----------|--------|------|--------|-------|",
        ]
        for r in results:
            py_icon = "✅" if r["python_status"] == "pass" else "❌"
            pine_icon = "✅" if r.get("pine_status") == "pass" else ("⚪" if r.get("pine_status") == "not_run" else "❌")
            par_icon = "✅" if r.get("parity_status") == "pass" else ("⚪" if r.get("parity_status") == "python_only" else "❌")
            notes = "; ".join(r.get("parity_issues", []) or r.get("python_issues", [])[:1]) or "—"
            lines.append(f"| {r['name']} | {py_icon} | {pine_icon} | {par_icon} | {notes} |")
    else:
        lines += [
            "## Summary (Python only)",
            "",
            "| Indicator | Python status | Series produced | Issues |",
            "|-----------|--------------|-----------------|--------|",
        ]
        for r in results:
            icon = "✅" if r["python_status"] == "pass" else "❌"
            series_str = ", ".join(f"`{s}`" for s in r["python_series"]) or "—"
            issues_str = "; ".join(r["python_issues"]) if r["python_issues"] else "—"
            lines.append(f"| {r['name']} | {icon} {r['python_status']} | {series_str} | {issues_str} |")

    lines += ["", "## Detail", ""]
    for r in results:
        py_icon = "✅" if r["python_status"] == "pass" else "❌"
        lines += [
            f"### {py_icon} {r['name']} (`{r['indicator_id']}`)",
            "",
            f"- **Python:** {r['python_status']}",
        ]
        if include_pine:
            lines.append(f"- **Pine:** {r.get('pine_status', 'not_run')}")
            lines.append(f"- **Parity:** {r.get('parity_status', 'python_only')}")
        lines += [
            f"- **Bars:** {r['bars_used']} (warmup {r['warmup']})",
            f"- **Expected:** {', '.join(f'`{s}`' for s in r['expected_series']) or '—'}",
            f"- **Python series:** {', '.join(f'`{s}`' for s in r['python_series']) or '—'}",
        ]
        if include_pine:
            lines.append(f"- **Pine series:** {', '.join(f'`{s}`' for s in r.get('pine_series', [])) or '—'}")
        all_issues = (r.get("python_issues") or []) + (r.get("parity_issues") or [])
        if all_issues:
            lines.append("- **Issues:**")
            for iss in all_issues:
                lines.append(f"  - {iss}")
        lines.append("")

    lines += [
        "## Caveats",
        "",
        "- Python certification runs via `PythonStrategyEngine` directly (same path as Workspace replay).",
        "- Pine certification runs via PineTS in Node.js (`npm run test:parity`) — same engine as the browser.",
        "- `long_condition` / `short_condition` boolean series: null-fraction check is lenient.",
        "- Pine↔Python value-level comparison (per-bar tolerance) is validated manually via the Alignment tab.",
        "",
        "## Re-running",
        "",
        "```powershell",
        'cd "D:\\python , pine script"',
        "",
        "# Python only",
        "C:\\Users\\sakth\\Desktop\\vayu\\.venv\\Scripts\\python.exe scripts\\certify_builtins.py",
        "",
        "# Combined Pine + Python",
        "cd frontend && npm run test:parity && cd ..",
        "C:\\Users\\sakth\\Desktop\\vayu\\.venv\\Scripts\\python.exe scripts\\certify_builtins.py --include-pine",
        "",
        "# Strict (fail on demo-only data)",
        "C:\\Users\\sakth\\Desktop\\vayu\\.venv\\Scripts\\python.exe scripts\\certify_builtins.py --strict",
        "```",
        "",
    ]

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text("\n".join(lines), encoding="utf-8")
    print(f"[OK] Markdown summary -> {dest}")


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    args = _parse_args()

    index_path = ROOT / "data" / "indicators" / "index.json"
    if not index_path.exists():
        print(f"[FAIL] Indicator index not found: {index_path}")
        sys.exit(1)

    entries: list[dict[str, Any]] = json.loads(index_path.read_text(encoding="utf-8"))
    print(f"Found {len(entries)} built-in indicators")

    try:
        dataset_id, dataset_name, frame, is_demo = _resolve_dataset()
    except Exception as exc:
        print(f"[FAIL] {exc}")
        sys.exit(1)

    if is_demo and args.strict:
        print(
            "[FAIL] --strict mode: only demo dataset available. "
            "Import a real dataset (e.g. SBIN_5.xlsx) and re-run."
        )
        sys.exit(1)

    demo_note = " [demo-fallback]" if is_demo else " [canonical]"
    print(f"Using dataset: {dataset_id!r} ({len(frame)} bars){demo_note}")

    # Load Pine results if requested
    pine_report_path = ROOT / "docs" / "builtin-parity-pine.json"
    pine_map: dict[str, dict[str, Any]] = {}
    if args.include_pine:
        pine_map = _load_pine_results(pine_report_path)
        if not pine_map:
            print(f"[WARN] --include-pine specified but no Pine report found at {pine_report_path}")
            print("       Run: cd frontend && npm run test:parity")

    # Run Python certification for each indicator
    results = []
    for entry in entries:
        print(f"  Certifying {entry['name']}...", end=" ", flush=True)
        py_result = _certify_python(entry, frame, dataset_id)
        pine_result = pine_map.get(entry["indicator_id"])
        combined = _combine(py_result, pine_result, is_demo)

        icon = "[OK]" if py_result["python_status"] == "pass" else "[FAIL]"
        suffix = f" — {'; '.join(py_result['python_issues'])}" if py_result["python_issues"] else ""
        if args.include_pine and pine_result:
            pine_icon = "[Pine OK]" if pine_result.get("status") == "pass" else "[Pine FAIL]"
            print(f"{icon} {pine_icon}{suffix}")
        else:
            print(f"{icon}{suffix}")
        results.append(combined)

    py_passed = sum(1 for r in results if r["python_status"] == "pass")
    print(f"\nPython: {py_passed}/{len(results)} pass")
    if args.include_pine and pine_map:
        pine_passed = sum(1 for r in results if r.get("pine_status") == "pass")
        parity_passed = sum(1 for r in results if r.get("parity_status") == "pass")
        print(f"Pine:   {pine_passed}/{len(results)} pass")
        print(f"Parity: {parity_passed}/{len(results)} pass")

    docs_dir = ROOT / "docs"
    _write_json(results, docs_dir / "builtin-parity-report.json")
    _write_markdown(
        results, dataset_id, dataset_name, is_demo,
        include_pine=bool(args.include_pine and pine_map),
        dest=docs_dir / "builtin-parity-summary.md",
    )

    # Exit 1 if any Python check failed
    if py_passed < len(results):
        sys.exit(1)


if __name__ == "__main__":
    main()
