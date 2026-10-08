import { describe, expect, it } from "vitest";
import { groupSourcesByLevel1, resolveUnsetRanges, suggestRangeForNewPage } from "./sources";
import { createNewProject } from "../hooks/useProject";
import type { ManuscriptLine, ManuscriptSource, MocquereauProject } from "./models";

const IMG = { dataUrl: "data:,", width: 1, height: 1, mimeType: "image/png" };
const BOX = { x: 0, y: 0, w: 0.1, h: 0.1 };
const line = (id: string, start: number, end: number, over: Partial<ManuscriptLine> = {}): ManuscriptLine => ({
  id, image: IMG, syllableRange: { start, end }, dividers: [], gaps: [], confirmed: false, ...over,
});
const source = (lines: ManuscriptLine[]): ManuscriptSource => ({
  id: "S", order: 1, metadata: { siglum: "S", library: "", city: "", century: "", classes: [null, null, null] },
  lines, syllableCuts: {},
});
function project(lines: ManuscriptLine[], syllables = 6): MocquereauProject {
  return {
    ...createNewProject("T", ""),
    text: { raw: "", words: [{ original: "x", syllables: Array.from({ length: syllables }, (_, i) => `s${i}`) }], hyphenationMode: "sung" },
    sources: [source(lines)],
  };
}

describe("suggestRangeForNewPage", () => {
  it("starts after the last confirmed page and runs to the end of the text", () => {
    const s = source([line("a", 0, 2, { confirmed: true }), line("b", 3, 3)]);
    expect(suggestRangeForNewPage(s, 6)).toEqual({ start: 3, end: 5 });
  });
  it("first page: the whole text", () => {
    expect(suggestRangeForNewPage(source([]), 6)).toEqual({ start: 0, end: 5 });
  });
  it("everything confirmed: stays inside the text", () => {
    expect(suggestRangeForNewPage(source([line("a", 0, 5, { confirmed: true })]), 6)).toEqual({ start: 5, end: 5 });
  });
});

describe("resolveUnsetRanges", () => {
  it("{0,0} without boxes becomes the whole text", () => {
    const p = resolveUnsetRanges(project([line("a", 0, 0, { syllableBoxes: { 0: null } })]));
    expect(p.sources[0].lines[0].syllableRange).toEqual({ start: 0, end: 5 });
  });
  it("{0,0} with a box is a real one-syllable range and stays", () => {
    const p0 = project([line("a", 0, 0, { syllableBoxes: { 0: BOX } }), line("b", 1, 3)]);
    expect(resolveUnsetRanges(p0)).toBe(p0);
  });
  it("text with one syllable or none: nothing to resolve", () => {
    const p0 = project([line("a", 0, 0)], 1);
    expect(resolveUnsetRanges(p0)).toBe(p0);
  });
});

describe("groupSourcesByLevel1", () => {
  const classification = createNewProject("T", "").classification;
  const [v0, v1] = classification[0].values;
  const src = (id: string, order: number, cls: string | null): ManuscriptSource => ({
    ...source([]), id, order, metadata: { ...source([]).metadata, siglum: id, classes: [cls, null, null] },
  });

  it("groups by the level-1 value in classification order, the sources without one last", () => {
    const groups = groupSourcesByLevel1(
      [src("none", 1, null), src("b1", 2, v1.id), src("a1", 3, v0.id), src("b2", 4, v1.id), src("gone", 5, "x.y")],
      classification,
    );
    expect(groups.map((g) => g.value?.id ?? null)).toEqual([v0.id, v1.id, null]);
    expect(groups.map((g) => g.sources.map((s) => s.id))).toEqual([["a1"], ["b1", "b2"], ["none", "gone"]]);
  });

  it("orders each group by source.order", () => {
    const groups = groupSourcesByLevel1([src("late", 3, v0.id), src("early", 1, v0.id)], classification);
    expect(groups[0].sources.map((s) => s.id)).toEqual(["early", "late"]);
  });
});
