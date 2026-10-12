// src/shared/annotation/default-vocabulary.ts
//
// Default Mocquereau neume vocabulary. Latin names and the Latin meaning of the
// significant letters are vocabulary data (not i18n keys); only category names are translated.
import type { NeumeVocabulary, NeumeKind, SignificantLetter } from "./types";

export const DEFAULT_CATEGORY_KEYS: Record<string, string> = {
  "cat.simple": "annotation.category.simple",
  "cat.compound": "annotation.category.compound",
  "cat.liquescent": "annotation.category.liquescent",
  "cat.ornamental": "annotation.category.ornamental",
};

const K = (categoryId: string, name: string, defaultNotes: number, equivalentTo?: string): NeumeKind => ({
  id: name.replace(/\s+/g, "-"),
  categoryId,
  name,
  defaultNotes,
  ...(equivalentTo ? { equivalentTo } : {}),
});

export const DEFAULT_KINDS: NeumeKind[] = [
  K("cat.simple", "virga", 1), K("cat.simple", "tractulus", 1), K("cat.simple", "punctum", 1),
  K("cat.simple", "gravis", 1), K("cat.simple", "uncinus", 1, "tractulus"),
  K("cat.compound", "pes", 2), K("cat.compound", "clivis", 2), K("cat.compound", "torculus", 3),
  K("cat.compound", "porrectus", 3), K("cat.compound", "climacus", 3), K("cat.compound", "scandicus", 3),
  K("cat.compound", "porrectus flexus", 4), K("cat.compound", "torculus resupinus", 4),
  K("cat.compound", "pes subbipunctis", 4), K("cat.compound", "scandicus flexus", 4),
  K("cat.compound", "climacus resupinus", 4),
  K("cat.liquescent", "epiphonus", 2), K("cat.liquescent", "cephalicus", 2), K("cat.liquescent", "ancus", 3),
  K("cat.liquescent", "torculus liquescens", 3), K("cat.liquescent", "porrectus liquescens", 3),
  K("cat.ornamental", "pes quilismaticus", 3), K("cat.ornamental", "oriscus", 1), K("cat.ornamental", "salicus", 3),
  K("cat.ornamental", "pressus maior", 3), K("cat.ornamental", "pressus minor", 2), K("cat.ornamental", "virga strata", 2),
  K("cat.ornamental", "trigon", 3), K("cat.ornamental", "distropha", 2), K("cat.ornamental", "tristropha", 3),
  K("cat.ornamental", "bivirga", 2), K("cat.ornamental", "trivirga", 3),
];

export const DEFAULT_LETTERS: SignificantLetter[] = ([
  ["c", "celeriter"], ["t", "tenete"], ["a", "augete"], ["x", "expectate"], ["e", "equaliter"],
  ["s", "sursum"], ["m", "mediocriter"], ["l", "levate"], ["i", "iusum"], ["st", "statim"], ["nl", "non levare"],
] as const).map(([abbr, meaning]) => ({ id: `letter.${abbr}`, abbr, meaning }));

export function createDefaultVocabulary(t: (key: string) => string): NeumeVocabulary {
  return {
    categories: Object.entries(DEFAULT_CATEGORY_KEYS).map(([id, key]) => ({ id, name: t(key) })),
    kinds: DEFAULT_KINDS.map((k) => ({ ...k })),
    letters: DEFAULT_LETTERS.map((l) => ({ ...l })),
  };
}
