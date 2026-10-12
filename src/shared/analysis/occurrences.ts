// src/shared/analysis/occurrences.ts
//
// Drill-down: the (source, syllable) cells behind a number in the analysis view.
import type { ProjectBody } from "../project-schema";
import type { NeumeVocabulary } from "../annotation/types";
import type { AnalysisFilters, Cell, Occurrence, OccurrenceQuery } from "./types";
import { NO_SECTION, annotationTags, selectCells } from "./cells";
import { cellHasStatus } from "./progress";
import { cellHasMark } from "./content";
import { comparePair, readings } from "./concordance";

const of = (c: Cell): Occurrence => ({ sourceId: c.sourceId, syllable: c.syllable });

/** Results are source-major (source order), syllables ascending. */
export function occurrences(
  p: ProjectBody<unknown>,
  f: AnalysisFilters,
  v: NeumeVocabulary,
  q: OccurrenceQuery,
): Occurrence[] {
  if (q.kind === "pair") {
    const { bySource } = readings(p, f, v);
    const a = bySource.get(q.a);
    const b = bySource.get(q.b);
    if (!a || !b || q.a === q.b) return [];
    const r = comparePair(a, b);
    const syllables = q.agree ? r.agree : r.disagree;
    return [q.a, q.b].flatMap((sourceId) => syllables.map((syllable) => ({ sourceId, syllable })));
  }

  const { cells } = selectCells(p, f);
  const inSource = (c: Cell, sourceId?: string) => sourceId === undefined || c.sourceId === sourceId;
  let match: (c: Cell) => boolean;
  switch (q.kind) {
    case "progress":
      match = (c) => inSource(c, q.sourceId)
        && (q.sectionId === undefined || (c.sectionId ?? NO_SECTION) === q.sectionId)
        && cellHasStatus(c, q.status);
      break;
    case "neume":
      match = (c) => inSource(c, q.sourceId) && (c.annotation?.neumes.some((n) => n.kind === q.kindId) ?? false);
      break;
    case "mark":
      match = (c) => inSource(c, q.sourceId) && cellHasMark(c, q.key);
      break;
    case "syllable":
      match = (c) => c.syllable === q.syllable && (c.annotation?.neumes.length ?? 0) > 0;
      break;
    case "tag":
      match = (c) => inSource(c, q.sourceId) && c.annotation !== undefined && annotationTags(c.annotation).has(q.tagId);
      break;
  }
  return cells.filter(match).map(of);
}
