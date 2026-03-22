import type { ComparisonResult, RunLifecycle } from "@shared/contracts";

type DiffPanelProps = {
  comparison: ComparisonResult | null;
  warnings: string[];
  lifecycle: RunLifecycle;
};

export function DiffPanel({ comparison, warnings, lifecycle }: DiffPanelProps) {
  return (
    <section className="surface dock-card">
      <div className="dock-header">
        <div>
          <p className="eyebrow">Comparison engine</p>
          <h3>Mismatch analysis</h3>
        </div>
        <span className="pill">{lifecycle}</span>
      </div>
      {!comparison ? <p className="muted-copy">Run replay or live mode to populate comparison output.</p> : null}
      {comparison ? (
        <>
          <div className="stats-row">
            <div className="stat-card"><span>Aligned</span><strong>{comparison.summary.aligned ? "Yes" : "No"}</strong></div>
            <div className="stat-card"><span>Series mismatch</span><strong>{comparison.summary.mismatched_series}</strong></div>
            <div className="stat-card"><span>Trade mismatch</span><strong>{comparison.summary.mismatched_trade_events}</strong></div>
          </div>
          <div className="diff-list">
            {comparison.series_mismatches.map((mismatch) => (
              <article className="diff-item" key={`${mismatch.series_name}-${mismatch.timestamp}`}>
                <div>
                  <strong>{mismatch.series_name}</strong>
                  <p>{mismatch.message}</p>
                </div>
                <div className="diff-meta">
                  <span>{mismatch.classification}</span>
                  <span>{mismatch.delta?.toFixed(4) ?? "n/a"}</span>
                </div>
              </article>
            ))}
          </div>
          <p className="hint">{comparison.suggested_next_action}</p>
        </>
      ) : null}
      {warnings.length > 0 ? <div className="banner subtle">{warnings.join(" ")}</div> : null}
    </section>
  );
}
