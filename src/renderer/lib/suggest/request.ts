// src/renderer/lib/suggest/request.ts
//
// Pure layer that turns a project page into a neume-detector request: which
// notation, which syllables may receive a suggestion, which region of the
// page to rasterize, and the maps between region fractions and view fractions.

import { boxesInView } from "@shared/box-frame";
import { notationOf } from "@shared/classification";
import { isLineGap } from "../syllable-gap";
import { flattenSyllables } from "../sliceUtils";
import type { ManuscriptLine, ManuscriptSource, SyllabifiedWord } from "../models";
import type { FracRect, SuggestAnchor, SuggestInput, SuggestSyllable } from "../neume-detect";

export type DetectNotation = "adiastematic" | "diastematic";

const BAND_MARGIN = 0.02;

/** S1: page override, else the source's level 1; square/modern/diastematic -> D; empty/other -> 'diastematic' (tries the staff, falls back to A). */
export function resolveNotation(source: ManuscriptSource, line: ManuscriptLine): DetectNotation {
  if (line.notationOverride) return line.notationOverride;
  return notationOf(source.metadata.classes) === "adiastematic" ? "adiastematic" : "diastematic";
}

/** Syllables of the page range that may take part in a suggestion, in reading order. */
export function collectTargets(
  source: ManuscriptSource,
  line: ManuscriptLine,
  words: SyllabifiedWord[],
  covered: ReadonlyMap<number, string>,
  rejected: ReadonlySet<number>,
): SuggestSyllable[] {
  const boxes = boxesInView(line);
  const texts = flattenSyllables(words);
  const wordOf: number[] = [];
  words.forEach((w, wi) => w.syllables.forEach(() => wordOf.push(wi)));
  const out: SuggestSyllable[] = [];
  for (let idx = line.syllableRange.start; idx <= line.syllableRange.end; idx++) {
    if (idx < 0 || idx >= texts.length) continue;
    if (idx in boxes) continue; // box or legacy null
    if (isLineGap(line, idx)) continue;
    if (covered.has(idx)) continue;
    if (idx in source.syllableCuts) continue; // legacy crop or legacy null
    out.push({ index: idx, text: texts[idx], wordIndex: wordOf[idx], suggest: !rejected.has(idx) });
  }
  return out;
}

export interface SuggestPlan {
  lineId: string;
  /** Raster region in fractions of the view (S11); the whole page when there is no area. */
  region: FracRect;
  /** bands/anchors already in fractions of the region. */
  input: Omit<SuggestInput, "image">;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Region fractions -> view fractions (the page's current frame). */
export function regionToView(box: FracRect, region: FracRect): FracRect {
  return { x: region.x + box.x * region.w, y: region.y + box.y * region.h, w: box.w * region.w, h: box.h * region.h };
}

/** View fractions -> region fractions. */
export function viewToRegion(box: FracRect, region: FracRect): FracRect {
  return { x: (box.x - region.x) / region.w, y: (box.y - region.y) / region.h, w: box.w / region.w, h: box.h / region.h };
}

export function planSuggestion(
  source: ManuscriptSource,
  line: ManuscriptLine,
  words: SyllabifiedWord[],
  covered: ReadonlyMap<number, string>,
  rejected: ReadonlySet<number>,
): SuggestPlan | null {
  const syllables = collectTargets(source, line, words, covered, rejected);
  if (!syllables.some((s) => s.suggest !== false)) return null;

  const view = boxesInView(line);
  const anchors: SuggestAnchor[] = [];
  for (let idx = line.syllableRange.start; idx <= line.syllableRange.end; idx++) {
    const box = view[idx];
    if (box) anchors.push({ index: idx, box });
  }

  const notation = resolveNotation(source, line);
  const areas = line.neumeBands ?? [];
  if (areas.length === 0) {
    return { lineId: line.id, region: { x: 0, y: 0, w: 1, h: 1 }, input: { notation, syllables, anchors } };
  }

  const x0 = clamp01(Math.min(...areas.map((a) => a.x)) - BAND_MARGIN);
  const y0 = clamp01(Math.min(...areas.map((a) => a.y)) - BAND_MARGIN);
  const x1 = clamp01(Math.max(...areas.map((a) => a.x + a.w)) + BAND_MARGIN);
  const y1 = clamp01(Math.max(...areas.map((a) => a.y + a.h)) + BAND_MARGIN);
  const region: FracRect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };

  const inside = anchors
    .filter((a) => {
      const cx = a.box.x + a.box.w / 2;
      const cy = a.box.y + a.box.h / 2;
      return cx >= region.x && cx <= region.x + region.w && cy >= region.y && cy <= region.y + region.h;
    })
    .map((a) => ({ index: a.index, box: viewToRegion(a.box, region) }));

  return {
    lineId: line.id,
    region,
    input: { notation, syllables, anchors: inside, bands: areas.map((a) => viewToRegion(a, region)) },
  };
}
