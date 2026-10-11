import { describe, expect, it } from "vitest";
import type { ManuscriptLine, ManuscriptSource, StoredImage, SyllabifiedWord } from "../models";
import { collectTargets, planCandidates, planSuggestion, regionToView, resolveNotation, sequentialStart, viewToRegion } from "./request";
import { IMAGE_ADJUSTMENTS_DEFAULT } from "../image-adjustments";
import { suggestBoxes } from "../neume-detect/pipeline";
import { buildAdiastematicLine, fracToPx, iou, pxToFrac } from "../neume-detect/synthetic";

const IMG: StoredImage = { dataUrl: "data:,", width: 100, height: 200, mimeType: "image/png" };
const BOX = { x: 0.1, y: 0.1, w: 0.1, h: 0.1 };
const words: SyllabifiedWord[] = [
  { original: "abc", syllables: ["a", "b", "c"] },
  { original: "de", syllables: ["d", "e"] },
  { original: "fgh", syllables: ["f", "g", "h"] },
];

function line(extra: Partial<ManuscriptLine> = {}): ManuscriptLine {
  return { id: "L", image: IMG, syllableRange: { start: 0, end: 7 }, dividers: [], gaps: [], syllableBoxes: {}, confirmed: false, ...extra };
}

function source(lines: ManuscriptLine[], classes: ManuscriptSource["metadata"]["classes"] = [null, null, null], syllableCuts: ManuscriptSource["syllableCuts"] = {}): ManuscriptSource {
  return { id: "A", order: 0, metadata: { siglum: "A", library: "", city: "", century: "", classes }, lines, syllableCuts };
}

const none = new Map<number, string>();
const noRej = new Set<number>();

describe("resolveNotation", () => {
  it("override da pagina vence a classe da fonte", () => {
    const l = line({ notationOverride: "adiastematic" });
    expect(resolveNotation(source([l], ["tipo.diastematica", null, null]), l)).toBe("adiastematic");
  });
  it("classe adiastematica da fonte vira adiastematic", () => {
    const l = line();
    expect(resolveNotation(source([l], ["tipo.adiastematica", null, null]), l)).toBe("adiastematic");
  });
  it("classe diastematica da fonte vira diastematic", () => {
    const l = line();
    expect(resolveNotation(source([l], ["tipo.diastematica", null, null]), l)).toBe("diastematic");
  });
  it("quadrada vira diastematic", () => {
    const l = line();
    expect(resolveNotation(source([l], ["tipo.quadrada", null, null]), l)).toBe("diastematic");
  });
  it("moderna vira diastematic", () => {
    const l = line();
    expect(resolveNotation(source([l], ["tipo.moderna", null, null]), l)).toBe("diastematic");
  });
  it("sem classe vira diastematic (tenta a pauta e recai em A)", () => {
    const l = line();
    expect(resolveNotation(source([l]), l)).toBe("diastematic");
  });
});

describe("collectTargets", () => {
  it("exclui caixa, null, gap, coberta e syllableCuts null; recorte legado e rejeitada ficam com suggest:false", () => {
    const l = line({ syllableBoxes: { 0: BOX, 1: null }, gaps: [2] });
    const src = source([l], [null, null, null], { 4: { dataUrl: "data:,", width: 1, height: 1, mimeType: "image/png" }, 5: null });
    const covered = new Map([[3, "other"]]);
    expect(collectTargets(src, l, words, covered, new Set([6])).map((s) => [s.index, s.suggest !== false])).toEqual([[4, false], [6, false], [7, true]]);
  });

  it("preenche text e wordIndex a partir das palavras", () => {
    const l = line();
    const t = collectTargets(source([l]), l, words, none, noRej);
    expect(t[3]).toEqual({ index: 3, text: "d", wordIndex: 1, suggest: true });
    expect(t[7]).toEqual({ index: 7, text: "h", wordIndex: 2, suggest: true });
  });

  it("usa as caixas na vista (boxFrame diferente do atual): a chave remapeada continua excluindo", () => {
    const l = line({
      syllableRange: { start: 0, end: 2 },
      imageAdjustments: { ...IMAGE_ADJUSTMENTS_DEFAULT, rotation: 90 },
      boxFrame: { rotation: 0, flipH: false, flipV: false },
      syllableBoxes: { 0: { x: 0, y: 0, w: 0.5, h: 0.25 }, 1: null },
    });
    expect(collectTargets(source([l]), l, words, none, noRej).map((s) => s.index)).toEqual([2]);
  });
});

describe("planSuggestion", () => {
  it("sem areas: regiao e a pagina toda, sem bands, ancoras como estao", () => {
    const l = line({ syllableRange: { start: 0, end: 2 }, syllableBoxes: { 0: BOX } });
    const plan = planSuggestion(source([l]), l, words, none, noRej, null)!;
    expect(plan.lineId).toBe("L");
    expect(plan.region).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(plan.input.bands).toBeUndefined();
    expect(plan.input.band).toBeUndefined();
    expect(plan.input.anchors).toEqual([{ index: 0, box: BOX }]);
    // A sílaba da âncora vai junto (o detector só usa âncoras presentes em syllables), sem sugestão.
    expect(plan.input.syllables.map((s) => [s.index, s.suggest !== false])).toEqual([[0, false], [1, true], [2, true]]);
  });

  it("com areas: regiao = uniao + margem de 2%; bands e ancoras em fracoes da regiao; ancora fora sai", () => {
    const l = line({
      syllableRange: { start: 0, end: 3 },
      neumeBands: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.1 }, { x: 0.2, y: 0.5, w: 0.5, h: 0.1 }],
      syllableBoxes: { 0: { x: 0.3, y: 0.25, w: 0.1, h: 0.1 }, 1: { x: 0.8, y: 0.9, w: 0.1, h: 0.05 } },
    });
    const plan = planSuggestion(source([l]), l, words, none, noRej, null)!;
    // uniao (0.1,0.2)-(0.7,0.6); com margem (0.08,0.18)-(0.72,0.62)
    expect(plan.region.x).toBeCloseTo(0.08, 9);
    expect(plan.region.y).toBeCloseTo(0.18, 9);
    expect(plan.region.w).toBeCloseTo(0.64, 9);
    expect(plan.region.h).toBeCloseTo(0.44, 9);
    expect(plan.input.bands).toHaveLength(2);
    const b0 = plan.input.bands![0];
    expect(b0.x).toBeCloseTo(0.02 / 0.64, 9);
    expect(b0.y).toBeCloseTo(0.02 / 0.44, 9);
    expect(b0.w).toBeCloseTo(0.5 / 0.64, 9);
    expect(b0.h).toBeCloseTo(0.1 / 0.44, 9);
    expect(plan.input.anchors).toHaveLength(1);
    expect(plan.input.anchors![0].index).toBe(0);
    // Âncora fora da região não entra nem como sílaba.
    expect(plan.input.syllables.map((s) => [s.index, s.suggest !== false])).toEqual([[0, false], [2, true], [3, true]]);
    expect(plan.input.anchors![0].box.x).toBeCloseTo(0.22 / 0.64, 9);
    expect(plan.input.anchors![0].box.y).toBeCloseTo(0.07 / 0.44, 9);
  });

  it("a regiao e recortada a [0,1]", () => {
    const l = line({ syllableRange: { start: 0, end: 2 }, neumeBands: [{ x: 0.01, y: 0.3, w: 0.98, h: 0.2 }] });
    const plan = planSuggestion(source([l]), l, words, none, noRej, null)!;
    expect(plan.region.x).toBe(0);
    expect(plan.region.w).toBeCloseTo(1, 9);
  });

  it("as ancoras vem da vista: boxFrame antigo e remapeado antes de ir para a regiao", () => {
    const l = line({
      syllableRange: { start: 0, end: 2 },
      imageAdjustments: { ...IMAGE_ADJUSTMENTS_DEFAULT, rotation: 90 },
      boxFrame: { rotation: 0, flipH: false, flipV: false },
      syllableBoxes: { 0: { x: 0, y: 0, w: 0.5, h: 0.25 } },
    });
    const plan = planSuggestion(source([l]), l, words, none, noRej, null)!;
    expect(plan.input.anchors).toEqual([{ index: 0, box: { x: 0.75, y: 0, w: 0.25, h: 0.5 } }]);
  });

  it("sem alvo sugerivel devolve null", () => {
    const l = line({ syllableRange: { start: 0, end: 1 }, gaps: [0] });
    expect(planSuggestion(source([l]), l, words, none, new Set([1]), null)).toBeNull();
  });
});

describe("regionToView / viewToRegion", () => {
  const region = { x: 0.1, y: 0.2, w: 0.5, h: 0.4 };
  it("regionToView leva frações da região para a vista", () => {
    const v = regionToView({ x: 0.5, y: 0.25, w: 0.2, h: 0.5 }, region);
    expect(v.x).toBeCloseTo(0.35, 9);
    expect(v.y).toBeCloseTo(0.3, 9);
    expect(v.w).toBeCloseTo(0.1, 9);
    expect(v.h).toBeCloseTo(0.2, 9);
  });
  it("regionToView inverte viewToRegion", () => {
    const box = { x: 0.3, y: 0.35, w: 0.1, h: 0.15 };
    const back = regionToView(viewToRegion(box, region), region);
    expect(back.x).toBeCloseTo(box.x, 9);
    expect(back.y).toBeCloseTo(box.y, 9);
    expect(back.w).toBeCloseTo(box.w, 9);
    expect(back.h).toBeCloseTo(box.h, 9);
  });
});

describe("planSuggestion — fila a partir da ativa (M2)", () => {
  const B2 = { x: 0.2, y: 0.1, w: 0.1, h: 0.1 };
  const B5 = { x: 0.5, y: 0.1, w: 0.1, h: 0.1 };
  const rows = (p: ReturnType<typeof planSuggestion>) => p!.input.syllables.map((s) => [s.index, s.suggest !== false]);

  it("ativa com caixa: começa na próxima pendente; a caixa da ativa abre a fila", () => {
    const l = line({ syllableBoxes: { 2: B2, 5: B5 } });
    const p = planSuggestion(source([l]), l, words, none, noRej, 2);
    expect(rows(p)).toEqual([[2, false], [3, true], [4, true], [5, false], [6, true], [7, true]]);
    expect(p!.input.anchors!.map((a) => a.index)).toEqual([2, 5]);
  });

  it("sem caixa antes da ativa: a fila abre no início do intervalo e as pendentes antes da ativa consomem seus neumas sem sugestão", () => {
    const l = line();
    expect(rows(planSuggestion(source([l]), l, words, none, noRej, 4))).toEqual([
      [0, false], [1, false], [2, false], [3, false], [4, true], [5, true], [6, true], [7, true],
    ]);
  });

  it("pendentes entre a âncora que abre a fila e a ativa ficam na fila com suggest:false", () => {
    const l = line({ syllableBoxes: { 0: BOX, 1: B2 } });
    const p = planSuggestion(source([l]), l, words, none, noRej, 5);
    expect(rows(p)).toEqual([[1, false], [2, false], [3, false], [4, false], [5, true], [6, true], [7, true]]);
    expect(p!.input.anchors!.map((a) => a.index)).toEqual([1]);
  });

  it("rejeitada e recorte legado no início do intervalo mantêm o lugar (Sugerir na fonte, sem ativa)", () => {
    const l = line();
    const src = source([l], [null, null, null], { 1: IMG });
    expect(rows(planSuggestion(src, l, words, none, new Set([0]), null))).toEqual([
      [0, false], [1, false], [2, true], [3, true], [4, true], [5, true], [6, true], [7, true],
    ]);
  });

  it("só a âncora mais próxima antes do início entra", () => {
    const l = line({ syllableBoxes: { 0: BOX, 2: B2 } });
    const p = planSuggestion(source([l]), l, words, none, noRej, 3);
    expect(p!.input.syllables[0].index).toBe(2);
    expect(p!.input.anchors!.map((a) => a.index)).toEqual([2]);
  });

  it("sem ativa começa no início do intervalo; nenhuma pendente a partir da ativa: null", () => {
    const l = line({ syllableBoxes: { 6: B5, 7: B2 } });
    expect(rows(planSuggestion(source([l]), l, words, none, noRej, null))![0]).toEqual([0, true]);
    expect(planSuggestion(source([l]), l, words, none, noRej, 6)).toBeNull();
  });

  it("sequentialStart: primeira pendente sugerível a partir da ativa (rejeitadas e recortes legados não abrem)", () => {
    const l = line({ syllableBoxes: { 3: BOX } });
    expect(sequentialStart(source([l]), l, words, none, new Set([4]), 3)).toBe(5);
    expect(sequentialStart(source([l]), l, words, none, noRej, null)).toBe(0);
    expect(sequentialStart(source([l]), l, words, none, noRej, 40)).toBe(0); // ativa de outra página
  });

  it("áreas fora de ordem no arquivo: bands vão ao detector em ordem de leitura", () => {
    const top = { x: 0.1, y: 0.1, w: 0.8, h: 0.1 };
    const bottom = { x: 0.1, y: 0.5, w: 0.8, h: 0.1 };
    const l = line({ neumeBands: [bottom, top] });
    const p = planSuggestion(source([l]), l, words, none, noRej, null)!;
    expect(p.input.bands!.map((b) => b.y)).toEqual([...p.input.bands!.map((b) => b.y)].sort((a, b) => a - b));
  });
});

describe("planCandidates", () => {
  it("planCandidates: modo candidates, sem sílabas, âncoras = caixas na região, bands da região", () => {
    const l = line({ syllableBoxes: { 1: BOX, 2: null }, neumeBands: [{ x: 0.1, y: 0.1, w: 0.8, h: 0.2 }] });
    const p = planCandidates(source([l]), l);
    expect(p.input.mode).toBe("candidates");
    expect(p.input.syllables).toEqual([]);
    expect(p.input.anchors!.map((a) => a.index)).toEqual([1]);
    expect(p.input.bands).toHaveLength(1);
  });

  it("sem área: a página inteira, todas as caixas como âncoras", () => {
    const l = line({ syllableBoxes: { 0: BOX, 3: { x: 0.8, y: 0.8, w: 0.1, h: 0.1 } } });
    const p = planCandidates(source([l]), l);
    expect(p.region).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(p.input.anchors!.map((a) => a.index)).toEqual([0, 3]);
    expect(p.input.bands).toBeUndefined();
  });
});

describe("planSuggestion + suggestBoxes — pendentes antes da ativa (linha sintética)", () => {
  const fx = buildAdiastematicLine({ seed: 5 });
  const { width: W, height: H } = fx.raster;
  const fxWords: SyllabifiedWord[] = [
    { original: "Puer", syllables: ["Pu", "er"] },
    { original: "natus", syllables: ["na", "tus"] },
    { original: "est", syllables: ["est"] },
  ];
  const run = (l: ManuscriptLine, active: number) => {
    const plan = planSuggestion(source([l]), l, fxWords, none, noRej, active)!;
    const res = suggestBoxes({ image: fx.raster, ...plan.input });
    return Object.fromEntries(res.suggestions.map((s) => [s.index, fracToPx(regionToView(s.box, plan.region), W, H)]));
  };

  it("caixa na 0, ativa 3: a 3 recebe o próprio neuma (1 e 2 consomem os seus sem sugestão)", () => {
    const l = line({ syllableRange: { start: 0, end: 4 }, syllableBoxes: { 0: pxToFrac(fx.truth[0], W, H) } });
    const got = run(l, 3);
    expect(Object.keys(got).map(Number)).toEqual([3, 4]);
    expect(iou(got[3], fx.truth[3])).toBeGreaterThanOrEqual(0.9);
    expect(iou(got[4], fx.truth[4])).toBeGreaterThanOrEqual(0.9);
  });

  it("sem caixas, ativa 2: a 2 recebe o próprio neuma", () => {
    const l = line({ syllableRange: { start: 0, end: 4 } });
    const got = run(l, 2);
    expect(Object.keys(got).map(Number)).toEqual([2, 3, 4]);
    for (const i of [2, 3, 4]) expect(iou(got[i], fx.truth[i])).toBeGreaterThanOrEqual(0.9);
  });
});
