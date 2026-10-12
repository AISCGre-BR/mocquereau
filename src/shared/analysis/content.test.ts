import { describe, expect, it } from "vitest";
import { groupContentRows, marks, neumeContent } from "./content";
import { occurrences } from "./occurrences";
import { makeAnalysisProject, vocabulary as v } from "./__fixtures__/analysis-project";

const p = makeAnalysisProject();

describe("neumeContent", () => {
  const { rows, meanNotes } = neumeContent(p, {}, v);
  const row = (id: string) => rows.find((r) => r.kindId === id)!;

  it("lists the kinds in use in vocabulary order, unknown kinds last", () => {
    expect(rows.map((r) => r.kindId)).toEqual(["virga", "tractulus", "uncinus", "pes", "clivis", "sumido"]);
  });

  it("counts syllables per real kind with percent of the source's annotated syllables", () => {
    expect(row("virga").bySource).toEqual({
      E: { count: 1, percent: 1 / 5 },
      SG: { count: 1, percent: 1 / 4 },
      L: { count: 2, percent: 2 / 3 },
      X: { count: 0, percent: 0 },
    });
    expect(row("virga").total).toBe(4);
    expect(row("pes").bySource.X).toEqual({ count: 1, percent: 1 });
  });

  it("counts every neume of a repeated kind while percent stays per syllable", () => {
    const q = makeAnalysisProject();
    q.sources[2].annotations![0].neumes = [{ kind: "virga" }, { kind: "virga" }];
    const virga = neumeContent(q, {}, v).rows.find((r) => r.kindId === "virga")!;
    // L: syllable 0 [virga, virga] + syllable 2 [clivis, virga] -> 3 neumes in 2 of 3 annotated syllables
    expect(virga.bySource.L).toEqual({ count: 3, percent: 2 / 3 });
    expect(virga.total).toBe(5);
  });

  it("counts a single repeated-kind syllable as count 2, percent 1/annotated", () => {
    const q = makeAnalysisProject();
    q.sources[3].annotations![0].neumes = [{ kind: "virga" }, { kind: "virga" }];
    const virga = neumeContent(q, {}, v).rows.find((r) => r.kindId === "virga")!;
    expect(virga.bySource.X).toEqual({ count: 2, percent: 1 / 1 });
  });

  it("keeps the real kind and names its equivalent", () => {
    expect(row("uncinus")).toMatchObject({
      name: "uncinus", categoryId: "cat.simple", equivalentName: "tractulus", total: 1,
    });
    expect(row("tractulus").equivalentName).toBeUndefined();
    expect(row("tractulus").total).toBe(2);
  });

  it("marks kinds missing from the vocabulary as unknown", () => {
    expect(row("sumido")).toMatchObject({ name: "sumido", categoryId: null, unknown: true, total: 1 });
  });

  it("a known kind without category is not unknown: categoryId null", () => {
    const w = { ...v, kinds: [...v.kinds, { id: "solto", name: "solto" }] };
    const q = makeAnalysisProject();
    q.sources[3].annotations![1] = { neumes: [{ kind: "solto" }], tags: [] };
    const solto = neumeContent(q, {}, w).rows.find((r) => r.kindId === "solto")!;
    expect(solto).toMatchObject({ name: "solto", categoryId: null, total: 1 });
    expect(solto.unknown).toBeUndefined();
  });

  it("groups rows: categories, then without category, then unknown", () => {
    const w = { ...v, kinds: [...v.kinds, { id: "solto", name: "solto" }] };
    const q = makeAnalysisProject();
    q.sources[3].annotations![1] = { neumes: [{ kind: "solto" }], tags: [] };
    const groups = groupContentRows(neumeContent(q, {}, w).rows, w, (k) => k);
    expect(groups.map((g) => g.type)).toEqual(["category", "category", "noCategory", "unknown"]);
    expect(groups[2].rows.map((r) => r.kindId)).toEqual(["solto"]);
    expect(groups[3].rows.map((r) => r.kindId)).toEqual(["sumido"]);
  });

  it("averages effective notes over annotated syllables with a defined total", () => {
    expect(meanNotes.E).toBeCloseTo(1.5);
    expect(meanNotes.SG).toBeCloseTo(4 / 3);
    expect(meanNotes.L).toBeCloseTo(5 / 3);
    expect(meanNotes.X).toBe(2);
  });

  it("gives null percent and mean when a source has no annotated syllable", () => {
    const r = neumeContent(p, { sectionIds: ["none"] }, v);
    expect(r.rows).toEqual([]);
    expect(r.meanNotes).toEqual({ E: null, SG: null, L: null, X: null });
  });
});

describe("marks", () => {
  const rows = marks(p, {}, v);
  const row = (key: string) => rows.find((r) => r.key === key)!.bySource;

  it("emits the fixed rows, the letters in use and the certainty rows", () => {
    expect(rows.map((r) => r.key)).toEqual([
      "liq.augmentative", "liq.diminutive", "liq.none", "liq.unset",
      "episema.yes", "episema.no", "episema.unset",
      "lengthened",
      "letter.c",
      "certainty.secure", "certainty.probable", "certainty.illegible", "certainty.unset",
    ]);
  });

  it("counts liquescence and episema per neume, unset when absent", () => {
    expect(row("liq.augmentative")).toEqual({ E: 1, SG: 0, L: 0, X: 0 });
    expect(row("liq.unset")).toEqual({ E: 4, SG: 3, L: 4, X: 1 });
    expect(row("liq.none")).toEqual({ E: 0, SG: 0, L: 0, X: 0 });
    expect(row("episema.yes")).toEqual({ E: 1, SG: 0, L: 0, X: 0 });
    expect(row("episema.unset")).toEqual({ E: 4, SG: 3, L: 4, X: 1 });
    expect(row("letter.c")).toEqual({ E: 1, SG: 0, L: 0, X: 0 });
  });

  it("counts lengthened notes (not neumes), only what was informed", () => {
    const q = structuredClone(makeAnalysisProject());
    q.sources[0].annotations![3].neumes[0].lengthened = [1, 2];
    q.sources[2].annotations![2].neumes[0].lengthened = [2];
    expect(marks(q, {}, v).find((r) => r.key === "lengthened")!.bySource).toEqual({ E: 2, SG: 0, L: 1, X: 0 });
    expect(row("lengthened")).toEqual({ E: 0, SG: 0, L: 0, X: 0 });
  });

  it("drills lengthened notes down to the syllables that have them", () => {
    const q = structuredClone(makeAnalysisProject());
    q.sources[2].annotations![2].neumes[1].lengthened = [1];
    expect(occurrences(q, {}, v, { kind: "mark", key: "lengthened" })).toEqual([{ sourceId: "L", syllable: 2 }]);
  });

  it("keys unknown letters by id, adding the prefix only when missing", () => {
    const q = makeAnalysisProject();
    q.sources[3].annotations![0].neumes[0].letters = ["letter.zz", "qq"];
    const keys = marks(q, {}, v).map((r) => r.key).filter((k) => k.startsWith("letter."));
    expect(keys).toEqual(["letter.c", "letter.qq", "letter.zz"]);
  });

  it("counts certainty per annotated syllable and never presumes secure", () => {
    expect(row("certainty.secure")).toEqual({ E: 0, SG: 0, L: 0, X: 0 });
    expect(row("certainty.illegible")).toEqual({ E: 1, SG: 0, L: 0, X: 0 });
    expect(row("certainty.unset")).toEqual({ E: 4, SG: 4, L: 3, X: 1 });
  });
});
