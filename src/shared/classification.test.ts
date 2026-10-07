import { describe, expect, it } from "vitest";
import {
  SUGGESTED_CLASSIFICATION, cloneClassification, emptyClasses, mergeClassification,
  notationOf, notationToClassId,
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

describe("emptyClasses", () => {
  it("returns a fresh triple of nulls", () => {
    const a = emptyClasses();
    a[0] = "x";
    expect(emptyClasses()).toEqual([null, null, null]);
  });
});
