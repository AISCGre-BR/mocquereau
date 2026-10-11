// planSuggestion feeding the real detector (no worker): the page's existing boxes and legacy
// crops must hold their neumes, so the suggestions of the other syllables stay on their own.
import { describe, expect, it } from "vitest";
import type { ManuscriptLine, ManuscriptSource, StoredImage, SyllabifiedWord } from "../models";
import { planSuggestion, regionToView } from "./request";
import { suggestBoxes } from "../neume-detect";
import { buildAdiastematicLine, iou, pxToFrac, fracToPx } from "../neume-detect/synthetic";

const WORDS = [["Pu", "er"], ["na", "tus"], ["est"], ["no", "bis"], ["et"], ["fi", "li", "us"], ["da", "tus"], ["est"], ["no", "bis"]];
const words: SyllabifiedWord[] = WORDS.map((s) => ({ original: s.join(""), syllables: s }));
const W = 1600;
const H = 320;
const fx = buildAdiastematicLine({ width: W, height: H, words: WORDS, u: 4, seed: 5 });
const N = fx.syllables.length;
const IMG: StoredImage = { dataUrl: "data:,", width: W, height: H, mimeType: "image/png" };
const truthFrac = (i: number) => pxToFrac(fx.truth[i], W, H);

function page(extra: Partial<ManuscriptLine>, syllableCuts: ManuscriptSource["syllableCuts"] = {}) {
  const line: ManuscriptLine = {
    id: "L", image: IMG, syllableRange: { start: 0, end: N - 1 }, dividers: [], gaps: [], syllableBoxes: {}, confirmed: false, ...extra,
  };
  const source: ManuscriptSource = {
    id: "A", order: 0, metadata: { siglum: "A", library: "", city: "", century: "", classes: ["tipo.adiastematica", null, null] }, lines: [line], syllableCuts,
  };
  return { source, line };
}

function suggestOn(source: ManuscriptSource, line: ManuscriptLine) {
  const plan = planSuggestion(source, line, words, new Map(), new Set(), null)!;
  const res = suggestBoxes({ ...plan.input, image: fx.raster });
  return new Map(res.suggestions.map((s) => [s.index, fracToPx(regionToView(s.box, plan.region), W, H)]));
}

describe("planSuggestion + suggestBoxes", () => {
  it("existing boxes are anchors: no suggestion takes a boxed neume, the rest stay on their own neumes", () => {
    const { source, line } = page({ syllableBoxes: { 6: truthFrac(6), 7: truthFrac(7) } });
    const got = suggestOn(source, line);
    expect(got.has(6) || got.has(7)).toBe(false);
    for (const [i, box] of got) expect(iou(box, fx.truth[i]), `syllable ${i}`).toBeGreaterThanOrEqual(0.5);
  });

  it("a legacy crop (syllableCuts image) holds its neume: no suggestion for it, the others stay aligned", () => {
    const cut: StoredImage = { dataUrl: "data:,", width: 1, height: 1, mimeType: "image/png" };
    const { source, line } = page({}, { 1: cut, 2: cut });
    const got = suggestOn(source, line);
    expect(got.has(1) || got.has(2)).toBe(false);
    expect(got.size).toBeGreaterThan(0);
    for (const [i, box] of got) expect(iou(box, fx.truth[i]), `syllable ${i}`).toBeGreaterThanOrEqual(0.5);
  });
});
