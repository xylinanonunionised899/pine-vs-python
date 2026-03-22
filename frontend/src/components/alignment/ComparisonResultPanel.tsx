import type { AlignmentReport } from "@/lib/alignment";

type ComparisonResultPanelProps = {
  report: AlignmentReport;
};

function passFailBadge(value: number, threshold = 95): "PASS" | "FAIL" {
  return value >= threshold ? "PASS" : "FAIL";
}

export function ComparisonResultPanel({ report }: ComparisonResultPanelProps) {
  const hasPairedSeries = report.seriesResults.length > 0;
  const indicatorAlign = report.overallMatchPercent;
  const signalAlign = report.overallSignalMatchPercent;
  const strategyMatch = hasPairedSeries && indicatorAlign >= 95 && signalAlign >= 95;

  // Top mismatch info — pick the largest delta across all series
  const topMismatch = report.seriesResults
    .flatMap((r) => r.mismatches)
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))[0];

  return (
    <div className="surface workspace-card comparison-result-panel">
      <h3 style={{ margin: "0 0 12px", fontSize: "0.95rem" }}>Indicator Comparison Result</h3>

      <div className="comparison-result-rows">
        <div className="comparison-result-row">
          <span className="result-check" style={{ color: indicatorAlign >= 95 ? "var(--success)" : "var(--danger)" }}>
            {indicatorAlign >= 95 ? "\u2713" : "\u2717"}
          </span>
          <span className="result-label">Indicator Alignment:</span>
          <span className="result-dots" />
          <span className="result-check" style={{ color: indicatorAlign >= 95 ? "var(--success)" : "var(--danger)" }}>
            {indicatorAlign >= 95 ? "\u2713" : "\u2717"}
          </span>
          <strong style={{ color: indicatorAlign >= 95 ? "var(--success)" : "var(--danger)" }}>
            {indicatorAlign.toFixed(2)}%
          </strong>
        </div>

        <div className="comparison-result-row">
          <span className="result-check" style={{ color: signalAlign >= 95 ? "var(--success)" : "var(--danger)" }}>
            {signalAlign >= 95 ? "\u2713" : "\u2717"}
          </span>
          <span className="result-label">Signal Alignment:</span>
          <span className="result-dots" />
          <span className="result-check" style={{ color: signalAlign >= 95 ? "var(--success)" : "var(--danger)" }}>
            {signalAlign >= 95 ? "\u2713" : "\u2717"}
          </span>
          <strong style={{ color: signalAlign >= 95 ? "var(--success)" : "var(--danger)" }}>
            {signalAlign.toFixed(2)}%
          </strong>
        </div>

        <div className="comparison-result-row">
          <span className="result-check" style={{ color: strategyMatch ? "var(--success)" : "var(--danger)" }}>
            {strategyMatch ? "\u2713" : "\u2717"}
          </span>
          <span className="result-label">Strategy Match:</span>
          <span className="result-dots" />
          <span
            className={`strategy-badge ${strategyMatch ? "strategy-badge--pass" : "strategy-badge--fail"}`}
          >
            {passFailBadge(indicatorAlign)}
          </span>
        </div>
      </div>

      {/* Mismatch callout */}
      {topMismatch && topMismatch.delta !== null && (
        <div className="mismatch-callout">
          <span className="mismatch-callout-dot" />
          <span>Mismatch at bar #{topMismatch.barIndex}</span>
          <span className="mismatch-callout-value">{Math.abs(topMismatch.delta).toFixed(5)}</span>
        </div>
      )}

      {!topMismatch && hasPairedSeries && (
        <div className="mismatch-callout" style={{ borderColor: "var(--success)" }}>
          <span className="mismatch-callout-dot" style={{ background: "var(--success)" }} />
          <span>All indicators aligned</span>
        </div>
      )}

      {!hasPairedSeries && (
        <div className="mismatch-callout" style={{ borderColor: "var(--pine)" }}>
          <span className="mismatch-callout-dot" style={{ background: "var(--pine)" }} />
          <span>No paired series found</span>
        </div>
      )}
    </div>
  );
}
