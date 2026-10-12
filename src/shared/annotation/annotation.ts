// src/shared/annotation/annotation.ts
import type { Annotations, NeumeItem, NeumeVocabulary, SyllableAnnotation } from "./types";

/** An annotation with nothing filled in carries no information and is not stored. */
export function isAnnotationEmpty(a: SyllableAnnotation): boolean {
  return a.neumes.length === 0 && a.notes === undefined && a.certainty === undefined
    && a.tags.length === 0 && (a.comment ?? "") === "";
}

export function emptyAnnotation(): SyllableAnnotation {
  return { neumes: [], tags: [] };
}

function normalizeItem(item: NeumeItem): NeumeItem {
  const { letters, tags, comment, ...rest } = item;
  return {
    ...rest,
    ...(letters && letters.length > 0 ? { letters } : {}),
    ...(tags && tags.length > 0 ? { tags } : {}),
    ...(comment ? { comment } : {}),
  };
}

/** Drops empty optional fields; returns null when nothing is left. */
export function normalizeAnnotation(a: SyllableAnnotation): SyllableAnnotation | null {
  const { comment, ...rest } = a;
  const out: SyllableAnnotation = {
    ...rest,
    neumes: a.neumes.map(normalizeItem),
    ...(comment ? { comment } : {}),
  };
  return isAnnotationEmpty(out) ? null : out;
}

/** Sum of per-item notes (or the kind default); undefined if any item is unknown. */
export function effectiveNotes(a: SyllableAnnotation | undefined, v: NeumeVocabulary): number | undefined {
  if (!a) return undefined;
  if (a.neumes.length === 0) return a.notes;
  const defaults = new Map(v.kinds.map((k) => [k.id, k.defaultNotes]));
  let total = 0;
  for (const item of a.neumes) {
    const n = item.notes ?? defaults.get(item.kind);
    if (n === undefined) return undefined;
    total += n;
  }
  return total;
}

export function withAnnotation<S extends { annotations?: Annotations }>(
  source: S,
  syllable: number,
  a: SyllableAnnotation | null,
): S {
  const { annotations, ...rest } = source;
  const map: Annotations = { ...(annotations ?? {}) };
  if (a === null) delete map[syllable];
  else map[syllable] = a;
  return (Object.keys(map).length === 0 ? rest : { ...rest, annotations: map }) as S;
}
