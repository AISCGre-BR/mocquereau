import { describe, it, expect } from "vitest";
import { validateProject } from "@shared/validate";
import { SUGGESTED_CLASSIFICATION } from "@shared/classification";
import { IMG_A, makeV2Project } from "./__fixtures__/projects";

type AnyObj = Record<string, any>;
const makeV3Json = (): AnyObj => structuredClone(makeV2Project()) as AnyObj;
const clone = (): AnyObj => structuredClone(makeV2Project()) as AnyObj;

describe("validateProject", () => {
  it("accepts a valid v3 project unchanged and without warnings", () => {
    const r = validateProject(makeV2Project());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.project).toEqual(makeV2Project());
  });

  it("rejects non-objects and other schema versions", () => {
    expect(validateProject(null).ok).toBe(false);
    expect(validateProject([]).ok).toBe(false);
    const p = clone();
    p.schemaVersion = 1;
    expect(validateProject(p).ok).toBe(false);
  });

  it("rejects structural errors: sources, source id, line image, words", () => {
    const noSources = clone();
    delete noSources.sources;
    expect(validateProject(noSources).ok).toBe(false);

    const noId = clone();
    delete noId.sources[0].id;
    expect(validateProject(noId).ok).toBe(false);

    const badImage = clone();
    badImage.sources[0].lines[0].image.imageId = "../../etc/passwd";
    expect(validateProject(badImage).ok).toBe(false);

    const badWords = clone();
    badWords.text.words = [{ original: "x" }];
    expect(validateProject(badWords).ok).toBe(false);
  });

  it("defaults absent dividers/gaps silently and warns on invalid ones", () => {
    const p = clone();
    delete p.sources[0].lines[0].dividers;
    p.sources[0].lines[0].gaps = "nope";
    const r = validateProject(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.sources[0].lines[0].dividers).toEqual([]);
    expect(r.project.sources[0].lines[0].gaps).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });

  it("falls back to manual hyphenation for unknown modes", () => {
    const p = clone();
    p.text.hyphenationMode = "klingon";
    const r = validateProject(p);
    expect(r.ok && r.project.text.hyphenationMode).toBe("manual");
  });

  it("drops invalid imageAdjustments and derives a missing confirmed flag", () => {
    const p = clone();
    p.sources[0].lines[0].imageAdjustments = { rotation: "x" };
    delete p.sources[0].lines[0].confirmed;
    const r = validateProject(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.sources[0].lines[0].imageAdjustments).toBeUndefined();
    expect(r.project.sources[0].lines[0].confirmed).toBe(true);
    expect(r.warnings.length).toBe(2);
  });

  it("normalizes an absent boxFrame on a line with boxes to the current adjustments", () => {
    const p = clone();
    delete p.sources[0].lines[0].boxFrame;
    const r = validateProject(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.sources[0].lines[0].boxFrame).toEqual({ rotation: 90, flipH: false, flipV: false });
    expect(r.warnings).toEqual([]);
  });

  it("drops invalid boxes and non-numeric keys", () => {
    const p = clone();
    p.sources[0].lines[0].syllableBoxes = { 0: { x: 0, y: 0, w: -1, h: 1 }, foo: null, 2: null };
    const r = validateProject(p);
    expect(r.ok && r.project.sources[0].lines[0].syllableBoxes).toEqual({ 2: null });
  });

  it("drops image map entries whose path does not match their id", () => {
    const p = clone();
    p.images[IMG_A].path = `images/${"b".repeat(64)}.png`;
    const r = validateProject(p);
    expect(r.ok && r.project.images).toEqual({});
  });

  it("keeps the missing flag on image references", () => {
    const p = clone();
    p.sources[0].lines[0].image.missing = true;
    const r = validateProject(p);
    expect(r.ok && r.project.sources[0].lines[0].image.missing).toBe(true);
  });
});

describe("classification validation", () => {
  it("nulls class ids that do not exist in the classification, with a warning", () => {
    const json = makeV3Json();
    json.sources[0].metadata.classes = ["ghost-id", null, null];
    const r = validateProject(json);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project.sources[0].metadata.classes).toEqual([null, null, null]);
      expect(r.warnings.some((w) => w.includes("classes"))).toBe(true);
    }
  });
  it("falls back to the suggested classification when missing", () => {
    const json = makeV3Json();
    delete json.classification;
    const r = validateProject(json);
    expect(r.ok && r.project.classification).toEqual(SUGGESTED_CLASSIFICATION);
  });
  it("falls back to the suggested classification, warning, when invalid", () => {
    const json = makeV3Json();
    json.classification = [{ id: "x" }];
    const r = validateProject(json);
    expect(r.ok && r.project.classification).toEqual(SUGGESTED_CLASSIFICATION);
    expect(r.ok && r.warnings.some((w) => w.includes("classification"))).toBe(true);
  });

  it("lê neumeBands e notationOverride válidos e descarta os inválidos com aviso", () => {
    const p = clone();
    p.sources[0].lines[0].neumeBands = [
      { x: 0.1, y: 0.2, w: 0.5, h: 0.1 },
      { x: "a" },
      { x: 0.9, y: 0.9, w: 0.5, h: 0.5 },
    ];
    p.sources[0].lines[0].notationOverride = "diastematic";
    const r = validateProject(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const line = r.project.sources[0].lines[0];
    expect(line.neumeBands).toEqual([
      { x: 0.1, y: 0.2, w: 0.5, h: 0.1 },
      { x: 0.9, y: 0.9, w: expect.closeTo(0.1, 9), h: expect.closeTo(0.1, 9) },
    ]);
    expect(line.notationOverride).toBe("diastematic");
    expect(r.warnings.some((w) => w.includes("neumeBands"))).toBe(true);
  });

  it("neumeBands lado a lado com topos um pouco diferentes: mesma linha, esquerda para direita", () => {
    const p = clone();
    const right = { x: 0.55, y: 0.1, w: 0.4, h: 0.1 };
    const left = { x: 0.05, y: 0.12, w: 0.4, h: 0.1 };
    p.sources[0].lines[0].neumeBands = [right, left];
    const r = validateProject(p);
    expect(r.ok && r.project.sources[0].lines[0].neumeBands).toEqual([left, right]);
  });

  it("notationOverride desconhecido some com aviso; ausência não gera aviso", () => {
    const p = clone();
    p.sources[0].lines[0].notationOverride = "square";
    const a = validateProject(p);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.project.sources[0].lines[0].notationOverride).toBeUndefined();
    expect(a.warnings.some((w) => w.includes("notationOverride"))).toBe(true);
    const b = validateProject(clone());
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.warnings.some((w) => w.includes("notationOverride") || w.includes("neumeBands"))).toBe(false);
  });
});

describe("anotações", () => {
  const withAnnotations = () => {
    const p = clone() as any;
    p.neumeVocabulary = {
      categories: [{ id: "cat.simple", name: "Simples" }],
      kinds: [
        { id: "virga", categoryId: "cat.simple", name: "virga", defaultNotes: 1 },
        { id: "tractulus", categoryId: "cat.simple", name: "tractulus", defaultNotes: 1 },
        { id: "uncinus", categoryId: "cat.simple", name: "uncinus", defaultNotes: 1, equivalentTo: "tractulus" },
      ],
      letters: [{ id: "letter.c", abbr: "c", meaning: "celeriter" }],
    };
    p.tags = [{ id: "t1", name: "raspagem", group: "Paleografia" }];
    p.exportPrefs = { includeIndicators: true };
    p.sources[0].annotations = {
      0: { neumes: [{ kind: "virga", letters: ["letter.c"], episema: false }], certainty: "probable", tags: ["t1"], comment: "x" },
      2: { neumes: [], notes: 3, tags: [] },
    };
    return p;
  };

  it("anotações, vocabulário, etiquetas e preferências fazem a viagem completa sem aviso", () => {
    const r = validateProject(withAnnotations());
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.project.sources[0].annotations).toEqual(withAnnotations().sources[0].annotations);
    expect(r.project.neumeVocabulary?.kinds).toHaveLength(3);
    expect(r.project.tags).toEqual([{ id: "t1", name: "raspagem", group: "Paleografia" }]);
    expect(r.project.exportPrefs).toEqual({ includeIndicators: true });
  });

  it("ausência dos campos novos não gera aviso nem valor", () => {
    const r = validateProject(clone());
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.project.sources[0].annotations).toBeUndefined();
    expect(r.project.neumeVocabulary).toBeUndefined();
    expect(r.project.tags).toBeUndefined();
  });

  it("valores inválidos somem com aviso, sem inventar padrão", () => {
    const p = withAnnotations();
    p.sources[0].annotations[0].certainty = "sure";
    p.sources[0].annotations[0].neumes[0].liquescence = "big";
    p.sources[0].annotations[0].neumes.push({ notes: 2 }); // sem kind
    p.sources[0].annotations.x = { neumes: [], tags: [] }; // chave não numérica
    const r = validateProject(p);
    expect(r.ok).toBe(true); if (!r.ok) return;
    const a = r.project.sources[0].annotations![0];
    expect(a.certainty).toBeUndefined();
    expect(a.neumes).toHaveLength(1);
    expect(a.neumes[0].liquescence).toBeUndefined();
    expect(Object.keys(r.project.sources[0].annotations!)).toEqual(["0", "2"]);
    expect(r.warnings.length).toBeGreaterThanOrEqual(4);
  });

  it("anotação vazia é descartada em silêncio", () => {
    const p = withAnnotations();
    p.sources[0].annotations[5] = { neumes: [], tags: [] };
    const r = validateProject(p);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.project.sources[0].annotations![5]).toBeUndefined();
  });

  it("notas alargadas: inteiros >= 1 ordenados e sem repetição; inválidas somem com aviso; vazio = ausente", () => {
    const p = withAnnotations();
    p.sources[0].annotations[0].neumes.push({ kind: "virga", lengthened: [3, 1, 3] });
    p.sources[0].annotations[0].neumes.push({ kind: "virga", lengthened: [0, 2.5, "x", 2] });
    p.sources[0].annotations[0].neumes.push({ kind: "virga", lengthened: [] });
    p.sources[0].annotations[0].neumes.push({ kind: "virga", lengthened: "1" });
    const r = validateProject(p);
    expect(r.ok).toBe(true); if (!r.ok) return;
    const n = r.project.sources[0].annotations![0].neumes;
    expect(n[1].lengthened).toEqual([1, 3]);
    expect(n[2].lengthened).toEqual([2]);
    expect("lengthened" in n[3]).toBe(false);
    expect("lengthened" in n[4]).toBe(false);
    expect(r.warnings.filter((w) => w.includes("lengthened")).length).toBeGreaterThanOrEqual(2);
  });

  it("ciclo de equivalência é cortado no item que o fecha", () => {
    const p = withAnnotations();
    p.neumeVocabulary.kinds[1].equivalentTo = "uncinus"; // tractulus -> uncinus -> tractulus
    const r = validateProject(p);
    expect(r.ok).toBe(true); if (!r.ok) return;
    const byId = Object.fromEntries(r.project.neumeVocabulary!.kinds.map((k) => [k.id, k]));
    expect(byId.uncinus.equivalentTo).toBe("tractulus");
    expect(byId.tractulus.equivalentTo).toBeUndefined();
  });

  it("tipo sem categoria e sem notas padrão faz a viagem sem aviso; ausente continua ausente", () => {
    const p = withAnnotations();
    p.neumeVocabulary.kinds.push({ id: "solto", name: "solto" });
    const r = validateProject(p);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    const k = r.project.neumeVocabulary!.kinds.find((x) => x.id === "solto")!;
    expect(k).toEqual({ id: "solto", name: "solto" });
    expect("categoryId" in k).toBe(false);
    expect("defaultNotes" in k).toBe(false);
  });

  it("categoria inexistente cai com aviso e o tipo fica sem categoria", () => {
    const p = withAnnotations();
    p.neumeVocabulary.kinds[0].categoryId = "cat.nada";
    const r = validateProject(p);
    expect(r.ok).toBe(true); if (!r.ok) return;
    const k = r.project.neumeVocabulary!.kinds.find((x) => x.id === "virga")!;
    expect(k.categoryId).toBeUndefined();
    expect(k.defaultNotes).toBe(1);
    expect(r.warnings.some((w) => w.includes("virga") && w.includes("categoryId"))).toBe(true);
  });

  it("categoria ou notas padrão presentes mas inválidas ainda descartam o tipo", () => {
    const p = withAnnotations();
    p.neumeVocabulary.kinds[0].categoryId = 3;
    p.neumeVocabulary.kinds[1].defaultNotes = 1.5;
    const r = validateProject(p);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.project.neumeVocabulary!.kinds.map((k) => k.id)).toEqual(["uncinus"]);
  });

  it("equivalência para tipo inexistente some com aviso", () => {
    const p = withAnnotations();
    p.neumeVocabulary.kinds[2].equivalentTo = "nada";
    const r = validateProject(p);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.project.neumeVocabulary!.kinds[2].equivalentTo).toBeUndefined();
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
