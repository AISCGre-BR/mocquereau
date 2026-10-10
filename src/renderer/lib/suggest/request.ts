// src/renderer/lib/suggest/request.ts
//
// Pure layer that turns a project page into a neume-detector request: which
// notation, which syllables may receive a suggestion, which region of the
// page to rasterize, and the maps between region fractions and view fractions.

import { boxesInView } from "@shared/box-frame";
import { orderNeumeBands } from "@shared/band-order";
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

/** Text and word of each syllable, by global index. */
function syllableInfo(words: SyllabifiedWord[]): (idx: number) => Omit<SuggestSyllable, "suggest"> | null {
  const texts = flattenSyllables(words);
  const wordOf: number[] = [];
  words.forEach((w, wi) => w.syllables.forEach(() => wordOf.push(wi)));
  return (idx) => (idx < 0 || idx >= texts.length ? null : { index: idx, text: texts[idx], wordIndex: wordOf[idx] });
}

/**
 * Syllables of the page range that may take part in a suggestion, in reading order.
 * Rejected syllables and legacy crops (an image in source.syllableCuts) keep their
 * place with suggest:false: their neume is on the page and must not go to a neighbour.
 */
export function collectTargets(
  source: ManuscriptSource,
  line: ManuscriptLine,
  words: SyllabifiedWord[],
  covered: ReadonlyMap<number, string>,
  rejected: ReadonlySet<number>,
): SuggestSyllable[] {
  const boxes = boxesInView(line);
  const info = syllableInfo(words);
  const out: SuggestSyllable[] = [];
  for (let idx = line.syllableRange.start; idx <= line.syllableRange.end; idx++) {
    const s = info(idx);
    if (!s) continue;
    if (idx in boxes) continue; // box (an anchor, see planSuggestion) or legacy null
    if (isLineGap(line, idx)) continue;
    if (covered.has(idx)) continue;
    if (idx in source.syllableCuts) {
      if (source.syllableCuts[idx] !== null) out.push({ ...s, suggest: false }); // legacy crop
      continue; // legacy null: no neume
    }
    out.push({ ...s, suggest: !rejected.has(idx) });
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

/** Raster region of the saved areas: their bounding rectangle with a margin, clamped to the view. */
function areasRegion(areas: FracRect[]): FracRect {
  const x0 = clamp01(Math.min(...areas.map((a) => a.x)) - BAND_MARGIN);
  const y0 = clamp01(Math.min(...areas.map((a) => a.y)) - BAND_MARGIN);
  const x1 = clamp01(Math.max(...areas.map((a) => a.x + a.w)) + BAND_MARGIN);
  const y1 = clamp01(Math.max(...areas.map((a) => a.y + a.h)) + BAND_MARGIN);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function centerInside(box: FracRect, region: FracRect): boolean {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return cx >= region.x && cx <= region.x + region.w && cy >= region.y && cy <= region.y + region.h;
}

/** The page's boxes (view fractions), in range order; nulls ("no neume") left out. */
function pageAnchors(line: ManuscriptLine): SuggestAnchor[] {
  const view = boxesInView(line);
  const all: SuggestAnchor[] = [];
  for (let idx = line.syllableRange.start; idx <= line.syllableRange.end; idx++) {
    const box = view[idx];
    if (box) all.push({ index: idx, box });
  }
  return all;
}

/**
 * M3: the candidates request for a page. Region and areas as in planSuggestion; anchors = every
 * box of the page inside the region (the detector drops glyphs they already hold and, on staves,
 * takes their height); no syllables. Never null: there is always something to look at.
 */
export function planCandidates(source: ManuscriptSource, line: ManuscriptLine): SuggestPlan {
  const notation = resolveNotation(source, line);
  const all = pageAnchors(line);
  const areas = orderNeumeBands(line.neumeBands ?? []);
  if (areas.length === 0) {
    return { lineId: line.id, region: { x: 0, y: 0, w: 1, h: 1 }, input: { notation, syllables: [], anchors: all, mode: "candidates" } };
  }
  const region = areasRegion(areas);
  const anchors = all.filter((a) => centerInside(a.box, region)).map((a) => ({ index: a.index, box: viewToRegion(a.box, region) }));
  return {
    lineId: line.id,
    region,
    input: { notation, syllables: [], anchors, bands: areas.map((a) => viewToRegion(a, region)), mode: "candidates" },
  };
}

/**
 * M2: first syllable of the sequential queue: the first suggestible target (collectTargets, range
 * order) at or after the active syllable, or after the range start without one (or with one outside
 * the range). null = nothing to
 * suggest from there.
 */
export function sequentialStart(
  source: ManuscriptSource,
  line: ManuscriptLine,
  words: SyllabifiedWord[],
  covered: ReadonlyMap<number, string>,
  rejected: ReadonlySet<number>,
  active: number | null,
): number | null {
  // an active syllable outside this page's range (another page) does not move the start
  const inRange = active !== null && active >= line.syllableRange.start && active <= line.syllableRange.end;
  const from = inRange ? active : line.syllableRange.start;
  const first = collectTargets(source, line, words, covered, rejected).find((s) => s.suggest !== false && s.index >= from);
  return first ? first.index : null;
}

/**
 * The detector request for a page. The sequential queue starts at `sequentialStart` (M2): targets
 * from there on (suggest:false ones keep their place), boxes from there on, and the nearest box
 * before the start, which opens the queue. Pending syllables before the start stay out. Areas go
 * to the detector in reading order (rows top to bottom, left to right).
 */
export function planSuggestion(
  source: ManuscriptSource,
  line: ManuscriptLine,
  words: SyllabifiedWord[],
  covered: ReadonlyMap<number, string>,
  rejected: ReadonlySet<number>,
  active: number | null,
): SuggestPlan | null {
  const start = sequentialStart(source, line, words, covered, rejected, active);
  if (start === null) return null;
  const syllables = collectTargets(source, line, words, covered, rejected).filter((s) => s.index >= start);

  const all = pageAnchors(line);
  /** Boxes from the start on, plus the nearest one before it (it opens the queue). */
  const fromStart = (list: SuggestAnchor[]): SuggestAnchor[] => {
    const before = list.filter((a) => a.index < start);
    return [...(before.length ? [before[before.length - 1]] : []), ...list.filter((a) => a.index >= start)];
  };
  const anchors = fromStart(all);

  // The detector only honours anchors whose syllable is in `syllables` (reading order).
  const info = syllableInfo(words);
  const withAnchors = (kept: SuggestAnchor[]): SuggestSyllable[] =>
    [
      ...syllables,
      ...kept.flatMap((a) => {
        const s = info(a.index);
        return s ? [{ ...s, suggest: false }] : [];
      }),
    ].sort((a, b) => a.index - b.index);

  const notation = resolveNotation(source, line);
  const areas = orderNeumeBands(line.neumeBands ?? []);
  if (areas.length === 0) {
    return {
      lineId: line.id,
      region: { x: 0, y: 0, w: 1, h: 1 },
      input: { notation, syllables: withAnchors(anchors), anchors },
    };
  }

  const region = areasRegion(areas);
  const inside = fromStart(all.filter((a) => centerInside(a.box, region))).map((a) => ({
    index: a.index,
    box: viewToRegion(a.box, region),
  }));

  return {
    lineId: line.id,
    region,
    input: { notation, syllables: withAnchors(inside), anchors: inside, bands: areas.map((a) => viewToRegion(a, region)) },
  };
}
