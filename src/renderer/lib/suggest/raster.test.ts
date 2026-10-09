import { describe, expect, it } from "vitest";
import { IDENTITY_FRAME, frameOf, originalToView, viewSize, type Point } from "@shared/box-frame";
import { rasterSize, viewRasterTransform } from "./raster";

const apply = (m: number[], p: Point) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const img = { width: 300, height: 200 };
const frames = [0, 90, 180, 270, 17.5].flatMap((rotation) =>
  [false, true].flatMap((flipH) => [false, true].map((flipV) => ({ rotation, flipH, flipV }))));

describe("viewRasterTransform", () => {
  it.each(frames)("coincide com originalToView (%o)", (frame) => {
    const region = { x: 0.1, y: 0.2, w: 0.6, h: 0.5 };
    const s = 0.5;
    const v = viewSize(img, frame);
    const m = viewRasterTransform(img, frame, region, s);
    for (const p of [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 120, y: 77 }, { x: 300, y: 200 }]) {
      const q = originalToView(p, img, frame);
      const want = { x: (q.x - region.x * v.width) * s, y: (q.y - region.y * v.height) * s };
      const got = apply(m, p);
      expect(got.x).toBeCloseTo(want.x, 6);
      expect(got.y).toBeCloseTo(want.y, 6);
    }
  });
});

describe("rasterSize", () => {
  it("limita o lado maior a 2400", () => {
    expect(rasterSize({ width: 4000, height: 6000 }, IDENTITY_FRAME, { x: 0, y: 0, w: 1, h: 1 })).toEqual({ width: 1600, height: 2400, scale: 0.4 });
    expect(rasterSize({ width: 4000, height: 6000 }, IDENTITY_FRAME, { x: 0, y: 0.5, w: 1, h: 0.1 }).scale).toBeCloseTo(0.6, 9);
    expect(rasterSize({ width: 800, height: 600 }, frameOf({ rotation: 90 }), { x: 0, y: 0, w: 1, h: 1 })).toEqual({ width: 600, height: 800, scale: 1 });
  });
});
