import { describe, expect, it } from "vitest";
import { progressBySection, progressBySource } from "./progress";
import { makeAnalysisProject, vocabulary as v } from "./__fixtures__/analysis-project";

const p = makeAnalysisProject();

describe("progressBySource", () => {
  it("counts boxes, annotations, illegible and missing per source", () => {
    expect(progressBySource(p, {}, v)).toEqual([
      { key: "E", label: "E", total: 6, withBox: 6, annotated: 5, illegible: 1, missing: 1 },
      { key: "SG", label: "SG", total: 6, withBox: 6, annotated: 4, illegible: 0, missing: 2 },
      { key: "L", label: "L", total: 6, withBox: 3, annotated: 3, illegible: 0, missing: 0 },
      { key: "X", label: "X", total: 6, withBox: 0, annotated: 1, illegible: 0, missing: 0 },
    ]);
  });

  it("applies the certainty filter before counting", () => {
    const e = progressBySource(p, { certainty: ["unset"] }, v).find((r) => r.key === "E")!;
    expect(e).toMatchObject({ total: 5, annotated: 4, illegible: 0, missing: 1 });
  });
});

describe("progressBySection", () => {
  it("aggregates sources per section and puts syllables outside sections in \"none\"", () => {
    expect(progressBySection(p, {}, v)).toEqual([
      { key: "s1", label: "Primeira", total: 8, withBox: 6, annotated: 7, illegible: 0, missing: 0 },
      { key: "s2", label: "Segunda", total: 12, withBox: 7, annotated: 6, illegible: 1, missing: 1 },
      { key: "none", label: "", total: 4, withBox: 2, annotated: 0, illegible: 0, missing: 2 },
    ]);
  });

  it("omits the \"none\" row when every syllable is in a section", () => {
    const rows = progressBySection(p, { sectionIds: ["s1"] }, v);
    expect(rows.map((r) => r.key)).toEqual(["s1"]);
  });
});
