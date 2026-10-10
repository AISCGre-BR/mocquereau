// scripts/eval/node.ts
//
// Node half of the eval (bundled by scripts/eval-suggestions.mjs): cases,
// metrics, the suggestion plan and the detector, run exactly as the app does.

import { frameOf } from "@shared/box-frame";
import { suggestBoxes } from "../../src/renderer/lib/neume-detect";
import type { RasterRGBA } from "../../src/renderer/lib/neume-detect";
import { planSuggestion, regionToView, viewToRegion, type SuggestPlan } from "../../src/renderer/lib/suggest/request";
import { coveredByOtherPages } from "../../src/renderer/lib/sources";
import type { EvalCase } from "./cases";
import type { Rect } from "./metrics";

export { loadCases, gtAreas, samePage } from "./cases";
export * from "./metrics";
export { suggestBoxes, planSuggestion, regionToView, viewToRegion, coveredByOtherPages, frameOf };

/**
 * The sequential plan: the page as the user starts it, nothing rejected. `anchors` (view fractions)
 * are boxes already on the page (one-anchor scenario), passed to the detector as anchors.
 */
export function planCase(c: EvalCase, anchors: { index: number; box: Rect }[] = []): SuggestPlan | null {
  const plan = planSuggestion(c.sourceModel, c.line, c.words, coveredByOtherPages(c.sourceModel, c.line.id, ""), new Set());
  if (!plan || !anchors.length) return plan;
  const own = anchors.map((a) => ({ index: a.index, box: viewToRegion(a.box, plan.region) }));
  return { ...plan, input: { ...plan.input, anchors: [...(plan.input.anchors ?? []), ...own] } };
}

/** Region to rasterize for the case (the whole view when there is no plan). */
export function caseRegion(c: EvalCase): Rect {
  return planCase(c)?.region ?? { x: 0, y: 0, w: 1, h: 1 };
}

export function runSequential(
  c: EvalCase,
  raster: RasterRGBA,
  opts: { minConfidence?: number; anchors?: { index: number; box: Rect }[] } = {},
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
 * Candidate boxes of the detector, in view fractions. Until the candidates plan
 * exists (later task), the sequential plan with `mode: 'candidates'` and no syllables.
 */
export function runCandidates(
  c: EvalCase,
  raster: RasterRGBA,
  anchors: { index: number; box: Rect }[] = [],
): { cands: Rect[]; ms: number | null } {
  const plan = planCase(c, anchors);
  if (!plan) return { cands: [], ms: null }; // no detector call: not a timing sample
  const t0 = performance.now();
  const res = suggestBoxes({ ...plan.input, image: raster, mode: "candidates", syllables: [] });
  const ms = performance.now() - t0;
  const cands = (res.candidates ?? []).map((k) => regionToView(k.box, plan.region));
  return { cands, ms };
}
