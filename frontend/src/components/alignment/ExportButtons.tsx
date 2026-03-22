import type { AlignmentReport } from "@/lib/alignment";
import { downloadBlob, exportAlignmentCSV, exportAlignmentJSON } from "@/lib/alignment";

type ExportButtonsProps = {
  report: AlignmentReport;
};

export function ExportButtons({ report }: ExportButtonsProps) {
  const handleCSV = () => {
    const csv = exportAlignmentCSV(report.seriesResults);
    downloadBlob(csv, `alignment-${Date.now()}.csv`, "text/csv");
  };

  const handleJSON = () => {
    const json = exportAlignmentJSON(report);
    downloadBlob(json, `alignment-${Date.now()}.json`, "application/json");
  };

  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      <button className="action-button secondary" type="button" onClick={handleCSV}>
        Export CSV
      </button>
      <button className="action-button secondary" type="button" onClick={handleJSON}>
        Export JSON
      </button>
    </div>
  );
}
