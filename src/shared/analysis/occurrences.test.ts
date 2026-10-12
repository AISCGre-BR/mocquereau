import { describe, expect, it } from "vitest";
import { occurrences } from "./occurrences";
import { makeAnalysisProject, TAG_GHOST, TAG_RASPAGEM, vocabulary as v } from "./__fixtures__/analysis-project";

const p = makeAnalysisProject();
const at = (pairs: Array<[string, number]>) => pairs.map(([sourceId, syllable]) => ({ sourceId, syllable }));

describe("occurrences", () => {
  it("pair disagreement → syllable 2 of E and SG", () => {
    expect(occurrences(p, {}, v, { kind: "pair", a: "E", b: "SG", agree: false })).toEqual(at([["E", 2], ["SG", 2]]));
  });

  it("pair agreement", () => {
    expect(occurrences(p, {}, v, { kind: "pair", a: "E", b: "L", agree: true }))
      .toEqual(at([["E", 0], ["E", 1], ["L", 0], ["L", 1]]));
  });

  it("progress status, optionally by source and section", () => {
    expect(occurrences(p, {}, v, { kind: "progress", status: "missing" })).toEqual(at([["E", 5], ["SG", 4], ["SG", 5]]));
    expect(occurrences(p, {}, v, { kind: "progress", status: "illegible" })).toEqual(at([["E", 2]]));
    expect(occurrences(p, {}, v, { kind: "progress", status: "missing", sectionId: "none" }))
      .toEqual(at([["E", 5], ["SG", 5]]));
    expect(occurrences(p, {}, v, { kind: "progress", status: "withBox", sourceId: "L" }))
      .toEqual(at([["L", 0], ["L", 1], ["L", 2]]));
    expect(occurrences(p, {}, v, { kind: "progress", status: "annotated", sourceId: "X" })).toEqual(at([["X", 0]]));
  });

  it("neume by real kind", () => {
    expect(occurrences(p, {}, v, { kind: "neume", kindId: "uncinus" })).toEqual(at([["L", 1]]));
    expect(occurrences(p, {}, v, { kind: "neume", kindId: "virga", sourceId: "L" })).toEqual(at([["L", 0], ["L", 2]]));
  });

  it("marks", () => {
    expect(occurrences(p, {}, v, { kind: "mark", key: "liq.augmentative" })).toEqual(at([["E", 3]]));
    expect(occurrences(p, {}, v, { kind: "mark", key: "letter.c" })).toEqual(at([["E", 3]]));
    expect(occurrences(p, {}, v, { kind: "mark", key: "certainty.unset", sourceId: "SG" }))
      .toEqual(at([["SG", 0], ["SG", 1], ["SG", 2], ["SG", 3]]));
  });

  it("syllable → sources with neumes there", () => {
    expect(occurrences(p, {}, v, { kind: "syllable", syllable: 2 })).toEqual(at([["E", 2], ["SG", 2], ["L", 2]]));
  });

  it("tag", () => {
    expect(occurrences(p, {}, v, { kind: "tag", tagId: TAG_RASPAGEM })).toEqual(at([["E", 3], ["SG", 3]]));
    expect(occurrences(p, {}, v, { kind: "tag", tagId: TAG_GHOST })).toEqual(at([["X", 0]]));
  });

  it("applies the filters first", () => {
    expect(occurrences(p, { certainty: ["unset"] }, v, { kind: "pair", a: "E", b: "SG", agree: false })).toEqual([]);
  });
});
