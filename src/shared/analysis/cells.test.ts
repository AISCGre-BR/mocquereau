import { describe, expect, it } from "vitest";
import { sectionOfSyllable, selectCells } from "./cells";
import { makeAnalysisProject, TAG_RASPAGEM } from "./__fixtures__/analysis-project";

const p = makeAnalysisProject();

describe("sectionOfSyllable", () => {
  it("maps global syllable indices to the section of their word", () => {
    expect(sectionOfSyllable(p.text.words, p.sections, 0)).toBe("s1");
    expect(sectionOfSyllable(p.text.words, p.sections, 1)).toBe("s1");
    expect(sectionOfSyllable(p.text.words, p.sections, 2)).toBe("s2");
    expect(sectionOfSyllable(p.text.words, p.sections, 4)).toBe("s2");
    expect(sectionOfSyllable(p.text.words, p.sections, 5)).toBeNull();
    expect(sectionOfSyllable(p.text.words, p.sections, 99)).toBeNull();
  });
});

describe("selectCells", () => {
  it("returns one cell per source and syllable without filters", () => {
    const { sources, cells } = selectCells(p, {});
    expect(sources.map((s) => s.id)).toEqual(["E", "SG", "L", "X"]);
    expect(cells).toHaveLength(24);
    const e5 = cells.find((c) => c.sourceId === "E" && c.syllable === 5)!;
    expect(e5).toMatchObject({ hasBox: true, sectionId: null });
    expect(e5.annotation).toBeUndefined();
    expect(cells.find((c) => c.sourceId === "SG" && c.syllable === 4)!.hasBox).toBe(true);
    expect(cells.find((c) => c.sourceId === "L" && c.syllable === 3)!.hasBox).toBe(false);
    expect(cells.filter((c) => c.sourceId === "X" && c.hasBox)).toHaveLength(0);
  });

  it("filters sources by id and by class value", () => {
    expect(selectCells(p, { sourceIds: ["SG", "X"] }).sources.map((s) => s.id)).toEqual(["SG", "X"]);
    expect(selectCells(p, { classValueIds: ["familia.laon"] }).sources.map((s) => s.id)).toEqual(["L"]);
    expect(selectCells(p, { sourceIds: [] }).sources).toHaveLength(4);
  });

  it("filters syllables by section (\"none\" = outside any section)", () => {
    const { cells } = selectCells(p, { sectionIds: ["none"] });
    expect(new Set(cells.map((c) => c.syllable))).toEqual(new Set([5]));
    const s1 = selectCells(p, { sectionIds: ["s1"] }).cells;
    expect(new Set(s1.map((c) => c.syllable))).toEqual(new Set([0, 1]));
  });

  it("filters by tag (syllable or neume) and leaves only syllable 3 for raspagem", () => {
    const { cells } = selectCells(p, { tagIds: [TAG_RASPAGEM] });
    expect(cells.map((c) => [c.sourceId, c.syllable])).toEqual([["E", 3], ["SG", 3]]);
    const ghost = selectCells(p, { tagIds: ["tag.apagada"] }).cells;
    expect(ghost.map((c) => [c.sourceId, c.syllable])).toEqual([["X", 0]]);
  });

  it("filters by certainty, with unset for missing certainty", () => {
    const unset = selectCells(p, { certainty: ["unset"] }).cells.filter((c) => c.sourceId === "E");
    expect(unset.map((c) => c.syllable)).toEqual([0, 1, 3, 4, 5]);
    const ill = selectCells(p, { certainty: ["illegible"] }).cells;
    expect(ill.map((c) => [c.sourceId, c.syllable])).toEqual([["E", 2]]);
  });
});
