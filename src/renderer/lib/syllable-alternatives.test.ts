import { describe, expect, it } from "vitest";
import { ambiguousWords, modeSample } from "./syllable-alternatives";

const GLORIA =
  "Glória in excélsis Deo\nGrátias ágimus tibi propter magnam glóriam tuam\nDómine Deus, Rex caeléstis";

describe("modeSample", () => {
  it("picks the first line with a divergence and flags words that differ from sung", () => {
    const s = modeSample(GLORIA);
    expect(s.sung.map((w) => w.syllables.join("-"))[0]).toBe("Gló-ri-a");
    // first line already diverges (classical: Gló-ria)
    expect(s.classical[0]).toEqual({ syllables: ["Gló", "ria"], differs: true });
    expect(s.sung.every((w) => !w.differs)).toBe(true);
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
