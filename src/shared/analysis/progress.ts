// src/shared/analysis/progress.ts
import type { ProjectBody } from "../project-schema";
import type { NeumeVocabulary } from "../annotation/types";
import type { AnalysisFilters, Cell, ProgressRow } from "./types";
import { NO_SECTION, selectCells } from "./cells";

export type ProgressStatus = "annotated" | "illegible" | "missing" | "withBox";

export function cellHasStatus(c: Cell, status: ProgressStatus): boolean {
  switch (status) {
    case "withBox": return c.hasBox;
    case "annotated": return c.annotation !== undefined;
    case "illegible": return c.annotation?.certainty === "illegible";
    case "missing": return c.hasBox && c.annotation === undefined;
  }
}

function row(key: string, label: string, cells: Cell[]): ProgressRow {
  const count = (s: ProgressStatus) => cells.filter((c) => cellHasStatus(c, s)).length;
  return {
    key, label, total: cells.length,
    withBox: count("withBox"), annotated: count("annotated"),
    illegible: count("illegible"), missing: count("missing"),
  };
}

export function progressBySource(p: ProjectBody<unknown>, f: AnalysisFilters, _v: NeumeVocabulary): ProgressRow[] {
  const { sources, cells } = selectCells(p, f);
  return sources.map((s) => row(s.id, s.metadata.siglum, cells.filter((c) => c.sourceId === s.id)));
}

/** One row per section with cells; syllables outside sections go to the "none" row (empty label). */
export function progressBySection(p: ProjectBody<unknown>, f: AnalysisFilters, _v: NeumeVocabulary): ProgressRow[] {
  const { cells } = selectCells(p, f);
  const rows = p.sections
    .map((s) => row(s.id, s.name, cells.filter((c) => c.sectionId === s.id)))
    .filter((r) => r.total > 0);
  const none = cells.filter((c) => c.sectionId === null);
  if (none.length > 0) rows.push(row(NO_SECTION, "", none));
  return rows;
}
