// src/shared/annotation/vocabulary.ts
import type { NeumeCategory, NeumeKind, NeumeVocabulary } from "./types";
import { createDefaultVocabulary } from "./default-vocabulary";

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

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

export function filterKinds(
  v: NeumeVocabulary,
  query: string,
): Array<{ category: NeumeCategory; kinds: NeumeKind[] }> {
  const q = fold(query.trim());
  const match = (k: NeumeKind) => q === "" || fold(k.name).split(/\s+/).some((w) => w.startsWith(q));
  return v.categories
    .filter((c) => !c.hidden)
    .map((category) => ({
      category,
      kinds: v.kinds.filter((k) => k.categoryId === category.id && !k.hidden && match(k)),
    }))
    .filter((g) => g.kinds.length > 0);
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
