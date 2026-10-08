import { describe, expect, it } from "vitest";
import { resolveUnsetRanges, suggestRangeForNewPage } from "./sources";
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
