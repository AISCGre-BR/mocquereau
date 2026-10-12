import { describe, it, expect } from "vitest";
import { buildIndicatorTables } from "./indicator-tables";
import { makeAnalysisProject, vocabulary } from "./__fixtures__/analysis-project";

const t = (k: string) => k;
const tables = buildIndicatorTables(makeAnalysisProject(), vocabulary, t);

describe("buildIndicatorTables", () => {
  it("devolve as 5 tabelas na ordem, com as siglas como colunas", () => {
    expect(tables.map((x) => x.title)).toEqual([
      "indicators.progress", "indicators.content", "indicators.marks",
      "indicators.concordance", "indicators.tags",
    ]);
    for (const table of tables) expect(table.columns).toEqual(["E", "SG", "L", "X"]);
    for (const table of tables) for (const r of table.rows) expect(r.values).toHaveLength(4);
  });

  it("concordância tem — na diagonal e percentual fora dela", () => {
    const conc = tables[3];
    expect(conc.rows.map((r) => r.label)).toEqual(["E", "SG", "L", "X"]);
    conc.rows.forEach((r, i) => expect(r.values[i]).toBe("—"));
    expect(conc.rows[0].values[1]).toBe("66.7%");
    expect(conc.rows[0].values[3]).toBe("0.0%");
  });

  it("conteúdo neumático: linhas de grupo por categoria e células contagem (%)", () => {
    const content = tables[1];
    expect(content.rows.some((r) => r.group)).toBe(true);
    const uncinus = content.rows.find((r) => r.label === "uncinus")!;
    expect(uncinus.values[2]).toMatch(/^1 \(\d+\.\d%\)$/);
  });

  it("tipo conhecido sem categoria vai para o grupo sem categoria, antes do desconhecido", () => {
    const w = { ...vocabulary, kinds: [...vocabulary.kinds, { id: "solto", name: "solto" }] };
    const q = makeAnalysisProject();
    q.sources[3].annotations![1] = { neumes: [{ kind: "solto" }], tags: [] };
    const labels = buildIndicatorTables(q, w, t)[1].rows.map((r) => r.label);
    const noCat = labels.indexOf("indicators.noCategory");
    const unknown = labels.indexOf("indicators.unknown");
    expect(noCat).toBeGreaterThan(-1);
    expect(labels[noCat + 1]).toBe("solto");
    expect(unknown).toBeGreaterThan(noCat);
    expect(labels[unknown + 1]).toBe("sumido");
  });

  it("marcas incluem não informado; etiquetas agrupadas", () => {
    expect(tables[2].rows.some((r) => r.label === "indicators.unset")).toBe(true);
    expect(tables[4].rows.find((r) => r.label === "raspagem")!.values).toEqual(["1", "1", "0", "0"]);
    expect(tables[4].rows[0].group).toBe(true);
  });

  it("percentuais e decimais no formato do idioma (pt-BR)", () => {
    const pt = buildIndicatorTables(makeAnalysisProject(), vocabulary, t, "pt-BR");
    expect(pt[3].rows[0].values[1]).toBe("66,7%");
    expect(pt[1].rows.find((r) => r.label === "uncinus")!.values[2]).toMatch(/^1 \(\d+,\d%\)$/);
    const mean = pt[1].rows.find((r) => r.label === "indicators.meanNotes")!;
    expect(mean.values.filter(Boolean).every((v) => /^\d+,\d\d$/.test(v))).toBe(true);
  });
});
