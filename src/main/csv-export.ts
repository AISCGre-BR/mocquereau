// src/main/csv-export.ts
//
// Writes the two CSV files (raw neumes and totals) side by side. The renderer builds the
// CSV text; the main process only owns the save dialog and the atomic writes.
import { dialog, ipcMain } from "electron";
import { t } from "./i18n";
import { writeFileAtomic } from "./atomic-write";
import type { CsvExportPayload } from "../shared/analysis/csv";

export function csvTargets(
  chosenPath: string,
  rawSuffix: string,
  totalsSuffix: string,
): { raw: string; totals: string } {
  const base = chosenPath.replace(/\.csv$/i, "");
  return { raw: `${base}-${rawSuffix}.csv`, totals: `${base}-${totalsSuffix}.csv` };
}

export function registerCsvExportHandler(): void {
  ipcMain.handle("export:csv", async (_event, payload: CsvExportPayload) => {
    try {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: t("main.dialog.exportCsv"),
        defaultPath: `${payload.title || "indicadores"}.csv`,
        filters: [{ name: t("main.filter.csv"), extensions: ["csv"] }],
      });
      if (canceled || !filePath) return null;
      const targets = csvTargets(filePath, t("main.csv.rawSuffix"), t("main.csv.totalsSuffix"));
      await writeFileAtomic(targets.raw, payload.raw);
      await writeFileAtomic(targets.totals, payload.totals);
      return { files: [targets.raw, targets.totals] };
    } catch (err) {
      console.log("[csv-export] ERROR:", err);
      return null;
    }
  });
}
