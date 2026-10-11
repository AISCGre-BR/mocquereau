import { describe, expect, it } from "vitest";
import { liveCandidates, nextCandidate, unionBoxes } from "./candidates";
import type { ManuscriptLine } from "../models";

const C = (x: number, band = 0) => ({ box: { x, y: 0.2, w: 0.08, h: 0.2 }, band });
const L = (boxes: ManuscriptLine["syllableBoxes"]): ManuscriptLine =>
  ({ id: "l", image: { dataUrl: "data:,", width: 100, height: 100, mimeType: "image/png" }, syllableRange: { start: 0, end: 9 }, dividers: [], gaps: [], syllableBoxes: boxes, confirmed: false }) as ManuscriptLine;

describe("liveCandidates", () => {
  it("some o candidato coberto >= 50% por uma caixa; null e caixa pequena não escondem", () => {
    const page = { boxes: [C(0.1).box, C(0.3).box, C(0.5).box], bands: [0, 0, 0] };
    const line = L({ 0: { x: 0.09, y: 0.19, w: 0.1, h: 0.22 }, 1: null, 2: { x: 0.5, y: 0.2, w: 0.02, h: 0.2 } });
    expect(liveCandidates(page, line).map((c) => c.box.x)).toEqual([0.3, 0.5]);
  });
});

describe("nextCandidate", () => {
  const areas = [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }];
  const cands = [C(0.1, 0), C(0.4, 0), { box: { x: 0.05, y: 0.6, w: 0.08, h: 0.2 }, band: 1 }, { box: { x: 0.3, y: 0.6, w: 0.08, h: 0.2 }, band: 1 }];
  it("sem anterior: o primeiro", () => expect(nextCandidate(cands, null, areas)).toBe(0));
  it("mesma área, depois do centro da anterior", () => expect(nextCandidate(cands, C(0.1).box, areas)).toBe(1));
  it("fim da área: o primeiro da área seguinte", () => expect(nextCandidate(cands, C(0.4).box, areas)).toBe(2));
  it("fim de tudo: null", () => expect(nextCandidate(cands, { x: 0.3, y: 0.6, w: 0.08, h: 0.2 }, areas)).toBeNull());
  it("sem áreas salvas: tudo é a área 0", () => expect(nextCandidate([C(0.1), C(0.4)], C(0.1).box, [])).toBe(1));
  it("anterior fora de todas as áreas: o primeiro, em ordem de leitura, depois do x da anterior", () => {
    const spaced = [{ x: 0, y: 0, w: 1, h: 0.45 }, { x: 0, y: 0.55, w: 1, h: 0.45 }];
    // centro (0.24, 0.49): entre as duas áreas
    expect(nextCandidate(cands, { x: 0.2, y: 0.48, w: 0.08, h: 0.02 }, spaced)).toBe(1);
    // nenhum depois do x da anterior: o primeiro
    expect(nextCandidate(cands, { x: 0.5, y: 0.48, w: 0.08, h: 0.02 }, spaced)).toBe(0);
  });
});

describe("unionBoxes", () => {
  it("o menor retângulo que contém as duas", () => {
    const u = unionBoxes({ x: 0.1, y: 0.3, w: 0.1, h: 0.1 }, { x: 0.3, y: 0.2, w: 0.1, h: 0.1 });
    expect([u.x, u.y, u.w, u.h].map((n) => +n.toFixed(9))).toEqual([0.1, 0.2, 0.3, 0.2]);
  });
});
