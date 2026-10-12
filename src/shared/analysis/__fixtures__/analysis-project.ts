// Synthetic project for the analysis tests: 6 syllables, 4 sources, default vocabulary.
//
// Syllables: 0 Ad | 1 te | 2 le 3 va 4 vi | 5 a
// Sections:  s1 = words 0..1 (syllables 0, 1); s2 = word 2 (syllables 2..4); syllable 5 has no section.
// Sources:   E, SG (São Galo), L (Laon), X (no family).
import type { ProjectBody, SourceOf, SyllableBox } from "../../project-schema";
import type { Annotations } from "../../annotation/types";
import { SUGGESTED_CLASSIFICATION, cloneClassification } from "../../classification";
import { createDefaultVocabulary } from "../../annotation/default-vocabulary";

export const vocabulary = createDefaultVocabulary((k) => k);

export const TAG_RASPAGEM = "tag.raspagem";
/** Referenced by an annotation but missing from project.tags. */
export const TAG_GHOST = "tag.apagada";

const CUT = { cut: true };
const BOX: SyllableBox = { x: 0, y: 0, w: 10, h: 10 };
const cuts = (n: number): Record<number, unknown> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [i, CUT]));

function source(
  id: string,
  order: number,
  family: string | null,
  extra: Partial<SourceOf<unknown>>,
): SourceOf<unknown> {
  return {
    id,
    order,
    metadata: {
      siglum: id, library: "", city: "", century: "",
      classes: ["tipo.adiastematica", null, family],
    },
    lines: [],
    syllableCuts: {},
    ...extra,
  };
}

const annE: Annotations = {
  0: { neumes: [{ kind: "virga" }], tags: [] },
  1: { neumes: [{ kind: "tractulus" }], tags: [] },
  2: { neumes: [{ kind: "clivis" }], certainty: "illegible", tags: [] },
  3: {
    neumes: [{ kind: "pes", liquescence: "augmentative", episema: true, letters: ["letter.c"] }],
    tags: [TAG_RASPAGEM],
  },
  4: { neumes: [{ kind: "sumido" }], tags: [] },
};
const annSG: Annotations = {
  0: { neumes: [{ kind: "virga" }], tags: [] },
  1: { neumes: [{ kind: "tractulus" }], tags: [] },
  2: { neumes: [{ kind: "pes" }], tags: [] },
  3: { neumes: [], tags: [TAG_RASPAGEM] },
};
const annL: Annotations = {
  0: { neumes: [{ kind: "virga" }], tags: [] },
  1: { neumes: [{ kind: "uncinus" }], tags: [] },
  2: { neumes: [{ kind: "clivis" }, { kind: "virga" }], tags: [] },
};
const annX: Annotations = {
  0: { neumes: [{ kind: "pes", tags: [TAG_GHOST] }], tags: [] },
};

export function makeAnalysisProject(): ProjectBody<unknown> {
  return {
    meta: { title: "Analysis", author: "", createdAt: "", updatedAt: "" },
    text: {
      raw: "Ad te levavi a",
      words: [
        { original: "Ad", syllables: ["Ad"] },
        { original: "te", syllables: ["te"] },
        { original: "levavi", syllables: ["le", "va", "vi"] },
        { original: "a", syllables: ["a"] },
      ],
      hyphenationMode: "sung",
    },
    sections: [
      { id: "s1", name: "Primeira", wordRange: [0, 1] },
      { id: "s2", name: "Segunda", wordRange: [2, 2] },
    ],
    classification: cloneClassification(SUGGESTED_CLASSIFICATION),
    sources: [
      // E has cuts in syllableCuts; SG only has boxes on a line (both count as "with box").
      source("E", 0, "familia.sao-galo", { syllableCuts: cuts(6), annotations: annE }),
      source("SG", 1, "familia.sao-galo", {
        lines: [{
          id: "sg-l1", image: {}, syllableRange: { start: 0, end: 5 }, dividers: [], gaps: [],
          syllableBoxes: { 0: BOX, 1: BOX, 2: BOX, 3: BOX, 4: BOX, 5: BOX },
          confirmed: true,
        }],
        annotations: annSG,
      }),
      source("L", 2, "familia.laon", { syllableCuts: { ...cuts(3), 3: null }, annotations: annL }),
      source("X", 3, null, { annotations: annX }),
    ],
    neumeVocabulary: vocabulary,
    tags: [{ id: TAG_RASPAGEM, name: "raspagem", group: "suporte" }],
  };
}
