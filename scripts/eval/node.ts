// scripts/eval/node.ts
//
// Node half of the eval (bundled by scripts/eval-suggestions.mjs): cases,
// metrics, the suggestion plan and the detector, run exactly as the app does.

import { frameOf } from "@shared/box-frame";
import { suggestBoxes } from "../../src/renderer/lib/neume-detect";
import type { RasterRGBA } from "../../src/renderer/lib/neume-detect";
import { planCandidates, planSuggestion, regionToView, viewToRegion, type SuggestPlan } from "../../src/renderer/lib/suggest/request";
import { coveredByOtherPages } from "../../src/renderer/lib/sources";
import type { EvalCase } from "./cases";
import type { Rect } from "./metrics";

export { loadCases, gtAreas, samePage } from "./cases";
export * from "./metrics";
export { suggestBoxes, planSuggestion, planCandidates, regionToView, viewToRegion, coveredByOtherPages, frameOf };

/**
 * The plan, built by the app's planSuggestion. `anchors` (one-anchor scenario) are ground-truth boxes
 * already on the page: they go into a copy of the line as real syllableBoxes, in the line's box frame
 * (the stored boxes), so the app skips them as targets and passes them as anchors (suggest: false),
 * exactly as when the user has drawn them. Without anchors: the page as the user starts it.
 */
function caseLine(c: EvalCase, anchors: { index: number }[]): EvalCase["line"] {
  if (!anchors.length) return c.line;
  const boxes = { ...(c.line.syllableBoxes ?? {}) };
  for (const a of anchors) {
    const stored = c.storedBoxes[a.index];
    if (stored) boxes[a.index] = { ...stored };
  }
  return { ...c.line, syllableBoxes: boxes };
}

function caseSource(c: EvalCase, anchors: { index: number }[]): EvalCase["sourceModel"] {
  if (!anchors.length) return c.sourceModel;
  const line = caseLine(c, anchors);
  return { ...c.sourceModel, lines: c.sourceModel.lines.map((l) => (l.id === line.id ? line : l)) };
}

export function planCase(c: EvalCase, anchors: { index: number }[] = []): SuggestPlan | null {
  const line = caseLine(c, anchors);
  const sourceModel = caseSource(c, anchors);
  // M2: the queue starts at the case's first ground-truth syllable, as if it were the active one
  return planSuggestion(sourceModel, line, c.words, coveredByOtherPages(sourceModel, line.id, ""), new Set(), c.firstGt);
}

/** Region to rasterize for the case (the whole view when there is no plan). */
export function caseRegion(c: EvalCase): Rect {
  return planCase(c)?.region ?? { x: 0, y: 0, w: 1, h: 1 };
}

export function runSequential(
  c: EvalCase,
  raster: RasterRGBA,
  opts: { minConfidence?: number; anchors?: { index: number }[] } = {},
): { sugs: Map<number, Rect>; ms: number | null } {
  const plan = planCase(c, opts.anchors);
  const sugs = new Map<number, Rect>();
  if (!plan) return { sugs, ms: null }; // no detector call: not a timing sample
  const t0 = performance.now();
  const res = suggestBoxes({ ...plan.input, image: raster });
  const ms = performance.now() - t0;
  const min = opts.minConfidence ?? 0;
  for (const s of res.suggestions) if (s.confidence >= min) sugs.set(s.index, regionToView(s.box, plan.region));
  return { sugs, ms };
}

/**
 * Candidate boxes of the detector, in view fractions, from the app's planCandidates. Its anchors
 * (every box of the page in the region) make the detector drop glyphs mostly inside them and set the
 * box height on staves (Task 7b).
 */
export function runCandidates(
  c: EvalCase,
  raster: RasterRGBA,
  anchors: { index: number }[] = [],
): { cands: Rect[]; ms: number | null } {
  const plan = planCandidates(caseSource(c, anchors), caseLine(c, anchors));
  const t0 = performance.now();
  const res = suggestBoxes({ ...plan.input, image: raster });
  const ms = performance.now() - t0;
  const cands = (res.candidates ?? []).map((k) => regionToView(k.box, plan.region));
  return { cands, ms };
}
