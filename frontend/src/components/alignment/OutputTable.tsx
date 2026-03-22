import { useState } from "react";
import type { CandlePoint, IndicatorSeries } from "@shared/contracts";
import type { BarComparison, SeriesAlignmentResult } from "@/lib/alignment";

type OutputTableProps = {
  title: string;
  tone: "pine" | "python";
  candles: CandlePoint[];
  indicators: IndicatorSeries[];
  /** Matched comparison results keyed by series name, for showing error column */
  comparisonMap: Map<string, SeriesAlignmentResult>;
  /** File label shown in the header (e.g. "stats_data_pine.csv") */
  fileLabel?: string;
};

const PAGE_SIZE = 8;

export function OutputTable({
  title,
  tone,
  candles,
  indicators,
  comparisonMap,
  fileLabel,
}: OutputTableProps) {
  const totalRows = candles.length;
  const [page, setPage] = useState(Math.max(0, Math.ceil(totalRows / PAGE_SIZE) - 1)); // start at last page

  const startIdx = page * PAGE_SIZE;
  const endIdx = Math.min(startIdx + PAGE_SIZE, totalRows);
  const pageCandles = candles.slice(startIdx, endIdx);
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);

  // Determine indicator columns
  const indicatorNames = indicators.map((s) => s.name);

  // For error column: check if this bar has a mismatch in any comparison
  const getBarError = (barIndex: number): { hasError: boolean; delta: number | null } => {
    for (const [, result] of comparisonMap) {
      const bar: BarComparison | undefined = result.bars[barIndex];
      if (bar && !bar.withinTolerance) {
        return { hasError: true, delta: bar.delta };
      }
    }
    return { hasError: false, delta: null };
  };

  const showOhlc = tone === "pine"; // Pine table shows full OHLCV, Python table shows condensed

  const firstTimestamp = pageCandles[0]
    ? formatDate(pageCandles[0].timestamp)
    : "";

  return (
    <div className="surface workspace-card output-table-card">
      {/* Header */}
      <div className="output-table-header">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          {fileLabel && (
            <span className="pill" style={{ fontSize: "0.72rem", padding: "4px 10px" }}>
              {fileLabel}
            </span>
          )}
        </div>
      </div>

      {/* Sub-header */}
      <p className="eyebrow" style={{ margin: "8px 0 4px" }}>Indicator Comparison Data</p>

      {totalRows === 0 ? (
        <p className="muted-copy">No candle data available.</p>
      ) : (
        <>
          {/* Table */}
          <div className="output-table-wrapper">
            <table className="alignment-table output-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  {showOhlc && <th>Open</th>}
                  {showOhlc && <th>High</th>}
                  {showOhlc && <th>Low</th>}
                  {showOhlc && <th>Close</th>}
                  {indicatorNames.map((name) => (
                    <th key={name} style={{ color: tone === "pine" ? "var(--pine)" : "var(--python)" }}>
                      {name}
                    </th>
                  ))}
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {pageCandles.map((candle, pageIdx) => {
                  const barIndex = startIdx + pageIdx;
                  const error = getBarError(barIndex);

                  return (
                    <tr key={barIndex} className={error.hasError ? "bar-mismatch" : "bar-match"}>
                      <td className="cell-timestamp">{formatTimestamp(candle.timestamp)}</td>
                      {showOhlc && <td className="cell-value">{candle.open.toFixed(2)}</td>}
                      {showOhlc && <td className="cell-value">{candle.high.toFixed(3)}</td>}
                      {showOhlc && <td className="cell-value">{candle.low.toFixed(3)}</td>}
                      {showOhlc && <td className="cell-value">{candle.close.toFixed(3)}</td>}
                      {indicators.map((series) => {
                        const point = series.values[barIndex];
                        const value = point?.value ?? null;
                        return (
                          <td key={series.name} className="cell-value" style={error.hasError ? { color: "var(--danger)", fontWeight: 600 } : undefined}>
                            {value !== null ? value.toFixed(3) : "-"}
                          </td>
                        );
                      })}
                      <td>
                        {error.hasError ? (
                          <span className="error-badge error-badge--mismatch">
                            {error.delta !== null ? error.delta.toFixed(5) : "\u2717 Match"}
                          </span>
                        ) : (
                          <span className="error-badge error-badge--match">{"\u2713"} Match</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="output-table-pagination">
            <span className="muted-copy" style={{ fontSize: "0.75rem" }}>
              Last {endIdx - startIdx} of {totalRows.toLocaleString()} rows | Showing {endIdx - startIdx} rows from {firstTimestamp}
            </span>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button
                type="button"
                className="page-btn"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                &lsaquo;
              </button>
              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                className="page-btn"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                &rsaquo;
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function formatDate(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}
