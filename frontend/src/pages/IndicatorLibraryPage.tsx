import type { IndicatorCategory, IndicatorLibraryEntry } from "@shared/contracts";
import { useCallback, useMemo, useState } from "react";

type IndicatorLibraryPageProps = {
  indicators: IndicatorLibraryEntry[];
  onLoadToWorkspace: (entry: IndicatorLibraryEntry) => void;
  onDelete: (indicatorId: string) => void;
  onRefresh: () => void;
};

const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  trend: "Trend",
  momentum: "Momentum",
  volatility: "Volatility",
  volume: "Volume",
  custom: "Custom",
};

const CATEGORY_COLORS: Record<string, string> = {
  trend: "var(--pine)",
  momentum: "#a78bfa",
  volatility: "#f4b942",
  volume: "#20c997",
  custom: "var(--muted)",
};

export function IndicatorLibraryPage({
  indicators,
  onLoadToWorkspace,
  onDelete,
  onRefresh,
}: IndicatorLibraryPageProps) {
  const [filter, setFilter] = useState<IndicatorCategory | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = indicators;
    if (filter !== "all") {
      list = list.filter((i) => i.category === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.series_names.some((s) => s.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [indicators, filter, search]);

  const handleLoad = useCallback(
    (entry: IndicatorLibraryEntry) => {
      onLoadToWorkspace(entry);
    },
    [onLoadToWorkspace],
  );

  const categories = ["all", "trend", "momentum", "volatility", "volume", "custom"] as const;

  return (
    <div className="alignment-page" style={{ gap: "1rem", padding: "1rem" }}>
      {/* ─── Header ─── */}
      <div className="surface toolbar-card" style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <span className="eyebrow">Library</span>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Indicator Library</h2>
        </div>
        <input
          type="text"
          placeholder="Search indicators..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "0.4rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "inherit",
            fontSize: "0.85rem",
            width: "220px",
          }}
        />
        <button className="action-button secondary" type="button" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      {/* ─── Category filter pills ─── */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            className="pill"
            onClick={() => setFilter(cat)}
            style={{
              cursor: "pointer",
              padding: "0.3rem 0.75rem",
              fontSize: "0.78rem",
              fontWeight: filter === cat ? 700 : 500,
              background: filter === cat ? "var(--pine)" : "var(--surface)",
              color: filter === cat ? "#fff" : "inherit",
              border: filter === cat ? "none" : "1px solid var(--border)",
              borderRadius: "1rem",
            }}
          >
            {CATEGORY_LABELS[cat]} ({cat === "all" ? indicators.length : indicators.filter((i) => i.category === cat).length})
          </button>
        ))}
      </div>

      {/* ─── Indicator cards grid ─── */}
      {filtered.length === 0 ? (
        <div className="empty-state surface workspace-card" style={{ textAlign: "center", padding: "3rem" }}>
          <p className="muted-copy">No indicators found.</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: "0.75rem",
          }}
        >
          {filtered.map((entry) => (
            <IndicatorCard
              key={entry.indicator_id}
              entry={entry}
              onLoad={handleLoad}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Indicator Card ──────────────────────────────────────

function IndicatorCard({
  entry,
  onLoad,
  onDelete,
}: {
  entry: IndicatorLibraryEntry;
  onLoad: (entry: IndicatorLibraryEntry) => void;
  onDelete: (id: string) => void;
}) {
  const catColor = CATEGORY_COLORS[entry.category] ?? "var(--muted)";

  return (
    <div className="surface workspace-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <h3 style={{ margin: 0, fontSize: "0.95rem", flex: 1 }}>{entry.name}</h3>
        <span
          className="pill"
          style={{
            fontSize: "0.68rem",
            padding: "2px 8px",
            color: catColor,
            border: `1px solid ${catColor}`,
            borderRadius: "1rem",
          }}
        >
          {entry.category}
        </span>
        {entry.is_builtin ? (
          <span
            className="pill"
            style={{
              fontSize: "0.65rem",
              padding: "2px 6px",
              color: "var(--success, #20c997)",
              border: "1px solid var(--success, #20c997)",
              borderRadius: "1rem",
            }}
          >
            Built-in
          </span>
        ) : (
          <span
            className="pill"
            style={{
              fontSize: "0.65rem",
              padding: "2px 6px",
              color: "var(--pine)",
              border: "1px solid var(--pine)",
              borderRadius: "1rem",
            }}
          >
            Custom
          </span>
        )}
      </div>

      {/* Description */}
      <p className="muted-copy" style={{ margin: 0, fontSize: "0.8rem", lineHeight: 1.4 }}>
        {entry.description || "No description"}
      </p>

      {/* Series names */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
        {entry.series_names.map((s) => (
          <code
            key={s}
            style={{
              fontSize: "0.7rem",
              padding: "1px 6px",
              background: "rgba(255,255,255,0.05)",
              borderRadius: "4px",
              border: "1px solid var(--border)",
            }}
          >
            {s}
          </code>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "auto", paddingTop: "0.3rem" }}>
        <button className="action-button" type="button" onClick={() => onLoad(entry)} style={{ flex: 1 }}>
          Load to Workspace
        </button>
        {!entry.is_builtin && (
          <button
            className="action-button secondary"
            type="button"
            onClick={() => onDelete(entry.indicator_id)}
            style={{ color: "var(--danger, #ff6b6b)" }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
