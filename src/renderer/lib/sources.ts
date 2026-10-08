// src/renderer/lib/sources.ts
//
// Source/page helpers shared by the views that add pages.

import type { GuerangerManuscript, ManuscriptSource, MocquereauProject } from "./models";
import { hasAnyBox } from "@shared/box-frame";
import { emptyClasses, type Classification } from "@shared/classification";

export function createEmptySource(): ManuscriptSource {
  return {
    id: crypto.randomUUID(),
    order: 0,
    metadata: { siglum: "", library: "", city: "", century: "", classes: emptyClasses() },
    lines: [],
    syllableCuts: {},
  };
}

export function guerangerToSource(gm: GuerangerManuscript, order: number): ManuscriptSource {
  return {
    id: crypto.randomUUID(),
    order,
    metadata: {
      siglum: gm.siglum || "",
      library: gm.library || "",
      city: gm.city || "",
      century: gm.century || "",
      classes: emptyClasses(),
      folioHint: gm.folio || undefined,
      cantusId: gm.cantusId || undefined,
      sourceUrl: gm.sourceUrl || undefined,
      iiifManifest: gm.iiifManifest || undefined,
    },
    lines: [],
    syllableCuts: {},
  };
}

export interface SourceGroup {
  /** Level-1 class value; null for the sources without one (last, no header). */
  value: { id: string; name: string } | null;
  sources: ManuscriptSource[];
}

/**
 * Sources grouped by their level-1 class, in the order of the values in the
 * classification; sources without a known value come last. Within a group,
 * the project order.
 */
export function groupSourcesByLevel1(sources: ManuscriptSource[], classification: Classification): SourceGroup[] {
  const ordered = [...sources].sort((a, b) => a.order - b.order);
  const groups: SourceGroup[] = classification[0].values
    .map((v) => ({ value: { id: v.id, name: v.name }, sources: ordered.filter((s) => s.metadata.classes[0] === v.id) }))
    .filter((g) => g.sources.length > 0);
  const known = new Set(classification[0].values.map((v) => v.id));
  const rest = ordered.filter((s) => !s.metadata.classes[0] || !known.has(s.metadata.classes[0]));
  if (rest.length > 0) groups.push({ value: null, sources: rest });
  return groups;
}

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
