/**
 * Built-in indicator Pine certification.
 *
 * Runs every built-in from data/indicators/index.json through the PineTS engine
 * (the same path used by the Workspace "Run Pine" button), validates that all
 * expected series are produced, and writes
 *   docs/builtin-parity-pine.json
 * for consumption by scripts/certify_builtins.py.
 *
 * Run:
 *   cd "D:\python , pine script\frontend"
 *   npm run test:parity
 *
 * Env vars:
 *   DATASET_CSV   path to candle CSV (default: uses demo dataset from APPDATA or fallback path)
 *   WARMUP_BARS   number of warmup bars to skip in null-fraction check (default: 50)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, afterAll } from "vitest";
import { executePineScript } from "@/services/pineExecutionService";
import type { CandlePoint } from "@shared/contracts";

// ── paths ─────────────────────────────────────────────────────────────────────
const ROOT = path.resolve(import.meta.dirname, "../../..");
const INDEX_PATH = path.join(ROOT, "data", "indicators", "index.json");
const DOCS_DIR = path.join(ROOT, "docs");
const PINE_REPORT_PATH = path.join(DOCS_DIR, "builtin-parity-pine.json");
const WARMUP = Number(process.env.WARMUP_BARS ?? "50");

// ── find dataset CSV ──────────────────────────────────────────────────────────
function findDatasetCsv(): { csvPath: string; datasetId: string; isDemo: boolean } {
  // 1. Explicit override
  if (process.env.DATASET_CSV && existsSync(process.env.DATASET_CSV)) {
    return { csvPath: process.env.DATASET_CSV, datasetId: "env-override", isDemo: false };
  }
  // 2. APPDATA storage index (packaged or dev with seeded data)
  const appdata = process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "~", "AppData", "Roaming");
  const indexPath = path.join(appdata, "TradingStrategyComparator", "cache", "datasets", "index.json");
  if (existsSync(indexPath)) {
    const records: Array<{ dataset_id: string; data_path: string }> = JSON.parse(readFileSync(indexPath, "utf-8"));
    const nonDemo = records.find((r) => r.dataset_id !== "dataset-demo-5m" && existsSync(r.data_path));
    const demo = records.find((r) => r.dataset_id === "dataset-demo-5m" && existsSync(r.data_path));
    if (nonDemo) return { csvPath: nonDemo.data_path, datasetId: nonDemo.dataset_id, isDemo: false };
    if (demo) return { csvPath: demo.data_path, datasetId: "dataset-demo-5m", isDemo: true };
  }
  // 3. Dev data dir fallback
  const devDemo = path.join(ROOT, "data", "cache", "datasets", "dataset-demo-5m.csv");
  if (existsSync(devDemo)) return { csvPath: devDemo, datasetId: "dataset-demo-5m", isDemo: true };
  throw new Error(
    "No dataset CSV found. Set DATASET_CSV env var or save a dataset via the app first.",
  );
}

// ── CSV → CandlePoint[] ───────────────────────────────────────────────────────
function parseCsv(csvPath: string): CandlePoint[] {
  const lines = readFileSync(csvPath, "utf-8").trim().split("\n");
  const header = lines[0].split(",").map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const tsIdx = idx("timestamp");
  const oIdx = idx("open");
  const hIdx = idx("high");
  const lIdx = idx("low");
  const cIdx = idx("close");
  const vIdx = idx("volume");

  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return {
      timestamp: cols[tsIdx].trim(),
      open: parseFloat(cols[oIdx]),
      high: parseFloat(cols[hIdx]),
      low: parseFloat(cols[lIdx]),
      close: parseFloat(cols[cIdx]),
      volume: vIdx >= 0 ? parseFloat(cols[vIdx]) : 0,
    } satisfies CandlePoint;
  });
}

// ── shared dataset + index ────────────────────────────────────────────────────
const { csvPath, datasetId, isDemo } = findDatasetCsv();
const candles = parseCsv(csvPath);

interface IndexEntry {
  indicator_id: string;
  name: string;
  pine_code: string;
  series_names: string[];
}
const entries: IndexEntry[] = JSON.parse(readFileSync(INDEX_PATH, "utf-8"));

// ── result accumulator ────────────────────────────────────────────────────────
interface PineResult {
  indicator_id: string;
  name: string;
  dataset_id: string;
  is_demo_fallback: boolean;
  bars: number;
  warmup: number;
  status: "pass" | "fail" | "error";
  expected_series: string[];
  produced_series: string[];
  issues: string[];
  certified_at: string;
}
const results: PineResult[] = [];

// ── tests ─────────────────────────────────────────────────────────────────────
describe("Built-in Pine certification", () => {
  for (const entry of entries) {
    it(`${entry.name} (${entry.indicator_id})`, async () => {
      const issues: string[] = [];
      let produced: string[] = [];
      let status: "pass" | "fail" | "error" = "pass";

      try {
        const result = await executePineScript(entry.pine_code, candles, WARMUP);

        if (result.errors.length > 0) {
          status = "error";
          issues.push(...result.errors.map((e) => `Pine error: ${e.message}`));
        } else {
          produced = result.indicators.map((s) => s.name);

          // Expected series names from index — map to plot-style names (PineTS uses plot titles)
          // We check that the count of produced series >= expected count (names may differ slightly)
          if (produced.length === 0) {
            issues.push("no indicators produced");
          }

          // Check null-fraction post-warmup for each produced series
          for (const series of result.indicators) {
            const postWarmup = series.values.slice(WARMUP);
            if (postWarmup.length === 0) continue;
            const nullFrac = postWarmup.filter((p) => p.value === null).length / postWarmup.length;
            if (nullFrac === 1) {
              issues.push(`all-null series post-warmup: '${series.name}'`);
            } else if (nullFrac > 0.5) {
              issues.push(`>${Math.round(nullFrac * 100)}% null post-warmup: '${series.name}'`);
            }
          }

          if (produced.length < entry.series_names.length) {
            issues.push(
              `expected ${entry.series_names.length} series, got ${produced.length}` +
              ` (expected: ${entry.series_names.join(", ")}; got: ${produced.join(", ")})`,
            );
          }
        }
      } catch (err) {
        status = "error";
        issues.push(`exception: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (issues.length > 0 && status === "pass") status = "fail";

      results.push({
        indicator_id: entry.indicator_id,
        name: entry.name,
        dataset_id: datasetId,
        is_demo_fallback: isDemo,
        bars: candles.length,
        warmup: WARMUP,
        status,
        expected_series: entry.series_names,
        produced_series: produced,
        issues,
        certified_at: new Date().toISOString(),
      });

      // Surface issues in test output
      expect(issues, `Issues for ${entry.name}: ${issues.join("; ")}`).toHaveLength(0);
    });
  }

  afterAll(() => {
    writeFileSync(PINE_REPORT_PATH, JSON.stringify(results, null, 2), "utf-8");
    console.log(`\n[parity] Pine report written -> ${PINE_REPORT_PATH}`);
  });
});
