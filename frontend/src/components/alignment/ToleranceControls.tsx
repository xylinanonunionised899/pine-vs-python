import type { AlignmentToleranceConfig } from "@/lib/alignment";

type ToleranceControlsProps = {
  tolerance: AlignmentToleranceConfig;
  onChange: (tolerance: AlignmentToleranceConfig) => void;
};

export function ToleranceControls({ tolerance, onChange }: ToleranceControlsProps) {
  return (
    <div className="tolerance-row">
      <label className="field compact-field">
        <span>Absolute tolerance</span>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={tolerance.absTolerance}
            onChange={(e) => onChange({ ...tolerance, absTolerance: Number(e.target.value) })}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min={0}
            max={1}
            step={0.001}
            value={tolerance.absTolerance}
            onChange={(e) => onChange({ ...tolerance, absTolerance: Number(e.target.value) })}
            style={{ width: "5rem" }}
          />
        </div>
      </label>
      <label className="field compact-field">
        <span>Relative tolerance</span>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="range"
            min={0}
            max={0.1}
            step={0.0001}
            value={tolerance.relTolerance}
            onChange={(e) => onChange({ ...tolerance, relTolerance: Number(e.target.value) })}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min={0}
            max={0.1}
            step={0.0001}
            value={tolerance.relTolerance}
            onChange={(e) => onChange({ ...tolerance, relTolerance: Number(e.target.value) })}
            style={{ width: "5rem" }}
          />
        </div>
      </label>
    </div>
  );
}
