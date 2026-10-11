import { describe, it, expect } from "vitest";
import { SUGGESTED_CLASSIFICATION } from "@shared/classification";
import type { BoxFrame } from "@shared/project-schema";
import type { ImageAdjustments, ManuscriptLine, MocquereauProject } from "./models";
import { blobs, boxesIn, page } from "./box-frame-detect.fixtures";
import { detectRealignments, linesToCheck, realignLegacyProject, storedBoxFrame } from "./box-frame-realign";

const R = (rotation: number, flipH = false, flipV = false): BoxFrame => ({ rotation, flipH, flipV });
const W = 600;
const H = 400;
const BLOBS = blobs(W, H);
const RASTER = page(W, H, BLOBS);

const ADJ = (rotation: number): ImageAdjustments => ({
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  invert: false,
  rotation,
  flipH: false,
  flipV: false,
});

function line(id: string, over: Partial<ManuscriptLine>): ManuscriptLine {
  return {
    id,
    image: { dataUrl: `data:${id}`, width: W, height: H, mimeType: "image/png" },
    syllableRange: { start: 0, end: BLOBS.length - 1 },
    dividers: [],
    gaps: [],
    confirmed: true,
    ...over,
  };
}

function project(lines: ManuscriptLine[]): MocquereauProject {
  return {
    meta: { title: "T", author: "", createdAt: "x", updatedAt: "x" },
    text: { raw: "", words: [], hyphenationMode: "sung" },
    sections: [],
    classification: SUGGESTED_CLASSIFICATION,
    sources: [
      {
        id: "S",
        order: 1,
        metadata: { siglum: "X", library: "", city: "", century: "", classes: [null, null, null] },
        lines,
        syllableCuts: {},
      },
    ],
  };
}

const load = async () => RASTER;
const immediate = async () => {};

describe("box-frame-realign", () => {
  const drawnAt0 = line("A", { imageAdjustments: ADJ(5), boxFrame: R(5), syllableBoxes: boxesIn(R(0), RASTER, BLOBS) });
  const drawnAt5 = line("B", { imageAdjustments: ADJ(5), boxFrame: R(5), syllableBoxes: boxesIn(R(5), RASTER, BLOBS) });
  const plain = line("C", { syllableBoxes: boxesIn(R(0), RASTER, BLOBS) });
  const empty = line("D", { imageAdjustments: ADJ(5) });

  it("checks only rotated/flipped lines with boxes", () => {
    expect(linesToCheck(project([drawnAt0, drawnAt5, plain, empty])).map((l) => l.line.id)).toEqual(["A", "B"]);
  });

  it("storedBoxFrame falls back to the current adjustments", () => {
    expect(storedBoxFrame({ imageAdjustments: ADJ(7) })).toEqual(R(7));
    expect(storedBoxFrame({ imageAdjustments: ADJ(7), boxFrame: R(0) })).toEqual(R(0));
  });

  it("reports the line whose boxes were drawn at 0 and leaves the others", async () => {
    const found = await detectRealignments(project([drawnAt0, drawnAt5, plain, empty]), load, { yieldFn: immediate });
    expect(found.map((f) => f.lineId)).toEqual(["A"]);
    expect(found[0].from).toEqual(R(5));
    expect(found[0].to).toEqual(R(0));
  });

  it("skips lines whose image cannot be decoded", async () => {
    const found = await detectRealignments(project([drawnAt0]), async () => null, { yieldFn: immediate });
    expect(found).toEqual([]);
  });

  it("returns nothing when cancelled", async () => {
    const found = await detectRealignments(project([drawnAt0]), load, { yieldFn: immediate, isCancelled: () => true });
    expect(found).toEqual([]);
  });

  it("realignLegacyProject stores the ink's frame on the lines that need it", async () => {
    const p = project([drawnAt0, drawnAt5, plain]);
    const out = await realignLegacyProject(p, load, { yieldFn: immediate });
    const [a, b, c] = out.sources[0].lines;
    expect(a.boxFrame).toEqual(R(0));
    expect(a.syllableBoxes).toBe(drawnAt0.syllableBoxes);
    expect(b).toBe(drawnAt5);
    expect(c).toBe(plain);
  });

  it("realignLegacyProject keeps the project as read when nothing changes or the loader throws", async () => {
    const p = project([drawnAt0]);
    const boom = async () => {
      throw new Error("decode failed");
    };
    expect(await realignLegacyProject(p, boom, { yieldFn: immediate })).toBe(p);
    const failingYield = async () => {
      throw new Error("yield failed");
    };
    expect(await realignLegacyProject(p, load, { yieldFn: failingYield })).toBe(p);
    const settled = project([drawnAt5]);
    expect(await realignLegacyProject(settled, load, { yieldFn: immediate })).toBe(settled);
  });
});
