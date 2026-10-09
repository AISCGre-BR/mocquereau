import { describe, expect, it } from "vitest";
import { remapBoxes } from "@shared/box-frame";
import { blobs, boxesIn, page } from "../../src/renderer/lib/box-frame-detect.fixtures";
import { gtAreas, loadCases, samePage } from "./cases";

// PNG 1x1 válido (o migrador confere a assinatura dos bytes).
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
// Ajustes completos (o validador descarta um imageAdjustments parcial).
const ROT5 = { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, invert: false, rotation: 5, flipH: false, flipV: false };
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
  function legacy(boxes: Record<number, unknown>, adj?: Record<string, unknown>, size = { width: 1, height: 1 }) {
    return {
      title: "T",
      text: { raw: "Pu er na tus", words: [{ original: "Puer", syllables: ["Pu", "er"] }, { original: "natus", syllables: ["na", "tus"] }], hyphenationMode: "manual" },
      sources: [{
        id: "s1", order: 1, metadata: { siglum: "X1", library: "", city: "", century: "", notation: "adiastematic" },
        lines: [
          { id: "l1", image: { dataUrl: PNG, ...size, mimeType: "image/png" }, syllableRange: { start: 0, end: 3 }, dividers: [], gaps: [], syllableBoxes: boxes, confirmed: true, ...(adj ? { imageAdjustments: adj } : {}) },
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

  const B = { 0: { x: 0.1, y: 0.1, w: 0.1, h: 0.2 }, 2: { x: 0.4, y: 0.1, w: 0.1, h: 0.2 } };

  it("abre como o app: o quadro que a tinta escolhe vai para line.boxFrame e o gabarito sai na vista", async () => {
    // Página girada 5 graus com caixas desenhadas a 0 (o caso do v0.0.6/0.0.7 que o app corrige ao abrir).
    const size = { width: 600, height: 400 };
    const blobList = blobs(size.width, size.height);
    const raster = page(size.width, size.height, blobList);
    const at0 = boxesIn({ rotation: 0, flipH: false, flipV: false }, size, blobList);
    const four = { 0: at0[0], 1: at0[1], 2: at0[8], 3: at0[23] };
    const json = legacy(four, ROT5, size);
    const seen: string[] = [];
    const loadRaster = async (img: { dataUrl: string }) => {
      seen.push(img.dataUrl.slice(0, 22));
      return raster;
    };
    const opened = (await loadCases(json, "t", { loadRaster })).cases[0];
    const asRead = (await loadCases(json, "t")).cases[0];
    expect(seen).toEqual(["data:image/png;base64,"]);
    expect(opened.line.boxFrame).toEqual({ rotation: 0, flipH: false, flipV: false });
    expect(asRead.line.boxFrame).toEqual({ rotation: 5, flipH: false, flipV: false });
    const expected = remapBoxes(four, size, { rotation: 0, flipH: false, flipV: false }, { rotation: 5, flipH: false, flipV: false });
    opened.gt.forEach((g) => {
      const e = expected[g.index]!;
      [g.box.x, g.box.y, g.box.w, g.box.h].forEach((v, i) => expect(v).toBeCloseTo([e.x, e.y, e.w, e.h][i], 9));
    });
    expect(asRead.gt[3].box.x).not.toBeCloseTo(opened.gt[3].box.x, 3);
  });

  it("abre como o app: imagem que não decodifica fica como lida", async () => {
    const { cases } = await loadCases(legacy(B, ROT5), "t", { loadRaster: async () => null });
    expect(cases[0].line.boxFrame).toEqual({ rotation: 5, flipH: false, flipV: false });
    expect(cases[0].gt.map((g) => g.index)).toEqual([0, 2]);
  });

  it("samePage: mesma imagem e caixas (quase) iguais = mesma página, em projetos diferentes", async () => {
    const a = (await loadCases(legacy(B), "a")).cases[0];
    const b = (await loadCases(legacy(B, ROT5), "b")).cases[0];
    const many = (n: number, moved = -1) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [i, { x: 0.05 * i + (i === moved ? 0.02 : 0), y: 0.1, w: 0.04, h: 0.2 }]));
    const c = (await loadCases(legacy({ 0: B[0] }), "c")).cases[0];
    const d = (await loadCases(legacy(many(12)), "d")).cases[0];
    const e = (await loadCases(legacy(many(12, 9)), "e")).cases[0];
    expect(samePage(a, b)).toBe(true);
    expect(samePage(a, c)).toBe(false);
    expect(samePage(d, e)).toBe(true); // uma caixa redesenhada em 12: ainda a mesma página
  });
});
