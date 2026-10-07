import { describe, it, expect, vi } from "vitest";
import type { ImageRef, InlineImage } from "@shared/project-schema";
import {
  dehydrateProject,
  hydrateProject,
  markMissingImages,
  rewriteImageIds,
  type ResolvedImage,
} from "@shared/project-adapter";
import { MISSING_IMAGE_ID } from "@shared/image-id";
import { IMG_A, makeV2Project } from "./__fixtures__/projects";

const B = "b".repeat(64);
const url = (ref: ImageRef) => `data:${ref.mimeType};base64,${ref.imageId.slice(0, 4)}`;

describe("hydrateProject", () => {
  it("inlines data URLs and keeps imageId, boxFrame and boxes", () => {
    const s = hydrateProject(makeV2Project(), url);
    const line = s.sources[0].lines[0];
    expect(line.image).toEqual({
      dataUrl: "data:image/png;base64,aaaa", imageId: IMG_A, width: 200, height: 100, mimeType: "image/png",
    });
    expect(line.boxFrame).toEqual({ rotation: 90, flipH: false, flipV: false });
    expect(line.syllableBoxes).toEqual(makeV2Project().sources[0].lines[0].syllableBoxes);
    expect("schemaVersion" in s).toBe(false);
    expect("images" in s).toBe(false);
  });

  it("gives missing images an empty data URL without asking for bytes", () => {
    const file = makeV2Project();
    file.sources[0].lines[0].image.missing = true;
    const dataUrlOf = vi.fn(url);
    const s = hydrateProject(file, dataUrlOf);
    expect(s.sources[0].lines[0].image.dataUrl).toBe("");
    expect(dataUrlOf).not.toHaveBeenCalled();
  });
});

describe("dehydrateProject", () => {
  const resolveAsA = async (img: InlineImage): Promise<ResolvedImage> => ({
    ref: { imageId: IMG_A, width: img.width, height: img.height, mimeType: "image/png" },
    byteLength: 16,
  });

  it("round-trips hydrate -> dehydrate to the same project.json", async () => {
    const { file, unresolved } = await dehydrateProject(hydrateProject(makeV2Project(), url), resolveAsA, "0.0.8-alpha");
    expect(unresolved).toBe(0);
    expect(file).toEqual(makeV2Project());
  });

  it("round-trips classification and source classes", async () => {
    const file = makeV2Project();
    file.classification = [
      { id: "lv1", name: "Mine", values: [{ id: "v1", name: "One" }] },
      file.classification[1],
      file.classification[2],
    ];
    file.sources[0].metadata.classes = ["v1", null, "gru.sg"];
    const session = hydrateProject(file, url);
    expect(session.classification).toEqual(file.classification);
    expect(session.sources[0].metadata.classes).toEqual(["v1", null, "gru.sg"]);
    const out = await dehydrateProject(session, resolveAsA, "0.0.8-alpha");
    expect(out.file.classification).toEqual(file.classification);
    expect(out.file.sources[0].metadata.classes).toEqual(["v1", null, "gru.sg"]);
  });

  it("always writes boxFrame for a line with boxes (absent -> current adjustments)", async () => {
    const session = hydrateProject(makeV2Project(), url);
    delete session.sources[0].lines[0].boxFrame;
    const { file } = await dehydrateProject(session, resolveAsA, "x");
    expect(file.sources[0].lines[0].boxFrame).toEqual({ rotation: 90, flipH: false, flipV: false });
  });

  it("keeps a boxFrame that differs from the current adjustments", async () => {
    const session = hydrateProject(makeV2Project(), url);
    session.sources[0].lines[0].boxFrame = { rotation: 0, flipH: true, flipV: false };
    const { file } = await dehydrateProject(session, resolveAsA, "x");
    expect(file.sources[0].lines[0].boxFrame).toEqual({ rotation: 0, flipH: true, flipV: false });
  });

  it("lists an image shared by two lines once", async () => {
    const session = hydrateProject(makeV2Project(), url);
    session.sources[0].lines.push({ ...session.sources[0].lines[0], id: "line-b" });
    const { file } = await dehydrateProject(session, resolveAsA, "x");
    expect(Object.keys(file.images)).toEqual([IMG_A]);
  });

  it("counts unresolved images and keeps a valid placeholder id", async () => {
    const session = hydrateProject(makeV2Project(), url);
    session.sources[0].syllableCuts[5] = { dataUrl: "data:,", width: 1, height: 1, mimeType: "image/png" };
    const resolve = async (img: InlineImage) => (img.dataUrl === "data:," ? null : resolveAsA(img));
    const { file, unresolved } = await dehydrateProject(session, resolve, "x");
    expect(unresolved).toBe(1);
    expect(file.sources[0].syllableCuts[5]).toMatchObject({ imageId: MISSING_IMAGE_ID, missing: true });
    expect(Object.keys(file.images)).toEqual([IMG_A]);
  });

  it("keeps known-missing placeholders out of the image map", async () => {
    const resolve = async (img: InlineImage): Promise<ResolvedImage> => ({
      ref: { imageId: img.imageId!, width: img.width, height: img.height, mimeType: img.mimeType, missing: true },
      byteLength: 0,
    });
    const { file, unresolved } = await dehydrateProject(hydrateProject(makeV2Project(), url), resolve, "x");
    expect(unresolved).toBe(0);
    expect(file.images).toEqual({});
    expect(file.sources[0].lines[0].image.missing).toBe(true);
  });
});

describe("markMissingImages / rewriteImageIds", () => {
  it("marks references whose bytes are not available", () => {
    const { file, missing } = markMissingImages(makeV2Project(), new Set());
    expect(missing).toEqual([IMG_A]);
    expect(file.images).toEqual({});
    expect(file.sources[0].lines[0].image.missing).toBe(true);
  });

  it("leaves available references untouched", () => {
    const original = makeV2Project();
    const { file, missing } = markMissingImages(original, new Set([IMG_A]));
    expect(missing).toEqual([]);
    expect(file).toEqual(original);
  });

  it("rewrites ids in references and in the image map", () => {
    const file = rewriteImageIds(makeV2Project(), new Map([[IMG_A, B]]));
    expect(file.sources[0].lines[0].image.imageId).toBe(B);
    expect(file.images).toEqual({ [B]: { path: `images/${B}.png`, mimeType: "image/png", byteLength: 16 } });
  });
});
