import { describe, it, expect } from "vitest";
import { createDefaultVocabulary } from "./default-vocabulary";
import { resolveEquivalent, filterKinds, restoreDefaults, getVocabulary, fold } from "./vocabulary";

const t = (k: string) => k;

describe("vocabulário padrão", () => {
  const v = createDefaultVocabulary(t);
  it("tem as quatro categorias e os itens da spec, com notas padrão", () => {
    expect(v.categories.map((c) => c.id)).toEqual(["cat.simple", "cat.compound", "cat.liquescent", "cat.ornamental"]);
    const notes = Object.fromEntries(v.kinds.map((k) => [k.name, k.defaultNotes]));
    expect(notes).toMatchObject({ virga: 1, uncinus: 1, pes: 2, "porrectus flexus": 4, ancus: 3, "pes quilismaticus": 3, trivirga: 3 });
    expect(v.kinds).toHaveLength(32);
    expect(v.letters.map((l) => l.abbr)).toEqual(["c", "t", "a", "x", "e", "s", "m", "l", "i", "st", "nl"]);
  });
  it("uncinus equivale a tractulus", () => {
    expect(resolveEquivalent(v, "uncinus")).toBe("tractulus");
    expect(resolveEquivalent(v, "virga")).toBe("virga");
    expect(resolveEquivalent(v, "sumido")).toBe("sumido");
  });
  it("resolve cadeias e não entra em laço mesmo com ciclo em memória", () => {
    const w = structuredClone(v);
    w.kinds.find((k) => k.id === "tractulus")!.equivalentTo = "uncinus";
    expect(["tractulus", "uncinus"]).toContain(resolveEquivalent(w, "uncinus"));
  });
  it("filtra por prefixo de palavra, sem acento nem caixa, ignorando ocultos", () => {
    const w = structuredClone(v);
    w.kinds.find((k) => k.id === "climacus")!.hidden = true;
    const groups = filterKinds(w, "CL");
    const names = groups.flatMap((g) => g.kinds.map((k) => k.name));
    expect(names).toContain("clivis");
    expect(names).not.toContain("climacus");
    expect(names).toContain("climacus resupinus");
    expect(filterKinds(w, "flex").flatMap((g) => g.kinds.map((k) => k.name))).toEqual(["porrectus flexus", "scandicus flexus"]);
  });
  it("restaurar padrão acrescenta o que falta e mantém o que o usuário criou", () => {
    const w = structuredClone(v);
    w.kinds = w.kinds.filter((k) => k.id !== "pes");
    w.kinds.push({ id: "meu", categoryId: "cat.simple", name: "meu", defaultNotes: 1 });
    const r = restoreDefaults(w, t);
    expect(r.kinds.some((k) => k.id === "pes")).toBe(true);
    expect(r.kinds.some((k) => k.id === "meu")).toBe(true);
  });
  it("getVocabulary devolve o do projeto ou o padrão", () => {
    expect(getVocabulary({}, t).kinds).toHaveLength(32);
    expect(getVocabulary({ neumeVocabulary: { categories: [], kinds: [], letters: [] } }, t).kinds).toHaveLength(0);
  });
});

describe("fold", () => {
  it("ignora acentos latinos e maiúsculas", () => {
    expect(fold("Épisème")).toBe("episeme");
  });

  it("mantém distintos ハ e バ (o dakuten não é diacrítico latino)", () => {
    expect(fold("バ")).not.toBe(fold("ハ"));
    expect(fold("バ")).toBe("バ");
  });
});
