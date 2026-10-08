// src/shared/classification.ts
//
// Three-level source classification (spec R4–R6). Pure: shared by main and
// renderer. Ids of the suggested list are fixed so projects made on
// different machines agree in the user library.
import type { ClassLevel, Classification, Notation, SourceClasses } from "./project-schema";

export type { ClassLevel, ClassValue, Classification, SourceClasses } from "./project-schema";

const level = (id: string, name: string, values: [string, string][]): ClassLevel => ({
  id, name, values: values.map(([vid, vname]) => ({ id: vid, name: vname })),
});

export const SUGGESTED_CLASSIFICATION: Classification = [
  level("nivel.tipo", "Tipo", [
    ["tipo.adiastematica", "Adiastemática"],
    ["tipo.diastematica", "Diastemática"],
    ["tipo.quadrada", "Quadrada"],
    ["tipo.moderna", "Moderna"],
  ]),
  level("nivel.regiao", "Região", [
    ["regiao.germanica", "Germânica"],
    ["regiao.francesa", "Francesa"],
    ["regiao.iberica", "Ibérica"],
    ["regiao.italica", "Itálica"],
    ["regiao.inglesa", "Inglesa"],
  ]),
  level("nivel.familia", "Família", [
    ["familia.sao-galo", "São Galo"],
    ["familia.laon", "Laon"],
    ["familia.breta", "Bretã"],
    ["familia.aquitana", "Aquitana"],
    ["familia.beneventana", "Beneventana"],
    ["familia.nonantolana", "Nonantolana"],
    ["familia.cisterciense", "Cisterciense"],
    ["familia.solesmense", "Solesmense"],
  ]),
];

const NOTATION_TO_ID: Record<string, string> = {
  adiastematic: "tipo.adiastematica",
  diastematic: "tipo.diastematica",
  square: "tipo.quadrada",
  modern: "tipo.moderna",
};
const ID_TO_NOTATION: Record<string, Notation> = Object.fromEntries(
  Object.entries(NOTATION_TO_ID).map(([n, id]) => [id, n as Notation]),
);

export function cloneClassification(c: Classification): Classification {
  return c.map((l) => ({ ...l, values: l.values.map((v) => ({ ...v })) })) as Classification;
}

export function emptyClasses(): SourceClasses {
  return [null, null, null];
}

export function notationToClassId(notation: unknown): string | null {
  return typeof notation === "string" ? NOTATION_TO_ID[notation] ?? null : null;
}

export function notationOf(classes: SourceClasses): Notation {
  return (classes[0] && ID_TO_NOTATION[classes[0]]) || "other";
}

/** Library wins on names and order; project values the library lacks are appended (spec R5). */
export function mergeClassification(library: Classification, project: Classification): Classification {
  const out = cloneClassification(library);
  project.forEach((pl, i) => {
    const known = new Set(out[i].values.map((v) => v.id));
    for (const v of pl.values) {
      if (known.has(v.id)) continue;
      known.add(v.id);
      out[i].values.push({ ...v });
    }
  });
  return out;
}

/**
 * Edits made in the Classification dialog, carried into the user library:
 * the project's level names, value names and order win for the project's
 * ids; values only the library has stay, after them, except the `removed`
 * ids (removed in the dialog: they leave the library too; a project that
 * still uses one gets it back on open, through mergeClassification). Dedupes.
 */
export function applyClassificationEdits(
  library: Classification,
  project: Classification,
  removed: readonly string[] = [],
): Classification {
  return project.map((pl, i) => {
    const seen = new Set<string>(removed);
    const values = [];
    for (const v of [...pl.values, ...(library[i]?.values ?? [])]) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      values.push({ ...v });
    }
    return { ...pl, values };
  }) as Classification;
}
