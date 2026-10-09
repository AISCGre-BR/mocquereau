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

export { loadCases, gtAreas } from "./cases";
export * from "./metrics";
export { suggestBoxes, planSuggestion, regionToView, viewToRegion, coveredByOtherPages, frameOf };

/** The sequential plan: the page as the user starts it, nothing rejected. */
export function planCase(c: EvalCase): SuggestPlan | null {
  return planSuggestion(c.sourceModel, c.line, c.words, coveredByOtherPages(c.sourceModel, c.line.id, ""), new Set());
}

/** Region to rasterize for the case (the whole view when there is no plan). */
export function caseRegion(c: EvalCase): Rect {
  return planCase(c)?.region ?? { x: 0, y: 0, w: 1, h: 1 };
}

export function runSequential(
  c: EvalCase,
  raster: RasterRGBA,
  opts: { minConfidence?: number } = {},
): { sugs: Map<number, Rect>; ms: number } {
  const plan = planCase(c);
  const sugs = new Map<number, Rect>();
  if (!plan) return { sugs, ms: 0 };
  const t0 = performance.now();
  const res = suggestBoxes({ ...plan.input, image: raster });
  const ms = performance.now() - t0;
  const min = opts.minConfidence ?? 0;
  for (const s of res.suggestions) if (s.confidence >= min) sugs.set(s.index, regionToView(s.box, plan.region));
  return { sugs, ms };
}

/**
 * Candidate boxes of the detector, in view fractions, or null while the detector
 * does not expose them (they arrive in a later task).
 */
export function runCandidates(c: EvalCase, raster: RasterRGBA): { cands: Rect[]; ms: number } | null {
  const plan = planCase(c);
  if (!plan) return { cands: [], ms: 0 };
  const t0 = performance.now();
  const res = suggestBoxes({ ...plan.input, image: raster }) as { candidates?: { box: Rect }[] | Rect[] };
  const ms = performance.now() - t0;
  if (!Array.isArray(res.candidates)) return null;
  const cands = res.candidates.map((k) => regionToView("box" in k ? k.box : k, plan.region));
  return { cands, ms };
}
