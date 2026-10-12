import { describe, expect, it } from "vitest";
import { tagCounts } from "./tag-counts";
import { makeAnalysisProject, TAG_GHOST, TAG_RASPAGEM } from "./__fixtures__/analysis-project";

const p = makeAnalysisProject();

describe("tagCounts", () => {
  it("counts once per syllable and flags ids missing from the project as unknown", () => {
    expect(tagCounts(p, {})).toEqual([
      { tagId: TAG_RASPAGEM, name: "raspagem", group: "suporte", bySource: { E: 1, SG: 1, L: 0, X: 0 } },
      { tagId: TAG_GHOST, name: TAG_GHOST, group: null, bySource: { E: 0, SG: 0, L: 0, X: 1 }, unknown: true },
    ]);
  });

  it("counts a syllable once even when the tag is on the syllable and on a neume", () => {
    const q = makeAnalysisProject();
    q.sources[0].annotations![3].neumes[0].tags = [TAG_RASPAGEM];
    expect(tagCounts(q, {})[0].bySource.E).toBe(1);
  });

  it("respects the source filter", () => {
    expect(tagCounts(p, { sourceIds: ["SG"] })[0].bySource).toEqual({ SG: 1 });
  });
});
