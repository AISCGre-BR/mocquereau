import { describe, expect, it } from "vitest";
import { concordanceByFamily, countReadings, concordanceBySource, divergentSyllables } from "./concordance";
import { makeAnalysisProject, vocabulary as v } from "./__fixtures__/analysis-project";

const p = makeAnalysisProject();
const ag = (compared: number, agree: number) => ({
  compared, agree, percent: compared === 0 ? null : agree / compared,
});

describe("concordanceBySource", () => {
  const { ids, matrix } = concordanceBySource(p, {}, v);

  it("compares only syllables where both sources have neumes", () => {
    expect(ids).toEqual(["E", "SG", "L", "X"]);
    expect(matrix.E.SG).toEqual(ag(3, 2));
    expect(matrix.SG.E).toEqual(ag(3, 2));
    expect(matrix.E.X).toEqual(ag(1, 0));
    expect(matrix.SG.X).toEqual(ag(1, 0));
  });

  it("resolves equivalences before comparing (uncinus = tractulus)", () => {
    expect(matrix.E.L).toEqual(ag(3, 2));
    expect(matrix.SG.L).toEqual(ag(3, 2));
  });

  it("leaves the diagonal without percent", () => {
    for (const id of ids) expect(matrix[id][id].percent).toBeNull();
  });
});

describe("equivalências diretas e não transitivas", () => {
  // E [uncinus], SG [tractulus], L [virga] numa mesma sílaba.
  const q = structuredClone(makeAnalysisProject());
  q.sources[0].annotations = { 0: { neumes: [{ kind: "uncinus" }], tags: [] } };
  q.sources[1].annotations = { 0: { neumes: [{ kind: "tractulus" }], tags: [] } };
  q.sources[2].annotations = { 0: { neumes: [{ kind: "virga" }], tags: [] } };
  q.sources[3].annotations = {};

  it("E concorda com SG e com L; SG e L discordam", () => {
    const { matrix } = concordanceBySource(q, {}, v);
    expect(matrix.E.SG).toEqual(ag(1, 1));
    expect(matrix.E.L).toEqual(ag(1, 1));
    expect(matrix.SG.L).toEqual(ag(1, 0));
  });

  it("sequências de tamanhos diferentes discordam", () => {
    const r = structuredClone(q);
    r.sources[1].annotations = { 0: { neumes: [{ kind: "tractulus" }, { kind: "virga" }], tags: [] } };
    expect(concordanceBySource(r, {}, v).matrix.E.SG).toEqual(ag(1, 0));
  });

  it("leituras: cada uma entra no primeiro grupo cujo representante concorda (SG e L entram no de E)", () => {
    expect(countReadings(v, [["uncinus"], ["tractulus"], ["virga"]])).toBe(1);
    expect(countReadings(v, [["tractulus"], ["virga"], ["uncinus"]])).toBe(2);
    expect(divergentSyllables(q, {}, v)).toEqual([]);
    const r = structuredClone(q);
    r.sources[0].annotations = {};
    expect(divergentSyllables(r, {}, v)).toEqual([{ syllable: 0, readings: 2, sources: 2 }]);
  });
});

describe("concordanceByFamily", () => {
  const { ids, matrix } = concordanceByFamily(p, {}, v);

  it("groups sources by family, with \"none\" for sources without one", () => {
    expect(ids).toEqual(["familia.sao-galo", "familia.laon", "none"]);
    expect(matrix["familia.sao-galo"]["familia.sao-galo"]).toEqual(ag(3, 2));
    expect(matrix["familia.sao-galo"]["familia.laon"]).toEqual(ag(6, 4));
    expect(matrix["familia.laon"]["familia.sao-galo"]).toEqual(ag(6, 4));
    expect(matrix["familia.sao-galo"].none).toEqual(ag(2, 0));
    expect(matrix.none["familia.laon"]).toEqual(ag(1, 0));
    expect(matrix["familia.laon"]["familia.laon"]).toEqual(ag(0, 0));
    expect(matrix.none.none).toEqual(ag(0, 0));
  });

  it("puts every source in \"none\" when the classification has no family level", () => {
    const q = makeAnalysisProject();
    q.classification[2] = { ...q.classification[2], id: "nivel.outro" };
    expect(concordanceByFamily(q, {}, v).ids).toEqual(["none"]);
  });
});

describe("divergentSyllables", () => {
  it("sorts by readings, then sources, then index", () => {
    expect(divergentSyllables(p, {}, v)).toEqual([
      { syllable: 2, readings: 3, sources: 3 },
      { syllable: 0, readings: 2, sources: 4 },
    ]);
  });

  it("leaves out syllables where every source agrees", () => {
    expect(divergentSyllables(p, {}, v).map((d) => d.syllable)).not.toContain(1);
  });

  it("honours the limit", () => {
    expect(divergentSyllables(p, {}, v, 1).map((d) => d.syllable)).toEqual([2]);
  });
});
