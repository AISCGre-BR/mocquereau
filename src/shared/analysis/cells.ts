// src/shared/analysis/cells.ts
//
// Turns a project + filters into the (source, syllable) cells every indicator works on.
import type { ProjectBody, SourceOf } from "../project-schema";
import type { SyllableAnnotation } from "../annotation/types";
import type { AnalysisFilters, Cell } from "./types";

export const NO_SECTION = "none";
export const NO_FAMILY = "none";
export const FAMILY_LEVEL_ID = "nivel.familia";

const active = <T>(xs: T[] | undefined): xs is T[] => xs !== undefined && xs.length > 0;

/** Section id of a global syllable index (sections hold inclusive word ranges). */
export function sectionOfSyllable(
  words: { syllables: string[] }[],
  sections: { id: string; wordRange: [number, number] }[],
  idx: number,
): string | null {
  let start = 0;
  for (let w = 0; w < words.length; w++) {
    const end = start + words[w].syllables.length;
    if (idx >= start && idx < end) {
      return sections.find((s) => w >= s.wordRange[0] && w <= s.wordRange[1])?.id ?? null;
    }
    start = end;
  }
  return null;
}

export function syllableCount(words: { syllables: string[] }[]): number {
  return words.reduce((n, w) => n + w.syllables.length, 0);
}

/** Tags on the syllable or on any of its neumes. */
export function annotationTags(a: SyllableAnnotation): Set<string> {
  const out = new Set(a.tags);
  for (const n of a.neumes) for (const t of n.tags ?? []) out.add(t);
  return out;
}

export function familyOf(p: ProjectBody<unknown>, s: SourceOf<unknown>): string {
  const level = p.classification.findIndex((l) => l.id === FAMILY_LEVEL_ID);
  if (level < 0) return NO_FAMILY;
  return s.metadata.classes[level] ?? NO_FAMILY;
}

function hasBox(s: SourceOf<unknown>, i: number): boolean {
  if (s.syllableCuts[i] != null) return true;
  return s.lines.some((l) => l.syllableBoxes?.[i] != null);
}

/** Filtered sources (by `order`) and their cells, source-major, syllables ascending. */
export function selectCells(
  p: ProjectBody<unknown>,
  f: AnalysisFilters,
): { sources: SourceOf<unknown>[]; cells: Cell[] } {
  const sources = [...p.sources]
    .sort((a, b) => a.order - b.order)
    .filter((s) => !active(f.sourceIds) || f.sourceIds.includes(s.id))
    .filter((s) => !active(f.classValueIds) || s.metadata.classes.some((c) => c !== null && f.classValueIds!.includes(c)));

  const n = syllableCount(p.text.words);
  const sectionIds = Array.from({ length: n }, (_, i) => sectionOfSyllable(p.text.words, p.sections, i));

  const cells: Cell[] = [];
  for (const s of sources) {
    for (let i = 0; i < n; i++) {
      const sectionId = sectionIds[i];
      if (active(f.sectionIds) && !f.sectionIds.includes(sectionId ?? NO_SECTION)) continue;
      const annotation = s.annotations?.[i];
      if (active(f.tagIds)) {
        if (!annotation) continue;
        const tags = annotationTags(annotation);
        if (!f.tagIds.some((t) => tags.has(t))) continue;
      }
      if (active(f.certainty) && !f.certainty.includes(annotation?.certainty ?? "unset")) continue;
      cells.push({
        sourceId: s.id,
        syllable: i,
        sectionId,
        hasBox: hasBox(s, i),
        ...(annotation ? { annotation } : {}),
      });
    }
  }
  return { sources, cells };
}
