import { useCallback, useEffect, useRef } from "react";
import type { SeriesAlignmentResult } from "@/lib/alignment";

type AlignmentTableProps = {
  seriesResults: SeriesAlignmentResult[];
  selectedSeries: string | null;
  onSelectSeries: (name: string | null) => void;
  scrollToBarIndex: number | null;
  onScrollComplete: () => void;
};

export function AlignmentTable({
  seriesResults,
  selectedSeries,
  onSelectSeries,
  scrollToBarIndex,
  onScrollComplete,
}: AlignmentTableProps) {
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const activeResult = selectedSeries
    ? seriesResults.find((r) => r.seriesName === selectedSeries)
    : seriesResults[0];

  // Scroll-to-bar when MismatchReport requests it
  useEffect(() => {
    if (scrollToBarIndex === null || !activeResult) return;
    const key = `${activeResult.seriesName}-${scrollToBarIndex}`;
    const row = rowRefs.current.get(key);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.classList.add("bar-flash");
      const timer = setTimeout(() => row.classList.remove("bar-flash"), 1200);
      onScrollComplete();
      return () => clearTimeout(timer);
    }
    onScrollComplete();
  }, [scrollToBarIndex, activeResult, onScrollComplete]);

  const setRowRef = useCallback(
    (barIndex: number, seriesName: string) => (el: HTMLTableRowElement | null) => {
      const key = `${seriesName}-${barIndex}`;
      if (el) {
        rowRefs.current.set(key, el);
      } else {
        rowRefs.current.delete(key);
      }
    },
    [],
  );

  if (seriesResults.length === 0) {
    return <p className="muted-copy">No matched series to compare.</p>;
  }

  return (
    <div>
      {/* Series tabs */}
      <div className="series-tabs">
        {seriesResults.map((result) => (
          <button
            key={result.seriesName}
            type="button"
            className={`series-tab ${result.seriesName === (activeResult?.seriesName ?? "") ? "series-tab--active" : ""}`}
            onClick={() => onSelectSeries(result.seriesName)}
          >
            {result.seriesName}
            <span className="series-tab-badge" style={{ color: result.matchPercent >= 95 ? "var(--success)" : result.matchPercent >= 80 ? "var(--pine)" : "var(--danger)" }}>
              {result.matchPercent.toFixed(1)}%
            </span>
          </button>
        ))}
      </div>

      {/* Data table */}
      {activeResult && (
        <div className="alignment-table-wrapper">
          <table className="alignment-table">
            <thead>
              <tr>
                <th>Bar #</th>
                <th>Timestamp</th>
                <th style={{ color: "var(--pine)" }}>Pine value</th>
                <th style={{ color: "var(--python)" }}>Python value</th>
                <th>Delta</th>
                <th>% Diff</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {activeResult.bars.map((bar) => (
                <tr
                  key={bar.barIndex}
                  ref={setRowRef(bar.barIndex, activeResult.seriesName)}
                  className={bar.withinTolerance ? "bar-match" : "bar-mismatch"}
                >
                  <td>{bar.barIndex}</td>
                  <td className="cell-timestamp">{formatTimestamp(bar.timestamp)}</td>
                  <td className="cell-value">{bar.pineValue !== null ? bar.pineValue.toFixed(4) : "-"}</td>
                  <td className="cell-value">{bar.pythonValue !== null ? bar.pythonValue.toFixed(4) : "-"}</td>
                  <td className="cell-value">{bar.delta !== null ? formatDelta(bar.delta) : "-"}</td>
                  <td className="cell-value">{bar.percentDiff !== null && bar.percentDiff !== Infinity ? bar.percentDiff.toFixed(4) + "%" : "-"}</td>
                  <td>{bar.withinTolerance ? "\u2713" : "\u2717"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(6)}`;
}
