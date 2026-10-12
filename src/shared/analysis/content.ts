// src/shared/analysis/content.ts
//
// Neume content (kind x source) and marks (liquescence, episema, letters, certainty).
import { categoryLabel } from "../annotation/default-vocabulary";
import type { ProjectBody } from "../project-schema";
import type { NeumeItem, NeumeVocabulary, SyllableAnnotation } from "../annotation/types";
import { effectiveNotes } from "../annotation/annotation";
import { kindMap } from "../annotation/vocabulary";
import type { AnalysisFilters, Cell, KindRow, MarkRow } from "./types";
import { selectCells } from "./cells";

const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);

export function neumeContent(
  p: ProjectBody<unknown>,
  f: AnalysisFilters,
  v: NeumeVocabulary,
): { rows: KindRow[]; meanNotes: Record<string, number | null> } {
  const { sources, cells } = selectCells(p, f);
  const kinds = kindMap(v);
  const annotated = cells.filter((c) => c.annotation);

  // kindId -> sourceId -> number of neumes of that (real) kind
  const counts = new Map<string, Map<string, number>>();
  // kindId -> sourceId -> number of annotated syllables containing that kind (for percent)
  const syllables = new Map<string, Map<string, number>>();
  const bump = (m: Map<string, Map<string, number>>, kindId: string, sourceId: string) => {
    const bySource = m.get(kindId) ?? new Map<string, number>();
    bySource.set(sourceId, (bySource.get(sourceId) ?? 0) + 1);
    m.set(kindId, bySource);
  };
  for (const c of annotated) {
    const neumes = c.annotation!.neumes;
    for (const n of neumes) bump(counts, n.kind, c.sourceId);
    for (const kindId of new Set(neumes.map((n) => n.kind))) bump(syllables, kindId, c.sourceId);
  }

  const annotatedBySource = new Map(sources.map((s) => [s.id, annotated.filter((c) => c.sourceId === s.id).length]));
  const known = v.kinds.map((k) => k.id).filter((id) => counts.has(id));
  const unknown = [...counts.keys()].filter((id) => !kinds.has(id)).sort();

  const rows: KindRow[] = [...known, ...unknown].map((kindId) => {
    const kind = kinds.get(kindId);
    const bySourceCounts = counts.get(kindId)!;
    const bySourceSyllables = syllables.get(kindId)!;
    const bySource: KindRow["bySource"] = {};
    let total = 0;
    for (const s of sources) {
      const count = bySourceCounts.get(s.id) ?? 0;
      total += count;
      bySource[s.id] = { count, percent: ratio(bySourceSyllables.get(s.id) ?? 0, annotatedBySource.get(s.id)!) };
    }
    const equivalent = kind?.equivalentTo ? kinds.get(kind.equivalentTo) : undefined;
    return {
      kindId,
      name: kind?.name ?? kindId,
      categoryId: kind?.categoryId ?? null,
      ...(equivalent ? { equivalentName: equivalent.name } : {}),
      ...(kind ? {} : { unknown: true }),
      bySource,
      total,
    };
  });

  const meanNotes: Record<string, number | null> = {};
  for (const s of sources) {
    const notes = annotated
      .filter((c) => c.sourceId === s.id)
      .map((c) => effectiveNotes(c.annotation, v))
      .filter((n): n is number => n !== undefined);
    meanNotes[s.id] = notes.length === 0 ? null : notes.reduce((a, b) => a + b, 0) / notes.length;
  }
  return { rows, meanNotes };
}

export type ContentGroup =
  | { type: "category"; id: string; name: string; rows: KindRow[] }
  | { type: "noCategory"; rows: KindRow[] }
  | { type: "unknown"; rows: KindRow[] };

/**
 * Content rows grouped for display: categories in vocabulary order, then known kinds without a
 * category (or whose category no longer exists), then kinds missing from the vocabulary.
 * Empty groups are left out.
 */
export function groupContentRows(rows: KindRow[], v: NeumeVocabulary, t: (key: string) => string): ContentGroup[] {
  const ids = new Set(v.categories.map((c) => c.id));
  const groups: ContentGroup[] = [
    ...v.categories.map((c) => ({
      type: "category" as const, id: c.id, name: categoryLabel(c, t),
      rows: rows.filter((r) => !r.unknown && r.categoryId === c.id),
    })),
    { type: "noCategory", rows: rows.filter((r) => !r.unknown && !ids.has(r.categoryId ?? "")) },
    { type: "unknown", rows: rows.filter((r) => r.unknown) },
  ];
  return groups.filter((g) => g.rows.length > 0);
}

export const LIQ_KEYS = ["liq.augmentative", "liq.diminutive", "liq.none", "liq.unset"] as const;
export const EPISEMA_KEYS = ["episema.yes", "episema.no", "episema.unset"] as const;
/** Count of lengthened notes (not neumes); only informed positions count. */
export const LENGTHENED_KEY = "lengthened";
export const CERTAINTY_KEYS = ["certainty.secure", "certainty.probable", "certainty.illegible", "certainty.unset"] as const;

/** Mark keys of one neume: liquescence, episema and one per letter. */
export function neumeMarkKeys(n: NeumeItem): string[] {
  return [
    `liq.${n.liquescence ?? "unset"}`,
    `episema.${n.episema === undefined ? "unset" : n.episema ? "yes" : "no"}`,
    ...[...new Set(n.letters ?? [])].map(letterKey),
  ];
}

/** Mark key of a letter: its id (default ids already start with "letter."). */
export function letterKey(id: string): string {
  return id.startsWith("letter.") ? id : `letter.${id}`;
}

export function certaintyKey(a: SyllableAnnotation): string {
  return `certainty.${a.certainty ?? "unset"}`;
}

/** Whether an annotated cell matches a mark key (per neume, or per syllable for certainty). */
export function cellHasMark(c: Cell, key: string): boolean {
  if (!c.annotation) return false;
  if (key.startsWith("certainty.")) return certaintyKey(c.annotation) === key;
  if (key === LENGTHENED_KEY) return c.annotation.neumes.some((n) => (n.lengthened?.length ?? 0) > 0);
  return c.annotation.neumes.some((n) => neumeMarkKeys(n).includes(key));
}

export function marks(p: ProjectBody<unknown>, f: AnalysisFilters, v: NeumeVocabulary): MarkRow[] {
  const { sources, cells } = selectCells(p, f);
  const counts = new Map<string, Map<string, number>>();
  const bump = (key: string, sourceId: string, by = 1) => {
    const m = counts.get(key) ?? new Map<string, number>();
    m.set(sourceId, (m.get(sourceId) ?? 0) + by);
    counts.set(key, m);
  };
  for (const c of cells) {
    if (!c.annotation) continue;
    for (const n of c.annotation.neumes) {
      for (const key of neumeMarkKeys(n)) bump(key, c.sourceId);
      bump(LENGTHENED_KEY, c.sourceId, n.lengthened?.length ?? 0);
    }
    bump(certaintyKey(c.annotation), c.sourceId);
  }

  const usedLetters = [...counts.keys()].filter((k) => k.startsWith("letter."));
  const letterOrder = v.letters.map((l) => letterKey(l.id));
  const letterKeys = [
    ...letterOrder.filter((k) => usedLetters.includes(k)),
    ...usedLetters.filter((k) => !letterOrder.includes(k)).sort(),
  ];

  return [...LIQ_KEYS, ...EPISEMA_KEYS, LENGTHENED_KEY, ...letterKeys, ...CERTAINTY_KEYS].map((key) => ({
    key,
    bySource: Object.fromEntries(sources.map((s) => [s.id, counts.get(key)?.get(s.id) ?? 0])),
  }));
}
