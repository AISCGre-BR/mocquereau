// src/shared/annotation/default-vocabulary.ts
//
// Default Mocquereau neume vocabulary. Latin names and the Latin meaning of the
// significant letters are vocabulary data (not i18n keys); default category names are translated at display time (categoryLabel).
import type { NeumeVocabulary, NeumeKind, SignificantLetter } from "./types";

/** Default category ids and their i18n keys (`cat.liquescent` is legacy: no longer created). */
export const DEFAULT_CATEGORY_KEYS: Record<string, string> = {
  "cat.simple": "annotation.category.simple",
  "cat.compound": "annotation.category.compound",
  "cat.ornamental": "annotation.category.ornamental",
  "cat.liquescent": "annotation.category.liquescent",
};
const CURRENT_CATEGORY_IDS = ["cat.simple", "cat.compound", "cat.ornamental"];

/**
 * Translations of the default category names in every locale (pt-BR, en, es, de, it, pl, ja).
 * Used at load time to recognise a name baked into a project by older versions. A test keeps
 * this in sync with the locale files.
 */
export const DEFAULT_CATEGORY_NAMES: Record<string, string[]> = {
  "cat.simple": ["Simples", "Simple", "Einfache", "Semplici", "Proste", "単純ネウマ"],
  "cat.compound": ["Compostos", "Compound", "Compuestos", "Zusammengesetzte", "Composti", "Złożone", "複合ネウマ"],
  "cat.ornamental": [
    "Ornamentais e repercussivos", "Ornamental and repercussive", "Ornamentales y repercusivos",
    "Ornamentale und repetierende", "Ornamentali e ripercussivi", "Ozdobne i repetycyjne", "装飾・反復ネウマ",
  ],
  "cat.liquescent": [
    "Liquescentes", "Liquescent", "Licuescentes", "Liqueszierende", "Liquescenti", "Likwescencyjne", "リクエッセンス・ネウマ",
  ],
};

/** Label of a category: its custom name, or the translation of a default one, or its id. */
export function categoryLabel(c: { id: string; name?: string }, t: (key: string) => string): string {
  if (c.name !== undefined) return c.name;
  const key = DEFAULT_CATEGORY_KEYS[c.id];
  return key ? t(key) : c.id;
}

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
  // Liquescent forms are compound neumes; liquescence itself is the neume's own field (none implied).
  K("cat.compound", "epiphonus", 2), K("cat.compound", "cephalicus", 2), K("cat.compound", "ancus", 3),
  K("cat.compound", "torculus liquescens", 3), K("cat.compound", "porrectus liquescens", 3),
  K("cat.ornamental", "pes quilismaticus", 3), K("cat.ornamental", "oriscus", 1), K("cat.ornamental", "salicus", 3),
  K("cat.ornamental", "pressus maior", 3), K("cat.ornamental", "pressus minor", 2), K("cat.ornamental", "virga strata", 2),
  K("cat.ornamental", "trigon", 3), K("cat.ornamental", "distropha", 2), K("cat.ornamental", "tristropha", 3),
  K("cat.ornamental", "bivirga", 2), K("cat.ornamental", "trivirga", 3),
];

export const DEFAULT_LETTERS: SignificantLetter[] = ([
  ["c", "celeriter"], ["t", "tenete"], ["a", "augete"], ["x", "expectate"], ["e", "equaliter"],
  ["s", "sursum"], ["m", "mediocriter"], ["l", "levate"], ["i", "iusum"], ["st", "statim"], ["nl", "non levare"],
] as const).map(([abbr, meaning]) => ({ id: `letter.${abbr}`, abbr, meaning }));

export function createDefaultVocabulary(_t?: (key: string) => string): NeumeVocabulary {
  return {
    categories: CURRENT_CATEGORY_IDS.map((id) => ({ id })),
    kinds: DEFAULT_KINDS.map((k) => ({ ...k })),
    letters: DEFAULT_LETTERS.map((l) => ({ ...l })),
  };
}
