import type { AlignmentReport } from "@/lib/alignment";

type SummaryMetricsProps = {
  report: AlignmentReport;
};

function metricColor(value: number): string {
  if (value >= 95) return "var(--success)";
  if (value >= 80) return "var(--pine)";
  return "var(--danger)";
}

export function SummaryMetrics({ report }: SummaryMetricsProps) {
  const totalBars = report.seriesResults.reduce((sum, r) => sum + r.totalBars, 0);

  return (
    <div className="stats-row">
      <div className="stat-card">
        <span>Total bars</span>
        <strong>{totalBars.toLocaleString()}</strong>
      </div>
      <div className="stat-card">
        <span>Match %</span>
        <strong style={{ color: metricColor(report.overallMatchPercent) }}>
          {report.overallMatchPercent.toFixed(1)}%
        </strong>
      </div>
      <div className="stat-card">
        <span>RMSE</span>
        <strong>{report.overallRmse.toFixed(6)}</strong>
      </div>
      <div className="stat-card">
        <span>Max diff</span>
        <strong>{report.overallMaxDiff.toFixed(6)}</strong>
      </div>
      <div className="stat-card">
        <span>Mean diff</span>
        <strong>
          {report.seriesResults.length > 0
            ? (report.seriesResults.reduce((s, r) => s + r.meanAbsDiff, 0) / report.seriesResults.length).toFixed(6)
            : "0.000000"}
        </strong>
      </div>
      <div className="stat-card">
        <span>Signal match %</span>
        <strong style={{ color: metricColor(report.overallSignalMatchPercent) }}>
          {report.overallSignalMatchPercent.toFixed(1)}%
        </strong>
      </div>
    </div>
  );
}
