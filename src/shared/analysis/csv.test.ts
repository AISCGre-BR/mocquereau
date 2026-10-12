import { describe, it, expect } from "vitest";
import { RAW_HEADER, rawRows, toCsv, totalsRows } from "./csv";
import { makeAnalysisProject, vocabulary } from "./__fixtures__/analysis-project";

const t = (k: string) => k;
const col = (name: (typeof RAW_HEADER)[number]) => RAW_HEADER.indexOf(name);

describe("toCsv", () => {
  it("escapa vírgula, aspas, quebra de linha e mantém acentos com BOM", () => {
    const s = toCsv([["a,b", 'diz "sim"', "linha\nnova", "ação", 1.5, null]]);
    expect(s).toBe('﻿"a,b","diz ""sim""","linha\nnova",ação,1.5,\r\n');
  });

  it("cita campos com espaço nas pontas e mantém ponto e vírgula sem aspas", () => {
    expect(toCsv([[" x", "a; b"]])).toBe('﻿" x",a; b\r\n');
  });
});

describe("rawRows", () => {
  const rows = rawRows(makeAnalysisProject(), {}, vocabulary);
  const find = (source: string, index: number, position?: string) =>
    rows.find((r) => r[0] === source && r[col("syllable_index")] === String(index)
      && (position === undefined || r[col("position")] === position))!;

  it("começa pelo cabeçalho", () => {
    expect(rows[0]).toEqual([...RAW_HEADER]);
  });

  it("sílaba anotada sem neumas gera linha com neuma vazio e etiquetas da sílaba", () => {
    const r = find("SG", 4);
    expect(r[col("syllable")]).toBe("va");
    expect(r[col("neume")]).toBe("");
    expect(r[col("position")]).toBe("");
    expect(r[col("syllable_tags")]).toBe("raspagem");
    expect(r[col("section")]).toBe("Segunda");
  });

  it("registra equivalente, categoria, notas e classificação", () => {
    const r = find("L", 2);
    expect(r[col("neume")]).toBe("uncinus");
    expect(r[col("equivalent")]).toBe("tractulus");
    expect(r[col("notes")]).toBe("1");
    expect(r[col("certainty")]).toBe("");
    expect(r[col("family")]).not.toBe("");
  });

  it("marcas do neuma: liquescência, episema e letras por abreviação", () => {
    const r = find("E", 4);
    expect(r[col("neume")]).toBe("pes");
    expect(r[col("liquescence")]).toBe("augmentative");
    expect(r[col("episema")]).toBe("yes");
    expect(r[col("letters")]).toBe("c");
    expect(r[col("syllable_tags")]).toBe("raspagem");
  });

  it("tipo sem categoria nem notas padrão: categoria e notas vazias", () => {
    const w = { ...vocabulary, kinds: [...vocabulary.kinds, { id: "solto", name: "solto" }] };
    const q = makeAnalysisProject();
    q.sources[3].annotations![1] = { neumes: [{ kind: "solto" }], tags: [] };
    const r = rawRows(q, {}, w).find((x) => x[0] === "X" && x[col("neume")] === "solto")!;
    expect(r[col("category")]).toBe("");
    expect(r[col("notes")]).toBe("");
  });

  it("uma linha por neuma, com posição", () => {
    expect(find("L", 3, "1")[col("neume")]).toBe("clivis");
    expect(find("L", 3, "2")[col("neume")]).toBe("virga");
  });
});

describe("totalsRows", () => {
  const rows = totalsRows(makeAnalysisProject(), {}, vocabulary, t);

  it("tem cabeçalho e os seis blocos", () => {
    expect(rows[0]).toEqual(["block", "row", "column", "value", "percent"]);
    expect(new Set(rows.slice(1).map((r) => r[0]))).toEqual(
      new Set(["progress", "neumes", "mean_notes", "marks", "concordance", "tags"]),
    );
  });

  it("concordância E x SG: 2 de 3 = 66.7", () => {
    expect(rows).toContainEqual(["concordance", "E", "SG", "2", "66.7"]);
  });
});
