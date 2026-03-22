import type { SeriesAlignmentResult } from "@/lib/alignment";

type MismatchReportProps = {
  seriesResults: SeriesAlignmentResult[];
  onClickMismatch: (seriesName: string, barIndex: number) => void;
};

export function MismatchReport({ seriesResults, onClickMismatch }: MismatchReportProps) {
  // Collect all mismatches across all series, sorted by bar index
  const allMismatches = seriesResults
    .flatMap((r) =>
      r.mismatches.map((bar) => ({
        seriesName: r.seriesName,
        barIndex: bar.barIndex,
        timestamp: bar.timestamp,
        delta: bar.delta,
      })),
    )
    .sort((a, b) => a.barIndex - b.barIndex)
    .slice(0, 20);

  if (allMismatches.length === 0) {
    return (
      <section className="surface dock-card">
        <div className="dock-header">
          <h3>Mismatch report</h3>
          <span className="pill" style={{ color: "var(--success)" }}>0 mismatches</span>
        </div>
        <p className="muted-copy">All bars within tolerance. Perfect alignment.</p>
      </section>
    );
  }

  return (
    <section className="surface dock-card">
      <div className="dock-header">
        <h3>Mismatch report</h3>
        <span className="pill" style={{ color: "var(--danger)" }}>
          {seriesResults.reduce((sum, r) => sum + r.mismatches.length, 0)} mismatches
        </span>
      </div>
      <div className="diff-list">
        {allMismatches.map((m, i) => (
          <button
            type="button"
            key={`${m.seriesName}-${m.barIndex}-${i}`}
            className="diff-item mismatch-item"
            onClick={() => onClickMismatch(m.seriesName, m.barIndex)}
            style={{ cursor: "pointer", width: "100%", textAlign: "left", border: "1px solid var(--border)", background: "rgba(255, 107, 107, 0.05)" }}
          >
            <div>
              <strong>{m.seriesName}</strong>
              <p>Bar #{m.barIndex} &middot; {formatTimestamp(m.timestamp)}</p>
            </div>
            <div className="diff-meta">
              <span style={{ color: "var(--danger)" }}>{m.delta !== null ? `\u0394 ${m.delta.toFixed(6)}` : "missing"}</span>
            </div>
          </button>
        ))}
      </div>
      {seriesResults.reduce((s, r) => s + r.mismatches.length, 0) > 20 && (
        <p className="hint">Showing first 20 mismatches. Export full report for all details.</p>
      )}
    </section>
  );
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return ts;
  }
}
