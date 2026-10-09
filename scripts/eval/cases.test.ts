import { describe, expect, it } from "vitest";
import { gtAreas, loadCases } from "./cases";

// PNG 1x1 válido (o migrador confere a assinatura dos bytes).
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const b = (index: number, x: number, y: number) => ({ index, box: { x, y, w: 0.05, h: 0.04 } });

describe("gtAreas", () => {
  it("duas linhas, a primeira com um vão grande: três áreas em ordem de leitura, com margem", () => {
    const areas = gtAreas([b(0, 0.1, 0.1), b(1, 0.2, 0.1), b(2, 0.6, 0.1), b(3, 0.1, 0.3), b(4, 0.2, 0.31)]);
    expect(areas).toHaveLength(3);
    const near = (r: { x: number; y: number; w: number; h: number }, e: number[]) =>
      [r.x, r.y, r.w, r.h].forEach((v, i) => expect(v).toBeCloseTo(e[i], 6));
    near(areas[0], [0.097, 0.096, 0.156, 0.048]);
    near(areas[1], [0.597, 0.096, 0.056, 0.048]);
    near(areas[2], [0.097, 0.296, 0.156, 0.058]);
  });
});

describe("loadCases", () => {
  function legacy(boxes: Record<number, unknown>) {
    return {
      title: "T",
      text: { raw: "Pu er na tus", words: [{ original: "Puer", syllables: ["Pu", "er"] }, { original: "natus", syllables: ["na", "tus"] }], hyphenationMode: "manual" },
      sources: [{
        id: "s1", order: 1, metadata: { siglum: "X1", library: "", city: "", century: "", notation: "adiastematic" },
        lines: [
          { id: "l1", image: { dataUrl: PNG, width: 1, height: 1, mimeType: "image/png" }, syllableRange: { start: 0, end: 3 }, dividers: [], gaps: [], syllableBoxes: boxes, confirmed: true },
          { id: "l2", image: { dataUrl: PNG, width: 1, height: 1, mimeType: "image/png" }, syllableRange: { start: 0, end: 3 }, dividers: [], gaps: [], syllableBoxes: {}, confirmed: false },
        ],
        syllableCuts: {},
      }],
    };
  }

  it("página com caixas vira caso; a página sem caixas fica de fora; null vira 'sem neuma' e não gabarito", async () => {
    const { cases } = await loadCases(legacy({ 0: { x: 0.1, y: 0.1, w: 0.1, h: 0.2 }, 1: null, 2: { x: 0.4, y: 0.1, w: 0.1, h: 0.2 } }), "teste");
    expect(cases).toHaveLength(1);
    const c = cases[0];
    expect(c.name).toBe("X1 p1");
    expect(c.gt.map((g) => g.index)).toEqual([0, 2]);
    expect(c.firstGt).toBe(0);
    expect(c.line.syllableBoxes).toEqual({ 1: null });
    expect(c.line.neumeBands).toEqual(c.areas);
    expect(c.line.confirmed).toBe(false);
  });
});
