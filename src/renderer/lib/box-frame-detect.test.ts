import { describe, it, expect } from "vitest";
import type { BoxFrame } from "@shared/project-schema";
import { IDENTITY_FRAME, framesEqual } from "@shared/box-frame";
import { candidateFrames, pickBoxFrame, scoreBoxFrames } from "./box-frame-detect";
import { blobs, boxesIn, page } from "./box-frame-detect.fixtures";

const R = (rotation: number, flipH = false, flipV = false): BoxFrame => ({ rotation, flipH, flipV });

const W = 600;
const H = 400;
const BLOBS = blobs(W, H);
const IMG = page(W, H, BLOBS);

function best(scores: Array<{ frame: BoxFrame; score: number }>): BoxFrame {
  return [...scores].sort((a, b) => b.score - a.score)[0].frame;
}

describe("candidateFrames", () => {
  it("lists current, no-rotation variants and quarter turns without duplicates", () => {
    const c = candidateFrames(R(5, true, false));
    const keys = c.map((f) => `${f.rotation}|${f.flipH}|${f.flipV}`);
    expect(keys[0]).toBe("5|true|false");
    expect(keys).toContain("0|true|false");
    expect(keys).toContain("0|false|false");
    expect(keys).toContain("90|true|false");
    expect(keys).toContain("180|true|false");
    expect(keys).toContain("270|true|false");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("includes the stored frame when it differs from the current one", () => {
    const c = candidateFrames(R(0), R(33));
    expect(c.some((f) => framesEqual(f, R(33)))).toBe(true);
  });

  it("identity current frame yields the four quarter turns only", () => {
    expect(candidateFrames(IDENTITY_FRAME)).toHaveLength(4);
  });
});

describe("scoreBoxFrames", () => {
  it("boxes drawn at 0 degrees, image now rotated 5: picks 0", () => {
    const boxes = boxesIn(R(0), IMG, BLOBS);
    const scores = scoreBoxFrames(IMG, boxes, candidateFrames(R(5)));
    expect(best(scores)).toEqual(R(0));
    const s0 = scores.find((s) => framesEqual(s.frame, R(0)))!.score;
    const s5 = scores.find((s) => framesEqual(s.frame, R(5)))!.score;
    expect(s0).toBeGreaterThan(1.15 * s5);
  });

  it("boxes drawn at 5 degrees: picks 5", () => {
    const boxes = boxesIn(R(5), IMG, BLOBS);
    const scores = scoreBoxFrames(IMG, boxes, candidateFrames(R(5)));
    expect(best(scores)).toEqual(R(5));
  });

  it("legacy canonical quarter turn (boxes on the original, rotation 90): picks identity", () => {
    const boxes = boxesIn(IDENTITY_FRAME, IMG, BLOBS);
    const scores = scoreBoxFrames(IMG, boxes, candidateFrames(R(90)));
    expect(best(scores)).toEqual(IDENTITY_FRAME);
  });

  it("boxes drawn at 90 with a flip: picks that frame", () => {
    const boxes = boxesIn(R(90, true), IMG, BLOBS);
    const scores = scoreBoxFrames(IMG, boxes, candidateFrames(R(90, true)));
    expect(best(scores)).toEqual(R(90, true));
  });

  it("downscales large rasters and still scores", () => {
    const big = page(2400, 1600, blobs(2400, 1600).map((b) => ({ ...b, w: 40, h: 48 })));
    const list = blobs(2400, 1600).map((b) => ({ ...b, w: 40, h: 48 }));
    const scores = scoreBoxFrames(big, boxesIn(R(0), big, list), candidateFrames(R(5)));
    expect(best(scores)).toEqual(R(0));
  });

  it("no boxes: every score is 0", () => {
    const scores = scoreBoxFrames(IMG, {}, candidateFrames(R(5)));
    expect(scores.every((s) => s.score === 0)).toBe(true);
  });
});

describe("pickBoxFrame", () => {
  const scores = [
    { frame: R(5), score: 0.1 },
    { frame: R(0), score: 0.3 },
  ];
  it("returns the best frame when it beats the stored one by the margin", () => {
    expect(pickBoxFrame(scores, R(5))).toEqual(R(0));
  });
  it("returns null when the stored frame is already best or the margin is not met", () => {
    expect(pickBoxFrame(scores, R(0))).toBeNull();
    expect(pickBoxFrame([{ frame: R(5), score: 0.3 }, { frame: R(0), score: 0.32 }], R(5))).toBeNull();
  });
  it("returns null when nothing has ink", () => {
    expect(pickBoxFrame([{ frame: R(5), score: 0 }, { frame: R(0), score: 0 }], R(5))).toBeNull();
  });
});
