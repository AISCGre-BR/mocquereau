import { describe, it, expect } from "vitest";
import { validateProject } from "@shared/validate";
import { IMG_A, makeV2Project } from "./__fixtures__/projects";

type AnyObj = Record<string, any>;
const clone = (): AnyObj => structuredClone(makeV2Project()) as AnyObj;

describe("validateProject", () => {
  it("accepts a valid v2 project unchanged and without warnings", () => {
    const r = validateProject(makeV2Project());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.project).toEqual(makeV2Project());
  });

  it("rejects non-objects and other schema versions", () => {
    expect(validateProject(null).ok).toBe(false);
    expect(validateProject([]).ok).toBe(false);
    const p = clone();
    p.schemaVersion = 1;
    expect(validateProject(p).ok).toBe(false);
  });

  it("rejects structural errors: sources, source id, line image, words", () => {
    const noSources = clone();
    delete noSources.sources;
    expect(validateProject(noSources).ok).toBe(false);

    const noId = clone();
    delete noId.sources[0].id;
    expect(validateProject(noId).ok).toBe(false);

    const badImage = clone();
    badImage.sources[0].lines[0].image.imageId = "../../etc/passwd";
    expect(validateProject(badImage).ok).toBe(false);

    const badWords = clone();
    badWords.text.words = [{ original: "x" }];
    expect(validateProject(badWords).ok).toBe(false);
  });

  it("defaults absent dividers/gaps silently and warns on invalid ones", () => {
    const p = clone();
    delete p.sources[0].lines[0].dividers;
    p.sources[0].lines[0].gaps = "nope";
    const r = validateProject(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.sources[0].lines[0].dividers).toEqual([]);
    expect(r.project.sources[0].lines[0].gaps).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });

  it("falls back to manual hyphenation for unknown modes", () => {
    const p = clone();
    p.text.hyphenationMode = "klingon";
    const r = validateProject(p);
    expect(r.ok && r.project.text.hyphenationMode).toBe("manual");
  });

  it("drops invalid imageAdjustments and derives a missing confirmed flag", () => {
    const p = clone();
    p.sources[0].lines[0].imageAdjustments = { rotation: "x" };
    delete p.sources[0].lines[0].confirmed;
    const r = validateProject(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.sources[0].lines[0].imageAdjustments).toBeUndefined();
    expect(r.project.sources[0].lines[0].confirmed).toBe(true);
    expect(r.warnings.length).toBe(2);
  });

  it("drops invalid boxes and non-numeric keys", () => {
    const p = clone();
    p.sources[0].lines[0].syllableBoxes = { 0: { x: 0, y: 0, w: -1, h: 1 }, foo: null, 2: null };
    const r = validateProject(p);
    expect(r.ok && r.project.sources[0].lines[0].syllableBoxes).toEqual({ 2: null });
  });

  it("drops image map entries whose path does not match their id", () => {
    const p = clone();
    p.images[IMG_A].path = `images/${"b".repeat(64)}.png`;
    const r = validateProject(p);
    expect(r.ok && r.project.images).toEqual({});
  });

  it("keeps the missing flag on image references", () => {
    const p = clone();
    p.sources[0].lines[0].image.missing = true;
    const r = validateProject(p);
    expect(r.ok && r.project.sources[0].lines[0].image.missing).toBe(true);
  });
});
