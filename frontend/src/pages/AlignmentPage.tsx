import type { CandlePoint, IndicatorSeries, RunStatus, StrategyArtifact, TradeEvent } from "@shared/contracts";
import type { PineError } from "@/services/pineExecutionService";
import type { AlignmentToleranceConfig, SeriesAlignmentResult } from "@/lib/alignment";
import { useCallback, useMemo, useState } from "react";

import { computeAlignmentReport, DEFAULT_TOLERANCE } from "@/lib/alignment";
import { ChartPanel } from "@/components/charts/ChartPanel";
import { ToleranceControls } from "@/components/alignment/ToleranceControls";
import { OutputTable } from "@/components/alignment/OutputTable";
import { ComparisonResultPanel } from "@/components/alignment/ComparisonResultPanel";
import { MismatchReport } from "@/components/alignment/MismatchReport";
import { ExportButtons } from "@/components/alignment/ExportButtons";

type AlignmentPageProps = {
  currentRun: RunStatus | null;
  pineCandles: CandlePoint[];
  pineExecutionState: {
    isRunning: boolean;
    indicators: IndicatorSeries[];
    trades: TradeEvent[];
    errors: PineError[];
    lastRunAt: string | null;
  };
  runs: RunStatus[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  pineArtifact: StrategyArtifact;
  pythonArtifact: StrategyArtifact;
};

export function AlignmentPage({
  currentRun,
  pineCandles,
  pineExecutionState,
  runs,
  selectedRunId,
  onSelectRun,
  pineArtifact,
  pythonArtifact,
}: AlignmentPageProps) {
  const [tolerance, setTolerance] = useState<AlignmentToleranceConfig>(DEFAULT_TOLERANCE);

  // Derive series exactly like WorkspacePage
  const pineSeries = pineExecutionState.indicators.length > 0
    ? pineExecutionState.indicators
    : currentRun?.pine_series ?? [];
  const pythonSeries = currentRun?.python_series ?? [];
  const runCandles = currentRun?.candles ?? [];

  // Chart candle sources (same logic as WorkspacePage)
  const pineChartCandles = pineCandles.length > 0 ? pineCandles : runCandles;
  const pythonChartCandles = runCandles.length > 0 ? runCandles : pineChartCandles;

  // All trades from both engines
  const allTrades = useMemo(() => {
    const pineTs = pineExecutionState.trades ?? [];
    const pythonTs = currentRun?.trade_events ?? [];
    return [...pineTs, ...pythonTs];
  }, [pineExecutionState.trades, currentRun?.trade_events]);

  // Compute alignment report (auto-recomputes when tolerance changes)
  const report = useMemo(
    () => computeAlignmentReport(pineSeries, pythonSeries, allTrades, tolerance),
    [pineSeries, pythonSeries, allTrades, tolerance],
  );

  // Build comparison map for OutputTable error columns
  const comparisonMap = useMemo(() => {
    const map = new Map<string, SeriesAlignmentResult>();
    for (const result of report.seriesResults) {
      map.set(result.seriesName, result);
    }
    return map;
  }, [report.seriesResults]);

  const handleMismatchClick = useCallback((_seriesName: string, _barIndex: number) => {
    // Hook point for scroll-to-bar in table
  }, []);

  return (
    <div className="alignment-page">
      {/* ─── Top bar: tolerance + run selector + export ─── */}
      <div className="alignment-topbar surface toolbar-card">
        <ToleranceControls tolerance={tolerance} onChange={setTolerance} />
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
          <label className="field compact-field">
            <span>Run</span>
            <select value={selectedRunId ?? ""} onChange={(e) => onSelectRun(e.target.value)}>
              {runs.length === 0 && <option value="">No runs</option>}
              {runs.map((run) => (
                <option key={run.run_id} value={run.run_id}>
                  {run.run_id.slice(0, 8)} ({run.lifecycle})
                </option>
              ))}
            </select>
          </label>
          <ExportButtons report={report} />
        </div>
      </div>

      {/* ─── Row 1: Side-by-side Output Data Tables ─── */}
      <div className="alignment-tables-row">
        <OutputTable
          title="Pine Script Output"
          tone="pine"
          candles={pineChartCandles}
          indicators={pineSeries}
          comparisonMap={comparisonMap}
          fileLabel="stats_data_pine"
        />
        <OutputTable
          title="Python Output"
          tone="python"
          candles={pythonChartCandles}
          indicators={pythonSeries}
          comparisonMap={comparisonMap}
          fileLabel="stats_data.py"
        />
      </div>

      {/* ─── Row 2: Pine Chart | Comparison Result | Python Chart ─── */}
      <div className="alignment-charts-row">
        <article className="surface workspace-card">
          <ChartPanel
            title="Pine Script  Chart"
            seriesName={pineSeries[0]?.name ?? "No Pine series"}
            tone="pine"
            candles={pineChartCandles}
            indicatorSeries={pineSeries}
            emptyMessage="No Pine indicator data."
            trades={pineExecutionState.trades}
          />
        </article>

        <ComparisonResultPanel report={report} />

        <article className="surface workspace-card">
          <ChartPanel
            title="Python Chart"
            seriesName={pythonSeries[0]?.name ?? "No Python series"}
            tone="python"
            candles={pythonChartCandles}
            indicatorSeries={pythonSeries}
            emptyMessage="No Python indicator data."
          />
        </article>
      </div>

      {/* ─── Row 3: Strategy code editors (read-only display) ─── */}
      <div className="alignment-code-row">
        <div className="surface workspace-card strategy-code-card">
          <div className="strategy-code-header">
            <h3 style={{ margin: 0 }}>Pine Script Strategy</h3>
            <span className="pill" style={{ fontSize: "0.7rem", padding: "3px 8px", color: "var(--pine)" }}>Pine</span>
          </div>
          <pre className="strategy-code-block">{pineArtifact.source_code || "// No Pine Script code"}</pre>
          <div className="strategy-code-footer">
            <span className="muted-copy" style={{ fontSize: "0.72rem" }}>Compare Output &middot; sync &middot; stats</span>
          </div>
        </div>

        <div className="surface workspace-card strategy-code-card">
          <div className="strategy-code-header">
            <h3 style={{ margin: 0 }}>Python Strategy</h3>
            <span className="pill" style={{ fontSize: "0.7rem", padding: "3px 8px", color: "var(--python)" }}>&lt;/&gt;</span>
          </div>
          <pre className="strategy-code-block">{pythonArtifact.source_code || "# No Python code"}</pre>
        </div>
      </div>

      {/* ─── Row 4: Mismatch report (only if mismatches exist) ─── */}
      {report.seriesResults.some((r) => r.mismatches.length > 0) && (
        <MismatchReport seriesResults={report.seriesResults} onClickMismatch={handleMismatchClick} />
      )}

      {/* ─── Unmatched series warnings ─── */}
      {(report.unmatchedPine.length > 0 || report.unmatchedPython.length > 0) && (
        <div className="banner warning" style={{ display: "block", borderRadius: "18px" }}>
          {report.unmatchedPine.length > 0 && (
            <p style={{ margin: "0 0 4px" }}>Unmatched Pine series: <strong>{report.unmatchedPine.join(", ")}</strong></p>
          )}
          {report.unmatchedPython.length > 0 && (
            <p style={{ margin: 0 }}>Unmatched Python series: <strong>{report.unmatchedPython.join(", ")}</strong></p>
          )}
        </div>
      )}
    </div>
  );
}
