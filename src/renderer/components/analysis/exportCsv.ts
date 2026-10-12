// src/renderer/components/analysis/exportCsv.ts
//
// Builds the two CSV texts (raw neumes + totals) for the given filters and asks the main
// process to save them. Called by the Arquivo menu and the Análise toolbar: in the Análise
// view with its active filters (D9), elsewhere with none.
import type { AnalysisFilters } from "@shared/analysis";
import { rawRows, toCsv, totalsRows } from "@shared/analysis/csv";
import { getVocabulary } from "@shared/annotation/vocabulary";
import type { MocquereauProject } from "../../lib/models";

export function exportAnalysisCsv(
  project: MocquereauProject,
  filters: AnalysisFilters,
  t: (key: string, opts?: object) => string,
): Promise<{ files: string[] } | null> {
  const vocabulary = getVocabulary(project, t);
  return window.mocquereau.exportCsv({
    title: project.meta.title,
    raw: toCsv(rawRows(project, filters, vocabulary)),
    totals: toCsv(totalsRows(project, filters, vocabulary, t)),
  });
}
