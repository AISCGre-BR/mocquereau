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

/**
 * Enter: the first candidate of `prev`'s area whose center x is after `prev`'s center; else the
 * first of a following area; without `prev` (or with one outside every area), the first. null if
 * none. `prev`'s area = index in `areas` of the rectangle holding its center; without areas, 0.
 */
export function nextCandidate(cands: LiveCandidate[], prev: SyllableBox | null, areas: SyllableBox[]): number | null {
  if (cands.length === 0) return null;
  if (!prev) return 0;
  let area = 0;
  if (areas.length > 0) {
    const px = cx(prev);
    const py = cy(prev);
    area = areas.findIndex((a) => px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h);
    if (area < 0) return 0;
  }
  const px = cx(prev);
  const same = cands.findIndex((c) => c.band === area && cx(c.box) > px);
  if (same >= 0) return same;
  const later = cands.findIndex((c) => c.band > area);
  return later >= 0 ? later : null;
}
