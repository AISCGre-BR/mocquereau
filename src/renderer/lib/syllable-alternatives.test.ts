import { describe, expect, it } from "vitest";
import { ambiguousWords, modeSample } from "./syllable-alternatives";

const GLORIA =
  "Glória in excélsis Deo\nGrátias ágimus tibi propter magnam glóriam tuam\nDómine Deus, Rex caeléstis";

describe("modeSample", () => {
  it("prefers the first line where sung and typographic differ and flags words that differ from sung", () => {
    const s = modeSample(GLORIA);
    // the first line diverges only in classical/modern (Gló-ria); the second has pro-pter / prop-ter
    expect(s.sung.map((w) => w.syllables.join("-"))[0]).toBe("Grá-ti-as");
    const propter = s.sung.findIndex((w) => w.syllables.join("") === "propter");
    expect(s.sung[propter].syllables).toEqual(["pro", "pter"]);
    expect(s["liturgical-typographic"][propter]).toEqual({ syllables: ["prop", "ter"], differs: true });
    expect(s.sung.every((w) => !w.differs)).toBe(true);
  });
  it("without a sung/typographic divergence picks the first line with any divergence", () => {
    const s = modeSample("in te\nGlória in excélsis Deo");
    expect(s.sung.map((w) => w.syllables.join("-"))[0]).toBe("Gló-ri-a");
    expect(s.classical[0]).toEqual({ syllables: ["Gló", "ria"], differs: true });
  });
  it("returns empty samples for an empty text", () => {
    const s = modeSample("");
    expect(s.sung).toEqual([]);
    expect(s.classical).toEqual([]);
  });
  it("falls back to the first 12 words when no mode diverges", () => {
    const raw = "in ad me es tu te in ad me es tu te in ad";
    const s = modeSample(raw);
    expect(s.sung).toHaveLength(12);
    expect(Object.values(s).flat().some((w) => w.differs)).toBe(false);
  });
});

describe("ambiguousWords", () => {
  it("finds sung vs typographic ambiguities", () => {
    const m = ambiguousWords(GLORIA);
    const propter = [...m.entries()].find(([, a]) => a.sung.join("") === "propter");
    expect(propter?.[1]).toEqual({ sung: ["pro", "pter"], typographic: ["prop", "ter"] });
    expect([...m.values()].some((a) => a.sung.join("") === "Glória")).toBe(false);
  });
});
