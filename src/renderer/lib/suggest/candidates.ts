// src/renderer/lib/suggest/candidates.ts
//
// M3: candidate neume groups of a page (transient, view fractions). A candidate
// the page already uses (a box covers most of it) is hidden; undoing that box
// brings it back. Enter takes the next one in reading order.

import { boxesInView } from "@shared/box-frame";
import type { ManuscriptLine, SyllableBox } from "../models";

export interface LiveCandidate {
  box: SyllableBox;
  /** Index of the detector area (`bands` of the request, reading order); 0 without areas. */
  band: number;
}

/** Fraction of `b`'s area covered by `a`. */
function coveredFraction(b: SyllableBox, a: SyllableBox): number {
  const area = b.w * b.h;
  if (area <= 0) return 0;
  const w = Math.min(b.x + b.w, a.x + a.w) - Math.max(b.x, a.x);
  const h = Math.min(b.y + b.h, a.y + a.h) - Math.max(b.y, a.y);
  return w > 0 && h > 0 ? (w * h) / area : 0;
}

/** Candidates still free: one with >= 50% of its area covered by a box of the page (current view) goes. */
export function liveCandidates(page: { boxes: SyllableBox[]; bands: number[] }, line: ManuscriptLine): LiveCandidate[] {
  const used = Object.values(boxesInView(line)).filter((b): b is SyllableBox => !!b);
  const out: LiveCandidate[] = [];
  page.boxes.forEach((box, i) => {
    if (used.some((u) => coveredFraction(box, u) >= 0.5)) return;
    out.push({ box, band: page.bands[i] ?? 0 });
  });
  return out;
}

const cx = (b: SyllableBox) => b.x + b.w / 2;
const cy = (b: SyllableBox) => b.y + b.h / 2;

/** Index in `areas` of the rectangle holding the box's center; 0 without areas, -1 outside them all. */
export function areaOf(box: SyllableBox, areas: SyllableBox[]): number {
  if (areas.length === 0) return 0;
  const px = cx(box);
  const py = cy(box);
  return areas.findIndex((a) => px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h);
}

/**
 * Enter: the first candidate of `prev`'s area whose center x is after `prev`'s center; else the
 * first of a following area; without `prev`, the first. With `prev` outside every area, the first
 * candidate (reading order, any area) whose center x is after `prev`'s, else the first. null if
 * none. `prev`'s area = index in `areas` of the rectangle holding its center; without areas, 0.
 */
export function nextCandidate(cands: LiveCandidate[], prev: SyllableBox | null, areas: SyllableBox[]): number | null {
  if (cands.length === 0) return null;
  if (!prev) return 0;
  const area = areaOf(prev, areas);
  const px = cx(prev);
  if (area < 0) {
    const after = cands.findIndex((c) => cx(c.box) > px);
    return after >= 0 ? after : 0;
  }
  const same = cands.findIndex((c) => c.band === area && cx(c.box) > px);
  if (same >= 0) return same;
  const later = cands.findIndex((c) => c.band > area);
  return later >= 0 ? later : null;
}

/** Shift+click: the smallest box holding both (a neume split in two groups). */
export function unionBoxes(a: SyllableBox, b: SyllableBox): SyllableBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
