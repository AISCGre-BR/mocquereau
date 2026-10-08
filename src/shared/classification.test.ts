import { describe, expect, it } from "vitest";
import {
  SUGGESTED_CLASSIFICATION, applyClassificationEdits, cloneClassification, emptyClasses,
  mergeClassification, notationOf, notationToClassId,
} from "./classification";

describe("SUGGESTED_CLASSIFICATION", () => {
  it("has the three approved levels in order", () => {
    expect(SUGGESTED_CLASSIFICATION.map((l) => l.name)).toEqual(["Tipo", "Região", "Família"]);
    expect(SUGGESTED_CLASSIFICATION[0].values.map((v) => v.name)).toEqual([
      "Adiastemática", "Diastemática", "Quadrada", "Moderna",
    ]);
    expect(SUGGESTED_CLASSIFICATION[1].values.map((v) => v.name)).toEqual([
      "Germânica", "Francesa", "Ibérica", "Itálica", "Inglesa",
    ]);
    expect(SUGGESTED_CLASSIFICATION[2].values.map((v) => v.name)).toEqual([
      "São Galo", "Laon", "Bretã", "Aquitana", "Beneventana", "Nonantolana", "Cisterciense", "Solesmense",
    ]);
  });
  it("uses stable, unique ids", () => {
    const ids = SUGGESTED_CLASSIFICATION.flatMap((l) => [l.id, ...l.values.map((v) => v.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SUGGESTED_CLASSIFICATION[0].values[2].id).toBe("tipo.quadrada");
  });
});

describe("notationToClassId", () => {
  it.each([
    ["adiastematic", "tipo.adiastematica"],
    ["diastematic", "tipo.diastematica"],
    ["square", "tipo.quadrada"],
    ["modern", "tipo.moderna"],
    ["other", null],
    [undefined, null],
    ["garbage", null],
  ])("%s -> %s", (input, expected) => {
    expect(notationToClassId(input)).toBe(expected);
  });
});

describe("notationOf", () => {
  it("maps level-1 suggested ids back to the detector notation", () => {
    expect(notationOf(["tipo.diastematica", null, null])).toBe("diastematic");
    expect(notationOf(["tipo.quadrada", null, null])).toBe("square");
    expect(notationOf([null, null, null])).toBe("other");
    expect(notationOf(["user-made-id", null, null])).toBe("other");
  });
});

describe("mergeClassification", () => {
  it("adds project values missing from the library, keeping library names and order", () => {
    const lib = cloneClassification(SUGGESTED_CLASSIFICATION);
    lib[2].values[0].name = "Sankt Gallen"; // user renamed in the library
    const proj = cloneClassification(SUGGESTED_CLASSIFICATION);
    proj[2].values.push({ id: "v-mozarabe", name: "Moçárabe" });
    proj[2].values[0].name = "São Galo";
    const merged = mergeClassification(lib, proj);
    expect(merged[2].values[0]).toEqual({ id: "familia.sao-galo", name: "Sankt Gallen" });
    expect(merged[2].values.at(-1)).toEqual({ id: "v-mozarabe", name: "Moçárabe" });
    expect(merged[2].values).toHaveLength(9);
  });
  it("appends a duplicated project id only once", () => {
    const lib = cloneClassification(SUGGESTED_CLASSIFICATION);
    const proj = cloneClassification(SUGGESTED_CLASSIFICATION);
    proj[2].values.push({ id: "v-dup", name: "A" }, { id: "v-dup", name: "B" });
    const merged = mergeClassification(lib, proj);
    expect(merged[2].values.filter((v) => v.id === "v-dup")).toEqual([{ id: "v-dup", name: "A" }]);
  });
  it("keeps the library level name and does not mutate inputs", () => {
    const lib = cloneClassification(SUGGESTED_CLASSIFICATION);
    lib[0].name = "Notação";
    const proj = cloneClassification(SUGGESTED_CLASSIFICATION);
    const merged = mergeClassification(lib, proj);
    expect(merged[0].name).toBe("Notação");
    expect(proj[0].name).toBe("Tipo");
    expect(merged).not.toBe(lib);
  });
});

describe("applyClassificationEdits", () => {
  it("project names and order win for project ids; library-only values go last", () => {
    const lib = cloneClassification(SUGGESTED_CLASSIFICATION);
    lib[2].values.push({ id: "v-lib-only", name: "Só na biblioteca" });
    const proj = cloneClassification(SUGGESTED_CLASSIFICATION);
    proj[2].name = "Escola";
    proj[2].values.reverse();
    proj[2].values[0].name = "Solesmes";
    proj[2].values.push({ id: "v-new", name: "Moçárabe" });
    const out = applyClassificationEdits(lib, proj);
    expect(out[2].name).toBe("Escola");
    expect(out[2].values.map((v) => v.id)).toEqual([...proj[2].values.map((v) => v.id), "v-lib-only"]);
    expect(out[2].values[0]).toEqual({ id: "familia.solesmense", name: "Solesmes" });
    expect(out[2].values.at(-1)).toEqual({ id: "v-lib-only", name: "Só na biblioteca" });
  });
  it("dedupes project ids and does not mutate inputs", () => {
    const lib = cloneClassification(SUGGESTED_CLASSIFICATION);
    const proj = cloneClassification(SUGGESTED_CLASSIFICATION);
    proj[0].values.push({ id: "v-dup", name: "A" }, { id: "v-dup", name: "B" });
    const out = applyClassificationEdits(lib, proj);
    expect(out[0].values.filter((v) => v.id === "v-dup")).toEqual([{ id: "v-dup", name: "A" }]);
    expect(out[0].values).toHaveLength(5);
    out[0].values[0].name = "x";
    expect(proj[0].values[0].name).toBe("Adiastemática");
    expect(lib[0].values[0].name).toBe("Adiastemática");
  });
});

describe("emptyClasses", () => {
  it("returns a fresh triple of nulls", () => {
    const a = emptyClasses();
    a[0] = "x";
    expect(emptyClasses()).toEqual([null, null, null]);
  });
});
