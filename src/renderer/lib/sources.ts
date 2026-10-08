// src/renderer/lib/sources.ts
//
// Source/page helpers shared by the views that add pages.

import type { ManuscriptSource, MocquereauProject } from "./models";
import { hasAnyBox } from "@shared/box-frame";

function syllableTotal(project: MocquereauProject): number {
  return project.text.words.reduce((n, w) => n + w.syllables.length, 0);
}

/**
 * Range for a page added to `source` (D-06): it starts after the last
 * confirmed page and runs to the end of the text.
 */
export function suggestRangeForNewPage(
  source: ManuscriptSource,
  totalSyllables: number,
): { start: number; end: number } {
  const last = Math.max(0, totalSyllables - 1);
  const lastConfirmed = [...source.lines].reverse().find((l) => l.confirmed);
  const start = Math.min(last, lastConfirmed ? lastConfirmed.syllableRange.end + 1 : 0);
  return { start, end: last };
}

/**
 * Load-time fix (silent): pages saved without a range ({0,0} and no box, as
 * the Fontes view used to add them) get the whole text, so {0,0} only means
 * "syllable 0" from now on. Returns the same project when nothing changes.
 */
export function resolveUnsetRanges(project: MocquereauProject): MocquereauProject {
  const total = syllableTotal(project);
  if (total <= 1) return project;
  let changed = false;
  const sources = project.sources.map((s) => {
    let sourceChanged = false;
    const lines = s.lines.map((l) => {
      const r = l.syllableRange;
      if (r.start !== 0 || r.end !== 0 || hasAnyBox(l.syllableBoxes)) return l;
      sourceChanged = true;
      return { ...l, syllableRange: { start: 0, end: total - 1 } };
    });
    if (!sourceChanged) return s;
    changed = true;
    return { ...s, lines };
  });
  return changed ? { ...project, sources } : project;
}
