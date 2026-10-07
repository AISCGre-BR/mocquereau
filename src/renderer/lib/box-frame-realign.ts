// src/renderer/lib/box-frame-realign.ts
//
// Legacy open (.mocquereau.json): the migration assumes boxes of a rotated
// line are stored in the current frame (R3 'v006'), but v0.0.6/0.0.7 never
// remapped boxes when the rotation changed afterwards. For each rotated or
// flipped line with boxes, score the candidate frames on the ink and report
// the lines whose boxes clearly belong to another frame.
import type { BoxFrame } from "@shared/project-schema";
import { IDENTITY_FRAME, frameOf, framesEqual, hasAnyBox } from "@shared/box-frame";
import type { ManuscriptLine, MocquereauProject, StoredImage } from "./models";
import {
  INK_MAX_LONG_SIDE,
  candidateFrames,
  pickBoxFrame,
  scoreBoxFrames,
  type FrameScore,
  type RasterLike,
} from "./box-frame-detect";

export type RasterLoader = (image: StoredImage) => Promise<RasterLike | null>;

export interface LineRealignment {
  sourceId: string;
  lineId: string;
  /** Frame the boxes are stored in now (line.boxFrame, or the current adjustments). */
  from: BoxFrame;
  /** Frame the ink says they were drawn in. */
  to: BoxFrame;
  scores: FrameScore[];
}

/** Frame the line's boxes are stored in (absent boxFrame = current adjustments). */
export function storedBoxFrame(line: Pick<ManuscriptLine, "boxFrame" | "imageAdjustments">): BoxFrame {
  return line.boxFrame ? frameOf(line.boxFrame) : frameOf(line.imageAdjustments);
}

/** Lines worth checking: boxes drawn and some rotation or flip in play. */
export function linesToCheck(project: MocquereauProject): Array<{ sourceId: string; line: ManuscriptLine }> {
  const out: Array<{ sourceId: string; line: ManuscriptLine }> = [];
  for (const source of project.sources) {
    for (const line of source.lines) {
      if (!hasAnyBox(line.syllableBoxes)) continue;
      const current = frameOf(line.imageAdjustments);
      const stored = storedBoxFrame(line);
      if (framesEqual(current, IDENTITY_FRAME) && framesEqual(stored, IDENTITY_FRAME)) continue;
      out.push({ sourceId: source.id, line });
    }
  }
  return out;
}

/** Scores one line's candidate frames (null when the image cannot be decoded). */
export async function scoreLine(line: ManuscriptLine, load: RasterLoader): Promise<FrameScore[] | null> {
  const raster = await load(line.image);
  if (!raster) return null;
  const stored = storedBoxFrame(line);
  return scoreBoxFrames(raster, line.syllableBoxes ?? {}, candidateFrames(frameOf(line.imageAdjustments), stored));
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Checks every candidate line, one per task (the UI keeps painting between
 * lines). isCancelled lets the caller stop when the document changes.
 */
export async function detectRealignments(
  project: MocquereauProject,
  load: RasterLoader,
  opts: { isCancelled?: () => boolean; yieldFn?: () => Promise<void> } = {},
): Promise<LineRealignment[]> {
  const yieldFn = opts.yieldFn ?? nextTask;
  const out: LineRealignment[] = [];
  for (const { sourceId, line } of linesToCheck(project)) {
    await yieldFn();
    if (opts.isCancelled?.()) return [];
    let scores: FrameScore[] | null = null;
    try {
      scores = await scoreLine(line, load);
    } catch (err) {
      console.warn("[box-frame-realign] could not score line", line.id, err);
    }
    if (!scores) continue;
    const from = storedBoxFrame(line);
    const to = pickBoxFrame(scores, from);
    if (to) out.push({ sourceId, lineId: line.id, from, to, scores });
  }
  return opts.isCancelled?.() ? [] : out;
}

/** Decodes a stored image into a raster no larger than maxLongSide (DOM only). */
export async function loadRasterForInk(image: StoredImage, maxLongSide = INK_MAX_LONG_SIDE): Promise<RasterLike | null> {
  if (!image.dataUrl) return null;
  const el = new Image();
  el.decoding = "async";
  el.src = image.dataUrl;
  try {
    await el.decode();
  } catch {
    return null;
  }
  const w0 = el.naturalWidth;
  const h0 = el.naturalHeight;
  if (!(w0 > 0) || !(h0 > 0)) return null;
  const scale = Math.min(1, maxLongSide / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * scale));
  const height = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(el, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}
