// src/shared/annotation/vocabulary.ts
import type { NeumeCategory, NeumeKind, NeumeVocabulary } from "./types";
import { createDefaultVocabulary } from "./default-vocabulary";

/**
 * Case- and accent-insensitive form used to compare vocabulary names. Only the combining
 * diacritics block (U+0300–U+036F) is stripped, then the rest is recomposed: kana voicing
 * marks stay, so ハ and バ remain distinct.
 */
export const fold = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC").toLowerCase();

export function kindMap(v: NeumeVocabulary): Map<string, NeumeKind> {
  return new Map(v.kinds.map((k) => [k.id, k]));
}

/** Root id of an equivalence chain. Unknown ids resolve to themselves; cycles are cut. */
export function resolveEquivalent(v: NeumeVocabulary, kindId: string): string {
  const map = kindMap(v);
  const seen = new Set<string>();
  let id = kindId;
  while (!seen.has(id)) {
    seen.add(id);
    const next = map.get(id)?.equivalentTo;
    if (!next || !map.has(next)) return id;
    id = next;
  }
  return id;
}

/**
 * Visible kinds matching the query, grouped by category in vocabulary order. Kinds without a
 * category (or whose category no longer exists) come last, in a group with `category: null`.
 */
export function filterKinds(
  v: NeumeVocabulary,
  query: string,
): Array<{ category: NeumeCategory | null; kinds: NeumeKind[] }> {
  const q = fold(query.trim());
  const match = (k: NeumeKind) => q === "" || fold(k.name).split(/\s+/).some((w) => w.startsWith(q));
  // Hidden kinds (or kinds of a hidden category) stay out of the list, but typing the exact
  // name still offers them: otherwise there is no match and no "Create" either.
  const exact = (k: NeumeKind) => q !== "" && fold(k.name.trim()) === q;
  const offered = (k: NeumeKind, category: NeumeCategory | null) =>
    (!category?.hidden && !k.hidden && match(k)) || exact(k);
  const categoryIds = new Set(v.categories.map((c) => c.id));
  return [
    ...v.categories.map((category) => ({
      category: category as NeumeCategory | null,
      kinds: v.kinds.filter((k) => k.categoryId === category.id && offered(k, category)),
    })),
    {
      category: null,
      kinds: v.kinds.filter((k) => !isCategorized(k, categoryIds) && offered(k, null)),
    },
  ].filter((g) => g.kinds.length > 0);
}

/** Whether the kind belongs to an existing category (`categoryIds` = ids of the vocabulary). */
export function isCategorized(k: NeumeKind, categoryIds: ReadonlySet<string>): boolean {
  return k.categoryId !== undefined && categoryIds.has(k.categoryId);
}

export function getVocabulary(
  p: { neumeVocabulary?: NeumeVocabulary },
  t: (k: string) => string,
): NeumeVocabulary {
  return p.neumeVocabulary ?? createDefaultVocabulary(t);
}

export function restoreDefaults(v: NeumeVocabulary, t: (k: string) => string): NeumeVocabulary {
  const d = createDefaultVocabulary(t);
  const has = <T extends { id: string }>(xs: T[], id: string) => xs.some((x) => x.id === id);
  return {
    categories: [...v.categories, ...d.categories.filter((c) => !has(v.categories, c.id))],
    kinds: [...v.kinds, ...d.kinds.filter((k) => !has(v.kinds, k.id))],
    letters: [...v.letters, ...d.letters.filter((l) => !has(v.letters, l.id))],
  };
}
