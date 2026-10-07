import { describe, it, expect } from "vitest";
import type { BoxFrame, SyllableBox } from "@shared/project-schema";
import { viewSize, viewToOriginal, type Size } from "@shared/box-frame";
import {
  DEFAULT_AMBIGUOUS_POLICY,
  legacyBoxFrame,
  reinterpretCanonicalBoxes,
  resolveLegacyFrame,
} from "@shared/legacy-frame";

const IMG: Size = { width: 300, height: 120 };
// Canonical (v0.0.5) box in fractions of the ORIGINAL image: pixels [30,90]x[24,84].
const CANON: SyllableBox = { x: 0.1, y: 0.2, w: 0.2, h: 0.5 };
const EXPECTED = { x0: 30, y0: 24, x1: 90, y1: 84 };

const adj = (rotation: number, flipH = false, flipV = false) => ({
  brightness: 100, contrast: 100, saturation: 100, grayscale: 0, invert: false,
  rotation, flipH, flipV,
});

/** Region of the ORIGINAL image covered by a view-frame box. */
function regionInOriginal(box: SyllableBox, img: Size, frame: BoxFrame) {
  const v = viewSize(img, frame);
  const pts = [
    [box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h],
  ].map(([x, y]) => viewToOriginal({ x: x * v.width, y: y * v.height }, img, frame));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function expectRegion(actual: ReturnType<typeof regionInOriginal>) {
  expect(actual.x0).toBeCloseTo(EXPECTED.x0, 6);
  expect(actual.y0).toBeCloseTo(EXPECTED.y0, 6);
  expect(actual.x1).toBeCloseTo(EXPECTED.x1, 6);
  expect(actual.y1).toBeCloseTo(EXPECTED.y1, 6);
}

describe("resolveLegacyFrame", () => {
  it("canonical when there are no boxes, even if rotated", () => {
    expect(resolveLegacyFrame({ imageAdjustments: adj(90), syllableBoxes: {} })).toBe("canonical");
    expect(resolveLegacyFrame({ imageAdjustments: adj(90), syllableBoxes: { 0: null } })).toBe("canonical");
    expect(legacyBoxFrame({ imageAdjustments: adj(90), syllableBoxes: {} })).toBeUndefined();
  });

  it("canonical when geometry is the identity", () => {
    expect(resolveLegacyFrame({ imageAdjustments: adj(0), syllableBoxes: { 0: CANON } })).toBe("canonical");
    expect(resolveLegacyFrame({ syllableBoxes: { 0: CANON } })).toBe("canonical");
  });

  it("v006 for free angles (only possible from v0.0.6 on)", () => {
    expect(resolveLegacyFrame({ imageAdjustments: adj(17.5), syllableBoxes: { 0: CANON } })).toBe("v006");
  });

  it("ambiguous for non-zero quarter turns or flips with boxes", () => {
    for (const a of [adj(90), adj(180), adj(270), adj(0, true), adj(0, false, true), adj(90, false, true)]) {
      expect(resolveLegacyFrame({ imageAdjustments: a, syllableBoxes: { 3: CANON } })).toBe("ambiguous");
    }
  });

  it("default policy keeps the v0.0.6+ reading: boxFrame = current adjustments", () => {
    expect(DEFAULT_AMBIGUOUS_POLICY).toBe("v006");
    expect(legacyBoxFrame({ imageAdjustments: adj(-90 + 360, true), syllableBoxes: { 3: CANON } }))
      .toEqual({ rotation: 270, flipH: true, flipV: false });
  });
});

describe("R4 — both legacy formats crop the same original region", () => {
  const frames: BoxFrame[] = [
    { rotation: 90, flipH: false, flipV: false },
    { rotation: 180, flipH: false, flipV: false },
    { rotation: 270, flipH: false, flipV: false },
    { rotation: 0, flipH: true, flipV: false },
    { rotation: 0, flipH: false, flipV: true },
    { rotation: 90, flipH: false, flipV: true },
  ];

  for (const f of frames) {
    it(`rotation ${f.rotation} flipH ${f.flipH} flipV ${f.flipV}`, () => {
      // v0.0.5 file: boxes canonical. Reinterpreting them yields view-frame boxes.
      const v005Line = { imageAdjustments: adj(f.rotation, f.flipH, f.flipV), syllableBoxes: { 3: CANON } };
      const reinterpreted = reinterpretCanonicalBoxes(v005Line.syllableBoxes, IMG, f)[3]!;
      expectRegion(regionInOriginal(reinterpreted, IMG, f));

      // v0.0.6 file with the same ink: boxes already in view frame. Default policy keeps them.
      const v006Line = { imageAdjustments: adj(f.rotation, f.flipH, f.flipV), syllableBoxes: { 3: reinterpreted } };
      const frame = legacyBoxFrame(v006Line)!;
      expectRegion(regionInOriginal(v006Line.syllableBoxes[3], IMG, frame));

      // The ambiguity is real: reading the v0.0.5 boxes as v0.0.6 crops elsewhere.
      const wrong = regionInOriginal(CANON, IMG, frame);
      const sameAsExpected =
        Math.abs(wrong.x0 - EXPECTED.x0) < 1e-6 && Math.abs(wrong.y0 - EXPECTED.y0) < 1e-6 &&
        Math.abs(wrong.x1 - EXPECTED.x1) < 1e-6 && Math.abs(wrong.y1 - EXPECTED.y1) < 1e-6;
      expect(sameAsExpected).toBe(false);
    });
  }
});
