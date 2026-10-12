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

/**
 * Asks for the path and writes both files. Cancel returns null; a write error rejects, so
 * the renderer shows the error toast instead of treating it as a cancel.
 */
export async function saveCsvFiles(
  payload: CsvExportPayload,
  choosePath: () => Promise<string | null>,
  write: (path: string, data: string) => Promise<void>,
): Promise<{ files: string[] } | null> {
  const filePath = await choosePath();
  if (!filePath) return null;
  const targets = csvTargets(filePath, t("main.csv.rawSuffix"), t("main.csv.totalsSuffix"));
  await write(targets.raw, payload.raw);
  await write(targets.totals, payload.totals);
  return { files: [targets.raw, targets.totals] };
}

export function registerCsvExportHandler(): void {
  ipcMain.handle("export:csv", async (_event, payload: CsvExportPayload) => {
    const choosePath = async () => {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: t("main.dialog.exportCsv"),
        defaultPath: `${payload.title || "indicadores"}.csv`,
        filters: [{ name: t("main.filter.csv"), extensions: ["csv"] }],
      });
      return canceled || !filePath ? null : filePath;
    };
    try {
      return await saveCsvFiles(payload, choosePath, (path, data) => writeFileAtomic(path, data));
    } catch (err) {
      console.log("[csv-export] ERROR:", err);
      throw err;
    }
  });
}
