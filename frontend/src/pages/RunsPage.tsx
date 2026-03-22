import type { RunStatus } from "@shared/contracts";

type RunsPageProps = {
  runs: RunStatus[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
};

export function RunsPage({ runs, selectedRunId, onSelectRun }: RunsPageProps) {
  return (
    <section className="surface page-card">
      <div className="section-head">
        <div>
          <p className="eyebrow">Run history</p>
          <h2>Replay and live sessions</h2>
        </div>
      </div>
      <div className="stack-list">
        {runs.map((run) => (
          <article className={`list-card ${run.run_id === selectedRunId ? "selected" : ""}`} key={run.run_id}>
            <div>
              <strong>{run.symbol} ? {run.mode}</strong>
              <p>{run.dataset_name ?? "No dataset"} ? {run.lifecycle} ? {run.live_progress}/{run.live_total}</p>
              <p>{run.comparison?.first_mismatch?.message ?? "No mismatch recorded"}</p>
            </div>
            <button className="action-button secondary" type="button" onClick={() => onSelectRun(run.run_id)}>Open</button>
          </article>
        ))}
        {runs.length === 0 ? <p className="muted-copy">No runs yet. Save a dataset and launch a replay run from Workspace.</p> : null}
      </div>
    </section>
  );
}
