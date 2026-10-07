// src/renderer/lib/box-frame-detect.ts
//
// Which frame are a line's boxes really stored in? Legacy files (v0.0.6/0.0.7)
// did not remap boxes when the rotation changed, so a line can carry boxes
// drawn at 0 degrees next to imageAdjustments.rotation = 5. The file does not
// say which; the ink does. Each candidate frame maps the boxes back onto the
// ORIGINAL image and we measure how much ink falls inside them: the frame the
// user actually drew in wraps the neumes, the wrong ones miss them.
//
// Pure and synchronous (no DOM): the caller hands in the decoded raster.
import type { BoxFrame, SyllableBox } from "@shared/project-schema";
import { framesEqual, frameOf, normalizeRotation, viewSize, viewToOriginal } from "@shared/box-frame";
import { downscaleGray, extractChannel } from "./neume-detect/image";
import { sauvola } from "./neume-detect/threshold";
import { odd } from "./neume-detect/scale";
import type { Mask } from "./neume-detect/types";

export interface RasterLike {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface FrameScore {
  frame: BoxFrame;
  /** Fraction of the sampled points inside the boxes that are ink (0..1). */
  score: number;
}

/** Ink is computed on a copy whose long side is at most this many pixels. */
export const INK_MAX_LONG_SIDE = 1200;
/** Best frame must beat the stored one by this factor to count as a fix. */
export const REALIGN_MARGIN = 1.15;
/** Below this in-box ink fraction the evidence is too thin to act on. */
const MIN_SCORE = 0.01;
/** Samples per box axis (cap); one per ink pixel below it. */
const MAX_SAMPLES_PER_AXIS = 40;

const key = (f: BoxFrame) => `${normalizeRotation(f.rotation)}|${f.flipH}|${f.flipV}`;

/**
 * Candidate frames for a line whose current adjustments are `current`:
 * current; same flips at rotation 0; identity; nearest quarter turn of current;
 * 0/90/180/270 with the current flips; plus the stored frame when different.
 */
export function candidateFrames(current: BoxFrame, stored?: BoxFrame | null): BoxFrame[] {
  const cur = frameOf(current);
  const quarter = normalizeRotation(Math.round(cur.rotation / 90) * 90);
  const list: BoxFrame[] = [
    cur,
    ...(stored ? [frameOf(stored)] : []),
    { rotation: 0, flipH: cur.flipH, flipV: cur.flipV },
    { rotation: 0, flipH: false, flipV: false },
    { rotation: quarter, flipH: cur.flipH, flipV: cur.flipV },
    ...[0, 90, 180, 270].map((rotation) => ({ rotation, flipH: cur.flipH, flipV: cur.flipV })),
  ];
  const seen = new Set<string>();
  return list.filter((f) => {
    const k = key(f);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Binary ink mask (1 = ink) of the raster, downscaled to INK_MAX_LONG_SIDE. */
export function inkMask(raster: RasterLike, maxLongSide = INK_MAX_LONG_SIDE): Mask {
  const gray = extractChannel(raster, "gray");
  const long = Math.max(raster.width, raster.height);
  const small = long > maxLongSide ? downscaleGray(gray, maxLongSide / long) : gray;
  const window = odd(Math.max(15, Math.max(small.width, small.height) / 50));
  return sauvola(small, window);
}

/** Scores on a precomputed ink mask (fractions make the mask scale irrelevant). */
export function scoreBoxFramesOnInk(
  ink: Mask,
  boxes: Record<number, SyllableBox | null>,
  candidates: BoxFrame[],
): FrameScore[] {
  const img = { width: ink.width, height: ink.height };
  const list = Object.values(boxes).filter((b): b is SyllableBox => !!b && b.w > 0 && b.h > 0);
  return candidates.map((frame) => {
    if (list.length === 0) return { frame, score: 0 };
    const v = viewSize(img, frame);
    let hits = 0;
    let total = 0;
    for (const b of list) {
      const pw = b.w * v.width;
      const ph = b.h * v.height;
      const nx = Math.max(2, Math.min(MAX_SAMPLES_PER_AXIS, Math.round(pw)));
      const ny = Math.max(2, Math.min(MAX_SAMPLES_PER_AXIS, Math.round(ph)));
      for (let j = 0; j < ny; j++) {
        const vy = (b.y + (b.h * (j + 0.5)) / ny) * v.height;
        for (let i = 0; i < nx; i++) {
          const vx = (b.x + (b.w * (i + 0.5)) / nx) * v.width;
          const p = viewToOriginal({ x: vx, y: vy }, img, frame);
          const x = Math.floor(p.x);
          const y = Math.floor(p.y);
          total++;
          // Outside the image counts as "no ink": a frame that throws boxes off the page is wrong.
          if (x >= 0 && y >= 0 && x < ink.width && y < ink.height && ink.data[y * ink.width + x]) hits++;
        }
      }
    }
    return { frame, score: total > 0 ? hits / total : 0 };
  });
}

/**
 * Scores each candidate frame for `boxes` against the ORIGINAL (unrotated,
 * unflipped) image: the mean ink fraction inside the boxes once mapped back.
 */
export function scoreBoxFrames(
  raster: RasterLike,
  boxes: Record<number, SyllableBox | null>,
  candidates: BoxFrame[],
): FrameScore[] {
  return scoreBoxFramesOnInk(inkMask(raster), boxes, candidates);
}

/**
 * The frame to switch to, or null to keep `stored`: the best candidate must
 * have real ink and beat the stored frame's score by `margin`.
 */
export function pickBoxFrame(scores: FrameScore[], stored: BoxFrame, margin = REALIGN_MARGIN): BoxFrame | null {
  if (scores.length === 0) return null;
  const best = scores.reduce((a, b) => (b.score > a.score ? b : a));
  if (best.score < MIN_SCORE || framesEqual(best.frame, stored)) return null;
  const current = scores.find((s) => framesEqual(s.frame, stored))?.score ?? 0;
  return best.score >= margin * current ? best.frame : null;
}
