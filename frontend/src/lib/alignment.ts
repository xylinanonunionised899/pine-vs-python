import type { IndicatorSeries, TradeEvent } from "@shared/contracts";

// ────────────────────────────── Types ──────────────────────────────

export interface AlignmentToleranceConfig {
  absTolerance: number; // default 0.01
  relTolerance: number; // default 0.001 (0.1%)
}

export interface SeriesPair {
  seriesName: string;
  pineSeries: IndicatorSeries;
  pythonSeries: IndicatorSeries;
}

export interface BarComparison {
  barIndex: number;
  timestamp: string;
  pineValue: number | null;
  pythonValue: number | null;
  delta: number | null;
  percentDiff: number | null;
  withinTolerance: boolean;
}

export interface SeriesAlignmentResult {
  seriesName: string;
  bars: BarComparison[];
  totalBars: number;
  matchCount: number;
  matchPercent: number;
  rmse: number;
  maxAbsDiff: number;
  meanAbsDiff: number;
  mismatches: BarComparison[];
}

export interface TradeComparisonRow {
  index: number;
  timestamp: string;
  pineSide: string | null;
  pythonSide: string | null;
  pinePrice: number | null;
  pythonPrice: number | null;
  sideMatch: boolean;
  priceDelta: number | null;
}

export interface TradeAlignmentResult {
  totalPineTrades: number;
  totalPythonTrades: number;
  matchedTrades: number;
  signalMatchPercent: number;
  rows: TradeComparisonRow[];
  mismatches: TradeComparisonRow[];
}

export interface AlignmentReport {
  seriesResults: SeriesAlignmentResult[];
  tradeResult: TradeAlignmentResult;
  unmatchedPine: string[];
  unmatchedPython: string[];
  overallMatchPercent: number;
  overallRmse: number;
  overallMaxDiff: number;
  overallSignalMatchPercent: number;
  computedAt: string;
}

// ────────────────────────────── Constants ──────────────────────────

export const DEFAULT_TOLERANCE: AlignmentToleranceConfig = {
  absTolerance: 0.01,
  relTolerance: 0.001,
};

// ────────────────────────────── Series matching ───────────────────

/**
 * Match Pine and Python indicator series for comparison.
 *
 * Strategy:
 * 1. Exact name match (e.g. "ema_fast" ↔ "ema_fast")
 * 2. If no exact matches found, fall back to positional pairing
 *    (1st pine ↔ 1st python, 2nd ↔ 2nd, etc.) since Pine often
 *    outputs generic names like "plot_0" while Python uses descriptive
 *    names like "ema_fast".
 */
export function matchSeriesByName(
  pineSeries: IndicatorSeries[],
  pythonSeries: IndicatorSeries[],
): { paired: SeriesPair[]; unmatchedPine: string[]; unmatchedPython: string[] } {
  // ── Pass 1: exact name match ──
  const pythonLookup = new Map(pythonSeries.map((s) => [s.name, s]));
  const exactPaired: SeriesPair[] = [];
  const usedPython = new Set<string>();

  for (const pine of pineSeries) {
    const match = pythonLookup.get(pine.name);
    if (match) {
      exactPaired.push({ seriesName: pine.name, pineSeries: pine, pythonSeries: match });
      usedPython.add(pine.name);
    }
  }

  // If exact matching produced results, use them
  if (exactPaired.length > 0) {
    const unmatchedPine = pineSeries
      .filter((s) => !exactPaired.some((p) => p.pineSeries === s))
      .map((s) => s.name);
    const unmatchedPython = pythonSeries
      .filter((s) => !usedPython.has(s.name))
      .map((s) => s.name);
    return { paired: exactPaired, unmatchedPine, unmatchedPython };
  }

  // ── Pass 2: positional fallback ──
  // Pine often uses generic names (plot_0, plot_1) while Python uses
  // descriptive names (ema_fast, long_condition). Pair by position so
  // the user can compare them even when names differ.
  //
  // IMPORTANT: Filter out all-null series first. Pine scripts with many
  // toggled-off plots (e.g. "show Weekly? false") still create plot
  // entries with all-NaN values. Including them skews positional pairing.
  const hasNonNullValues = (s: IndicatorSeries): boolean =>
    s.values.some((v) => v.value !== null && v.value !== undefined);

  const livePine = pineSeries.filter(hasNonNullValues);
  const livePython = pythonSeries.filter(hasNonNullValues);

  const positionalPaired: SeriesPair[] = [];
  const limit = Math.min(livePine.length, livePython.length);

  for (let i = 0; i < limit; i++) {
    positionalPaired.push({
      seriesName: `${livePine[i].name} ↔ ${livePython[i].name}`,
      pineSeries: livePine[i],
      pythonSeries: livePython[i],
    });
  }

  const unmatchedPine = [
    ...livePine.slice(limit).map((s) => s.name),
    ...pineSeries.filter((s) => !hasNonNullValues(s)).map((s) => `${s.name} (empty)`),
  ];
  const unmatchedPython = livePython.slice(limit).map((s) => s.name);

  return { paired: positionalPaired, unmatchedPine, unmatchedPython };
}

// ────────────────────────── Per-bar alignment ─────────────────────

function isWithinTolerance(delta: number, reference: number, tol: AlignmentToleranceConfig): boolean {
  const absDelta = Math.abs(delta);
  return absDelta <= tol.absTolerance || absDelta <= tol.relTolerance * Math.abs(reference);
}

export function computeSeriesAlignment(
  pair: SeriesPair,
  tol: AlignmentToleranceConfig,
): SeriesAlignmentResult {
  const pineVals = pair.pineSeries.values;
  const pyVals = pair.pythonSeries.values;
  const limit = Math.min(pineVals.length, pyVals.length);
  const bars: BarComparison[] = [];
  let sumSqDiff = 0;
  let maxAbsDiff = 0;
  let sumAbsDiff = 0;
  let matchCount = 0;
  let validCount = 0;

  for (let i = 0; i < limit; i++) {
    const pv = pineVals[i]?.value ?? null;
    const yv = pyVals[i]?.value ?? null;

    if (pv === null || yv === null) {
      bars.push({
        barIndex: i,
        timestamp: pineVals[i]?.timestamp ?? pyVals[i]?.timestamp ?? "",
        pineValue: pv,
        pythonValue: yv,
        delta: null,
        percentDiff: null,
        withinTolerance: pv === null && yv === null,
      });
      continue;
    }

    const delta = yv - pv;
    const absDelta = Math.abs(delta);
    const pctDiff = pv !== 0 ? (absDelta / Math.abs(pv)) * 100 : absDelta === 0 ? 0 : Infinity;
    const within = isWithinTolerance(delta, pv, tol);

    bars.push({
      barIndex: i,
      timestamp: pineVals[i].timestamp,
      pineValue: pv,
      pythonValue: yv,
      delta,
      percentDiff: pctDiff,
      withinTolerance: within,
    });

    validCount++;
    sumSqDiff += delta * delta;
    if (absDelta > maxAbsDiff) maxAbsDiff = absDelta;
    sumAbsDiff += absDelta;
    if (within) matchCount++;
  }

  const rmse = validCount > 0 ? Math.sqrt(sumSqDiff / validCount) : 0;
  const meanAbsDiff = validCount > 0 ? sumAbsDiff / validCount : 0;

  return {
    seriesName: pair.seriesName,
    bars,
    totalBars: limit,
    matchCount,
    matchPercent: validCount > 0 ? (matchCount / validCount) * 100 : 0,
    rmse,
    maxAbsDiff,
    meanAbsDiff,
    mismatches: bars.filter((b) => !b.withinTolerance),
  };
}

// ────────────────────────── Trade alignment ───────────────────────

export function computeTradeAlignment(
  allTrades: TradeEvent[],
  _tol: AlignmentToleranceConfig,
): TradeAlignmentResult {
  const pineTrades = allTrades.filter((t) => t.source_engine === "pine");
  const pythonTrades = allTrades.filter((t) => t.source_engine === "python");
  const limit = Math.max(pineTrades.length, pythonTrades.length);
  let matched = 0;
  const rows: TradeComparisonRow[] = [];

  for (let i = 0; i < limit; i++) {
    const pt = pineTrades[i] ?? null;
    const yt = pythonTrades[i] ?? null;
    const sideMatch = pt !== null && yt !== null && pt.side === yt.side;
    if (sideMatch) matched++;

    rows.push({
      index: i,
      timestamp: pt?.timestamp ?? yt?.timestamp ?? "",
      pineSide: pt?.side ?? null,
      pythonSide: yt?.side ?? null,
      pinePrice: pt?.price ?? null,
      pythonPrice: yt?.price ?? null,
      sideMatch,
      priceDelta: pt !== null && yt !== null ? yt.price - pt.price : null,
    });
  }

  const compareLimit = Math.min(pineTrades.length, pythonTrades.length);

  return {
    totalPineTrades: pineTrades.length,
    totalPythonTrades: pythonTrades.length,
    matchedTrades: matched,
    signalMatchPercent: compareLimit > 0 ? (matched / compareLimit) * 100 : 0,
    rows,
    mismatches: rows.filter((r) => !r.sideMatch),
  };
}

// ────────────────────── Full alignment report ─────────────────────

export function computeAlignmentReport(
  pineSeries: IndicatorSeries[],
  pythonSeries: IndicatorSeries[],
  trades: TradeEvent[],
  tolerance: AlignmentToleranceConfig,
): AlignmentReport {
  const { paired, unmatchedPine, unmatchedPython } = matchSeriesByName(pineSeries, pythonSeries);
  const seriesResults = paired.map((pair) => computeSeriesAlignment(pair, tolerance));
  const tradeResult = computeTradeAlignment(trades, tolerance);

  const totalBars = seriesResults.reduce((sum, r) => sum + r.totalBars, 0);
  const totalMatch = seriesResults.reduce((sum, r) => sum + r.matchCount, 0);
  const overallMatchPercent = totalBars > 0 ? (totalMatch / totalBars) * 100 : 0;

  const allRmse = seriesResults.map((r) => r.rmse);
  const overallRmse = allRmse.length > 0 ? Math.sqrt(allRmse.reduce((s, v) => s + v * v, 0) / allRmse.length) : 0;

  const overallMaxDiff = seriesResults.length > 0
    ? Math.max(...seriesResults.map((r) => r.maxAbsDiff))
    : 0;

  return {
    seriesResults,
    tradeResult,
    unmatchedPine,
    unmatchedPython,
    overallMatchPercent,
    overallRmse,
    overallMaxDiff,
    overallSignalMatchPercent: tradeResult.signalMatchPercent,
    computedAt: new Date().toISOString(),
  };
}

// ────────────────────────── Export helpers ─────────────────────────

export function exportAlignmentCSV(results: SeriesAlignmentResult[]): string {
  const header = "Series,Bar#,Timestamp,Pine Value,Python Value,Delta,% Diff,Status";
  const rows: string[] = [header];

  for (const result of results) {
    for (const bar of result.bars) {
      const status = bar.withinTolerance ? "match" : "mismatch";
      const delta = bar.delta !== null ? bar.delta.toFixed(6) : "";
      const pctDiff = bar.percentDiff !== null && bar.percentDiff !== Infinity ? bar.percentDiff.toFixed(4) : "";
      const pineVal = bar.pineValue !== null ? bar.pineValue.toFixed(6) : "";
      const pyVal = bar.pythonValue !== null ? bar.pythonValue.toFixed(6) : "";
      rows.push(`${result.seriesName},${bar.barIndex},${bar.timestamp},${pineVal},${pyVal},${delta},${pctDiff},${status}`);
    }
  }

  return rows.join("\n");
}

export function exportAlignmentJSON(report: AlignmentReport): string {
  return JSON.stringify(report, null, 2);
}

export function downloadBlob(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
