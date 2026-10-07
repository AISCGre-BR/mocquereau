import { describe, it, expect } from "vitest";
import type { BoxFrame } from "@shared/project-schema";
import type { ImageAdjustments, ManuscriptLine, MocquereauProject } from "./models";
import { blobs, boxesIn, page } from "./box-frame-detect.fixtures";
import { detectRealignments, linesToCheck, storedBoxFrame } from "./box-frame-realign";

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
    sources: [
      {
        id: "S",
        order: 1,
        metadata: { siglum: "X", library: "", city: "", century: "", folio: "", notation: "square" },
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
});
