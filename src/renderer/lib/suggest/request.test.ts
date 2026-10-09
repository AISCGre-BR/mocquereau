import { describe, expect, it } from "vitest";
import type { ManuscriptLine, ManuscriptSource, StoredImage, SyllabifiedWord } from "../models";
import { collectTargets, planSuggestion, regionToView, resolveNotation, viewToRegion } from "./request";
import { IMAGE_ADJUSTMENTS_DEFAULT } from "../image-adjustments";

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
    const plan = planSuggestion(source([l]), l, words, none, noRej)!;
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
    const plan = planSuggestion(source([l]), l, words, none, noRej)!;
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
    const plan = planSuggestion(source([l]), l, words, none, noRej)!;
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
    const plan = planSuggestion(source([l]), l, words, none, noRej)!;
    expect(plan.input.anchors).toEqual([{ index: 0, box: { x: 0.75, y: 0, w: 0.25, h: 0.5 } }]);
  });

  it("sem alvo sugerivel devolve null", () => {
    const l = line({ syllableRange: { start: 0, end: 1 }, gaps: [0] });
    expect(planSuggestion(source([l]), l, words, none, new Set([1]))).toBeNull();
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
