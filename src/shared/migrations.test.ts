import { describe, it, expect } from "vitest";
import {
  MigrationError,
  assertSupportedSchema,
  migrateLegacyProject,
  migrateToCurrent,
} from "@shared/migrations";
import { MISSING_IMAGE_ID, sha256Hex } from "@shared/image-id";
import { JPEG_BYTES, PNG_BYTES, makeLegacyProject, makeV2Project } from "./__fixtures__/projects";

type AnyObj = Record<string, any>;

describe("migrateLegacyProject", () => {
  it("deduplicates an image shared by two lines", async () => {
    const r = await migrateLegacyProject(makeLegacyProject());
    const [a, b] = r.project.sources[0].lines;
    const pngId = await sha256Hex(PNG_BYTES);
    expect(a.image.imageId).toBe(pngId);
    expect(b.image.imageId).toBe(pngId);
    expect(r.images.size).toBe(2);
    expect(Object.keys(r.project.images).sort()).toEqual([...r.images.keys()].sort());
    expect(r.project.images[pngId]).toEqual({
      path: `images/${pngId}.png`, mimeType: "image/png", byteLength: PNG_BYTES.byteLength,
    });
  });

  it("uses the sniffed MIME for a JPEG cut declared as PNG", async () => {
    const r = await migrateLegacyProject(makeLegacyProject());
    const cut = r.project.sources[0].syllableCuts[0]!;
    expect(cut.imageId).toBe(await sha256Hex(JPEG_BYTES));
    expect(cut.mimeType).toBe("image/jpeg");
    expect(r.project.sources[0].syllableCuts[1]).toBeNull();
    expect(r.images.get(cut.imageId)?.mimeType).toBe("image/jpeg");
  });

  it("normalizes rotation and maps liturgical hyphenation", async () => {
    const r = await migrateLegacyProject(makeLegacyProject());
    expect(r.project.sources[0].lines[0].imageAdjustments?.rotation).toBe(270);
    expect(r.project.text.hyphenationMode).toBe("liturgical-typographic");
    expect(r.project.schemaVersion).toBe(2);
  });

  it("stores boxFrame and reports ambiguous lines under the default policy", async () => {
    const legacy = makeLegacyProject() as AnyObj;
    const r = await migrateLegacyProject(legacy);
    const [a, b] = r.project.sources[0].lines;
    expect(a.boxFrame).toEqual({ rotation: 270, flipH: false, flipV: false });
    expect(b.boxFrame).toEqual({ rotation: 17.5, flipH: false, flipV: false });
    expect(a.syllableBoxes).toEqual(legacy.sources[0].lines[0].syllableBoxes);
    expect(r.ambiguousLines).toEqual([{ sourceId: "src-1", lineId: "line-a" }]);
  });

  it("keeps an unreadable image as a missing placeholder with a warning", async () => {
    const legacy = makeLegacyProject() as AnyObj;
    legacy.sources[0].lines[1].image.dataUrl = "data:image/x-foo;base64,AAAA";
    const r = await migrateLegacyProject(legacy);
    const img = r.project.sources[0].lines[1].image;
    expect(img.missing).toBe(true);
    expect(img.imageId).toBe(MISSING_IMAGE_ID);
    expect(r.project.images[MISSING_IMAGE_ID]).toBeUndefined();
    expect(r.warnings.some((w) => w.includes("lines[1].image"))).toBe(true);
  });

  it("rejects non-objects and files that already have schemaVersion", async () => {
    await expect(migrateLegacyProject("x")).rejects.toMatchObject({ code: "invalid" });
    await expect(migrateLegacyProject({ schemaVersion: 2 })).rejects.toMatchObject({ code: "not-legacy" });
  });

  it("rejects a legacy file with a structurally broken line", async () => {
    const legacy = makeLegacyProject() as AnyObj;
    delete legacy.sources[0].lines[0].id;
    await expect(migrateLegacyProject(legacy)).rejects.toBeInstanceOf(MigrationError);
  });

  it("does not mutate its input", async () => {
    const legacy = makeLegacyProject();
    const before = JSON.stringify(legacy);
    await migrateLegacyProject(legacy);
    expect(JSON.stringify(legacy)).toBe(before);
  });
});

describe("assertSupportedSchema / migrateToCurrent", () => {
  it("accepts a valid v2 project", () => {
    const r = migrateToCurrent(makeV2Project());
    expect(r.project).toEqual(makeV2Project());
    expect(r.warnings).toEqual([]);
  });

  it("refuses newer schema versions, reporting the creating app version", () => {
    const p = { ...makeV2Project(), schemaVersion: 3, app: { name: "mocquereau", version: "9.9.9" } };
    expect(() => assertSupportedSchema(p)).toThrow(MigrationError);
    try {
      migrateToCurrent(p);
    } catch (e) {
      expect(e).toMatchObject({ code: "newer", version: "9.9.9" });
    }
  });

  it("refuses missing or non-integer schemaVersion", () => {
    expect(() => migrateToCurrent({ ...makeV2Project(), schemaVersion: undefined })).toThrow(/schemaVersion/);
    expect(() => migrateToCurrent({ ...makeV2Project(), schemaVersion: 1.5 })).toThrow(MigrationError);
  });

  it("refuses an invalid v2 project with details", () => {
    const p = makeV2Project() as AnyObj;
    p.sources = "nope";
    try {
      migrateToCurrent(p);
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({ code: "invalid" });
      expect((e as MigrationError).details.length).toBeGreaterThan(0);
    }
  });
});
