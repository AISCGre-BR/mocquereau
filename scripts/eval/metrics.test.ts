import { describe, expect, it } from "vitest";
import { candidateIous, iou, median, p95, sequentialIous, summarize, wrongCount, zoneOf } from "./metrics";

const R = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe("métricas do eval", () => {
  it("IoU: iguais 1, disjuntas 0, metade sobreposta 1/3", () => {
    expect(iou(R(0, 0, 10, 10), R(0, 0, 10, 10))).toBe(1);
    expect(iou(R(0, 0, 10, 10), R(20, 0, 10, 10))).toBe(0);
    expect(iou(R(0, 0, 10, 10), R(5, 0, 10, 10))).toBeCloseTo(1 / 3, 9);
  });

  it("zona: A = caixa; D = 65% superiores", () => {
    expect(zoneOf(R(0, 10, 10, 100), "adiastematic")).toEqual(R(0, 10, 10, 100));
    expect(zoneOf(R(0, 10, 10, 100), "diastematic")).toEqual(R(0, 10, 10, 65));
  });

  it("candidato achado = centro na zona; IoU = união dos candidatos da zona", () => {
    const zones = [R(0, 0, 10, 10), R(20, 0, 10, 10)];
    const cands = [R(0, 0, 5, 10), R(5, 0, 5, 10), R(40, 0, 5, 5)];
    const ious = candidateIous(cands, zones);
    expect(ious).toEqual([1, -1]);
    expect(summarize(ious)).toEqual({ n: 2, found: 0.5, p50: 0.5, p70: 0.5, median: 0.5 });
  });

  it("sequencial: sem sugestão = -1 (IoU 0); erradas = IoU < 0,3 na própria zona", () => {
    const gt = [{ index: 0, zone: R(0, 0, 10, 10) }, { index: 1, zone: R(20, 0, 10, 10) }, { index: 2, zone: R(40, 0, 10, 10) }];
    const sugs = new Map([[0, R(0, 0, 10, 10)], [1, R(0, 0, 10, 10)]]);
    expect(sequentialIous(sugs, gt)).toEqual([1, 0, -1]);
    expect(wrongCount(sugs, gt)).toBe(1);
    expect(summarize(sequentialIous(sugs, gt))).toEqual({ n: 3, found: 2 / 3, p50: 1 / 3, p70: 1 / 3, median: 0 });
  });

  it("mediana e p95 por posição (ceil(0,95 n) − 1 na lista ordenada)", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 0])).toBe(0.5);
    expect(p95(Array.from({ length: 20 }, (_, i) => i + 1))).toBe(19);
    expect(p95([])).toBe(0);
  });
});
