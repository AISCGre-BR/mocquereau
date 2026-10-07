import { describe, it, expect } from "vitest";
import type { BoxFrame, SyllableBox } from "@shared/project-schema";
import {
  IDENTITY_FRAME,
  frameOf,
  framesEqual,
  hasAnyBox,
  isQuarterTurn,
  normalizeRotation,
  originalToView,
  remapBox,
  remapBoxes,
  viewSize,
  viewToOriginal,
  boxesInView,
} from "@shared/box-frame";

const IMG = { width: 200, height: 100 };
const B: SyllableBox = { x: 0, y: 0, w: 0.25, h: 0.5 }; // pixels [0,50]x[0,50]
const R = (rotation: number, flipH = false, flipV = false): BoxFrame => ({ rotation, flipH, flipV });

function expectBoxClose(actual: SyllableBox, expected: SyllableBox) {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.w).toBeCloseTo(expected.w, 9);
  expect(actual.h).toBeCloseTo(expected.h, 9);
}

describe("frame helpers", () => {
  it("normalizes rotation like the renderer", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(720)).toBe(0);
    expect(normalizeRotation(Number.NaN)).toBe(0);
  });

  it("frameOf and framesEqual", () => {
    expect(frameOf(undefined)).toEqual(IDENTITY_FRAME);
    expect(frameOf({ rotation: -90, flipH: true })).toEqual(R(270, true, false));
    expect(framesEqual(R(360), IDENTITY_FRAME)).toBe(true);
    expect(framesEqual(R(90), R(90, true))).toBe(false);
  });

  it("isQuarterTurn and hasAnyBox", () => {
    expect(isQuarterTurn(270)).toBe(true);
    expect(isQuarterTurn(17.5)).toBe(false);
    expect(hasAnyBox({ 0: null, 1: null })).toBe(false);
    expect(hasAnyBox({ 0: null, 1: B })).toBe(true);
    expect(hasAnyBox(undefined)).toBe(false);
  });

  it("viewSize swaps exactly for quarter turns and grows for free angles", () => {
    expect(viewSize({ width: 2000, height: 1000 }, R(90))).toEqual({ width: 1000, height: 2000 });
    expect(viewSize({ width: 2000, height: 1000 }, R(180))).toEqual({ width: 2000, height: 1000 });
    const v = viewSize(IMG, R(45));
    expect(v.width).toBeCloseTo(300 * Math.SQRT1_2, 9);
    expect(v.height).toBeCloseTo(300 * Math.SQRT1_2, 9);
  });

  it("originalToView and viewToOriginal are inverses", () => {
    for (const f of [R(0), R(90), R(33.3, true), R(270, false, true), R(181, true, true)]) {
      const p = { x: 37, y: 81 };
      const back = viewToOriginal(originalToView(p, IMG, f), IMG, f);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });
});

describe("remapBox — quarter turns and flips are exact", () => {
  it("identity returns an equal box", () => {
    expectBoxClose(remapBox(B, IMG, IDENTITY_FRAME, IDENTITY_FRAME), B);
  });

  it("0 -> 90 moves the top-left corner to the top-right and transposes", () => {
    expectBoxClose(remapBox(B, IMG, R(0), R(90)), { x: 0.5, y: 0, w: 0.5, h: 0.25 });
  });

  it("0 -> 180", () => {
    expectBoxClose(remapBox(B, IMG, R(0), R(180)), { x: 0.75, y: 0.5, w: 0.25, h: 0.5 });
  });

  it("0 -> 270", () => {
    expectBoxClose(remapBox(B, IMG, R(0), R(270)), { x: 0, y: 0.75, w: 0.5, h: 0.25 });
  });

  it("flipH and flipV", () => {
    expectBoxClose(remapBox(B, IMG, R(0), R(0, true)), { x: 0.75, y: 0, w: 0.25, h: 0.5 });
    expectBoxClose(remapBox(B, IMG, R(0), R(0, false, true)), { x: 0, y: 0.5, w: 0.25, h: 0.5 });
  });

  it("flipH then rotate 90", () => {
    expectBoxClose(remapBox(B, IMG, R(0), R(90, true)), { x: 0.5, y: 0.75, w: 0.5, h: 0.25 });
  });

  it("composition 0 -> 90 -> 180 equals 0 -> 180", () => {
    const via = remapBox(remapBox(B, IMG, R(0), R(90)), IMG, R(90), R(180));
    expectBoxClose(via, remapBox(B, IMG, R(0), R(180)));
  });

  it("30 -> 120 is a relative quarter turn: exact, pixel size transposed", () => {
    const b: SyllableBox = { x: 0.3, y: 0.3, w: 0.1, h: 0.2 };
    const from = viewSize(IMG, R(30));
    const to = viewSize(IMG, R(120));
    const out = remapBox(b, IMG, R(30), R(120));
    expect(out.w * to.width).toBeCloseTo(b.h * from.height, 9);
    expect(out.h * to.height).toBeCloseTo(b.w * from.width, 9);
  });
});

describe("remapBox — free angles keep centre and pixel size", () => {
  it("0 -> 45 keeps pixel size and maps the centre exactly", () => {
    const out = remapBox(B, IMG, R(0), R(45));
    const v = viewSize(IMG, R(45));
    expect(out.w * v.width).toBeCloseTo(50, 9);
    expect(out.h * v.height).toBeCloseTo(50, 9);
    const c = originalToView({ x: 25, y: 25 }, IMG, R(45));
    expect((out.x + out.w / 2) * v.width).toBeCloseTo(c.x, 9);
    expect((out.y + out.h / 2) * v.height).toBeCloseTo(c.y, 9);
  });

  it("round trip 0 -> 30 -> 0 restores the box", () => {
    const b: SyllableBox = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    expectBoxClose(remapBox(remapBox(b, IMG, R(0), R(30)), IMG, R(30), R(0)), b);
  });

  it("round trip with flips 12.5 -> 200 (flipV) -> 12.5", () => {
    const b: SyllableBox = { x: 0.4, y: 0.1, w: 0.2, h: 0.3 };
    const a = R(12.5);
    const c = R(200, false, true);
    expectBoxClose(remapBox(remapBox(b, IMG, a, c), IMG, c, a), b);
  });

  it("slider steps 0 -> 30 -> 0 (1 degree each) do not drift", () => {
    const b: SyllableBox = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    let cur = b;
    let deg = 0;
    for (let i = 0; i < 30; i++) { cur = remapBox(cur, IMG, R(deg), R(deg + 1)); deg += 1; }
    for (let i = 0; i < 30; i++) { cur = remapBox(cur, IMG, R(deg), R(deg - 1)); deg -= 1; }
    expectBoxClose(cur, b);
  });

  it("44 -> 46 keeps the pixel size: transpose follows the delta (2 degrees), not the absolute angle", () => {
    const b: SyllableBox = { x: 0.4, y: 0.4, w: 0.1, h: 0.2 };
    const from = viewSize(IMG, R(44));
    const to = viewSize(IMG, R(46));
    const out = remapBox(b, IMG, R(44), R(46));
    expect(out.w * to.width).toBeCloseTo(b.w * from.width, 9);
    expect(out.h * to.height).toBeCloseTo(b.h * from.height, 9);
  });

  it("a free delta near a quarter turn transposes (10 -> 95)", () => {
    const b: SyllableBox = { x: 0.4, y: 0.4, w: 0.1, h: 0.2 };
    const from = viewSize(IMG, R(10));
    const to = viewSize(IMG, R(95));
    const out = remapBox(b, IMG, R(10), R(95));
    expect(out.w * to.width).toBeCloseTo(b.h * from.height, 9);
    expect(out.h * to.height).toBeCloseTo(b.w * from.width, 9);
  });

  it("clamps the result to the view [0,1]", () => {
    const edge: SyllableBox = { x: 0, y: 0, w: 1, h: 0.2 };
    for (const deg of [10, 30, 45, 60, 135, 200, 300]) {
      const out = remapBox(edge, IMG, R(0), R(deg));
      expect(out.x).toBeGreaterThanOrEqual(0);
      expect(out.y).toBeGreaterThanOrEqual(0);
      expect(out.x + out.w).toBeLessThanOrEqual(1 + 1e-12);
      expect(out.y + out.h).toBeLessThanOrEqual(1 + 1e-12);
      expect(out.w).toBeGreaterThan(0);
      expect(out.h).toBeGreaterThan(0);
    }
  });
});

describe("boxesInView (S6/S7 selector)", () => {
  const line = (boxFrame: BoxFrame | undefined, rotation: number, flipH = false) => ({
    image: { width: IMG.width, height: IMG.height },
    syllableBoxes: { 0: B, 1: null } as Record<number, SyllableBox | null>,
    imageAdjustments: { rotation, flipH, flipV: false },
    boxFrame,
  });

  it("returns the stored boxes when they are already in the current frame", () => {
    const l = line(R(90), 90);
    expect(boxesInView(l)).toBe(l.syllableBoxes);
  });

  it("treats an absent boxFrame as the current frame", () => {
    const l = line(undefined, 30);
    expect(boxesInView(l)).toBe(l.syllableBoxes);
  });

  it("maps boxes stored in another frame into the current view", () => {
    const l = line(R(0), 90);
    const out = boxesInView(l);
    expect(out[1]).toBeNull();
    expectBoxClose(out[0]!, remapBox(B, IMG, R(0), R(90)));
  });

  it("is computed once per line object", () => {
    const l = line(R(0), 37);
    expect(boxesInView(l)).toBe(boxesInView(l));
  });

  it("accepts an explicit image size", () => {
    const l = line(R(0), 90);
    expectBoxClose(boxesInView(l, { width: 100, height: 100 })[0]!, remapBox(B, { width: 100, height: 100 }, R(0), R(90)));
  });
});

describe("remapBoxes", () => {
  it("keeps null entries and returns the same object when frames are equal", () => {
    const boxes = { 0: B, 1: null };
    expect(remapBoxes(boxes, IMG, R(90), R(90))).toBe(boxes);
    const out = remapBoxes(boxes, IMG, R(0), R(90));
    expect(out[1]).toBeNull();
    expectBoxClose(out[0]!, { x: 0.5, y: 0, w: 0.5, h: 0.25 });
  });

  it("returns boxes unchanged when the image size is unusable", () => {
    const boxes = { 0: B };
    expect(remapBoxes(boxes, { width: 0, height: 100 }, R(0), R(90))).toBe(boxes);
  });
});
