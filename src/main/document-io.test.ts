import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PACKAGE_MIMETYPE } from "@shared/project-schema";
import { DocumentError, openDocument, saveDocument, toDataUrl } from "./document-io";
import { SessionStore } from "./session-store";
import { listEntries, writeZip } from "./__fixtures__/zip";
import { IMG_A, JPEG_BYTES, PNG_BYTES, makeLegacyProject, makeV2Project } from "../shared/__fixtures__/projects";

let dir: string;
let store: SessionStore;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mocq-doc-"));
  store = await SessionStore.create(join(dir, "sessions"), "s1");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

async function writeLegacy(): Promise<string> {
  const path = join(dir, "Puer natus.mocquereau.json");
  await writeFile(path, JSON.stringify(makeLegacyProject(), null, 2), "utf-8");
  return path;
}

describe("openDocument — legacy", () => {
  it("migrates, deduplicates into the session and hydrates data URLs", async () => {
    const doc = await openDocument(await writeLegacy(), store);
    expect(doc.format).toBe("legacy");
    const [a, b] = doc.project.sources[0].lines;
    expect(a.image.imageId).toBe(sha(PNG_BYTES));
    expect(b.image.imageId).toBe(sha(PNG_BYTES));
    expect(a.image.dataUrl).toBe(toDataUrl("image/png", PNG_BYTES));
    expect(doc.project.sources[0].syllableCuts[0]?.dataUrl).toBe(toDataUrl("image/jpeg", JPEG_BYTES));
    expect(store.listImageIds().sort()).toEqual([sha(PNG_BYTES), sha(JPEG_BYTES)].sort());
    expect(a.imageAdjustments?.rotation).toBe(270);
    expect(a.boxFrame).toEqual({ rotation: 270, flipH: false, flipV: false });
    expect(doc.ambiguousLines).toEqual([{ sourceId: "src-1", lineId: "line-a" }]);
  });
});

describe("saveDocument + reopen", () => {
  it("saves a legacy project as a package and reopens it identically, legacy untouched", async () => {
    const legacyPath = await writeLegacy();
    const before = await readFile(legacyPath);
    const doc = await openDocument(legacyPath, store);
    const target = join(dir, "Puer natus.mocquereau");
    await saveDocument(doc.project, target, store, "0.0.8-alpha");

    expect(await readFile(legacyPath)).toEqual(before);
    const names = (await listEntries(target)).map((e) => e.fileName);
    expect(names.filter((n) => n.startsWith("images/"))).toHaveLength(2);

    const fresh = await SessionStore.create(join(dir, "sessions"), "s2");
    const reopened = await openDocument(target, fresh);
    expect(reopened.format).toBe("package");
    expect(reopened.warnings).toEqual([]);
    expect(reopened.project).toEqual(doc.project);
  });

  it("save/reopen keeps a boxFrame that differs from the current rotation", async () => {
    const doc = await openDocument(await writeLegacy(), store);
    const line = doc.project.sources[0].lines[0];
    line.boxFrame = { rotation: 0, flipH: false, flipV: false }; // drawn at 0, then rotated
    const target = join(dir, "frame.mocquereau");
    await saveDocument(doc.project, target, store, "x");
    const reopened = await openDocument(target, await SessionStore.create(join(dir, "sessions"), "s4"));
    const again = reopened.project.sources[0].lines[0];
    expect(again.boxFrame).toEqual({ rotation: 0, flipH: false, flipV: false });
    expect(again.imageAdjustments?.rotation).toBe(270);
    expect(again.syllableBoxes).toEqual(line.syllableBoxes);
  });

  it("stores a newly imported image that has no imageId yet", async () => {
    const doc = await openDocument(await writeLegacy(), store);
    const newBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 7, 7, 7]);
    doc.project.sources[0].lines.push({
      ...doc.project.sources[0].lines[0],
      id: "line-new",
      image: { dataUrl: toDataUrl("image/jpeg", newBytes), width: 5, height: 5, mimeType: "image/jpeg" },
    });
    const target = join(dir, "out.mocquereau");
    await saveDocument(doc.project, target, store, "x");
    const reopened = await openDocument(target, await SessionStore.create(join(dir, "sessions"), "s3"));
    const line = reopened.project.sources[0].lines.find((l) => l.id === "line-new")!;
    expect(line.image.imageId).toBe(sha(newBytes));
    expect(line.image.dataUrl).toBe(toDataUrl("image/jpeg", newBytes));
  });

  it("aborts without touching the target when an image cannot be decoded", async () => {
    const doc = await openDocument(await writeLegacy(), store);
    doc.project.sources[0].lines[1].image = { dataUrl: "data:image/png;base64,@@@", width: 1, height: 1, mimeType: "image/png" };
    const target = join(dir, "bad.mocquereau");
    await expect(saveDocument(doc.project, target, store, "x")).rejects.toMatchObject({
      code: "missing-images", info: { count: 1 },
    });
    expect(existsSync(target)).toBe(false);
  });

  it("keeps the previous file when the final rename fails", async () => {
    const doc = await openDocument(await writeLegacy(), store);
    const target = join(dir, "keep.mocquereau");
    await writeFile(target, "OLD");
    const failing = async () => {
      throw Object.assign(new Error("locked"), { code: "EIO" });
    };
    await expect(saveDocument(doc.project, target, store, "x", { rename: failing })).rejects.toMatchObject({ code: "io" });
    expect(await readFile(target, "utf-8")).toBe("OLD");
  });
});

describe("image types the app does not know (S4)", () => {
  it("round-trips AVIF and SVG legacy images byte for byte through a package", async () => {
    const avif = Uint8Array.from([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2"/>');
    const legacy = makeLegacyProject() as any;
    legacy.sources[0].lines[0].image = { dataUrl: toDataUrl("image/avif", avif), width: 4, height: 2, mimeType: "image/avif" };
    legacy.sources[0].lines[1].image = { dataUrl: toDataUrl("image/svg+xml", svg), width: 4, height: 2, mimeType: "image/svg+xml" };
    const legacyPath = join(dir, "types.mocquereau.json");
    await writeFile(legacyPath, JSON.stringify(legacy), "utf-8");

    const doc = await openDocument(legacyPath, store);
    expect(doc.missingImages).toBe(0);
    const target = join(dir, "types.mocquereau");
    await saveDocument(doc.project, target, store, "x");
    const names = (await listEntries(target)).map((e) => e.fileName);
    expect(names).toContain(`images/${sha(avif)}.avif`);
    expect(names).toContain(`images/${sha(svg)}.svg`);

    const reopened = await openDocument(target, await SessionStore.create(join(dir, "sessions"), "s9"));
    const [a, b] = reopened.project.sources[0].lines;
    expect(a.image.dataUrl).toBe(toDataUrl("image/avif", avif));
    expect(b.image.dataUrl).toBe(toDataUrl("image/svg+xml", svg));
    expect(reopened.missingImages).toBe(0);
    expect(reopened.warnings).toEqual([]);
  });

  it("counts images that could not be decoded so the user can be told on open", async () => {
    const legacy = makeLegacyProject() as any;
    legacy.sources[0].lines[1].image.dataUrl = "data:image/png;base64,";
    const legacyPath = join(dir, "broken.mocquereau.json");
    await writeFile(legacyPath, JSON.stringify(legacy), "utf-8");
    const doc = await openDocument(legacyPath, store);
    expect(doc.missingImages).toBe(1);
    expect(doc.warnings.some((w) => w.includes("lines[1].image"))).toBe(true);
  });
});

describe("openDocument — damaged packages", () => {
  it("opens images missing from the package as placeholders and saves them again", async () => {
    const path = join(dir, "missing.mocquereau");
    await writeZip(path, [
      { name: "mimetype", data: PACKAGE_MIMETYPE },
      { name: "project.json", data: JSON.stringify(makeV2Project()), compress: true },
    ]);
    const doc = await openDocument(path, store);
    expect(doc.warnings).toContain(`missing image: ${IMG_A}`);
    expect(doc.missingImages).toBe(1);
    expect(doc.project.sources[0].lines[0].image).toMatchObject({ dataUrl: "", imageId: IMG_A });

    const target = join(dir, "resaved.mocquereau");
    await saveDocument(doc.project, target, store, "x");
    const again = await openDocument(target, store);
    expect(again.project.sources[0].lines[0].image.dataUrl).toBe("");
  });

  it("counts an unreadable image entry as missing so the open dialog reports it (N1)", async () => {
    const path = join(dir, "unreadable.mocquereau");
    await writeZip(path, [
      { name: "mimetype", data: PACKAGE_MIMETYPE },
      { name: "project.json", data: JSON.stringify(makeV2Project()), compress: true },
      { name: `images/${IMG_A}.png`, data: Buffer.alloc(0) },
    ]);
    const doc = await openDocument(path, store);
    expect(doc.missingImages).toBe(1);
    expect(doc.project.sources[0].lines[0].image.dataUrl).toBe("");
  });

  it("accepts an image under its real hash when the entry name lies", async () => {
    const path = join(dir, "liar.mocquereau");
    await writeZip(path, [
      { name: "mimetype", data: PACKAGE_MIMETYPE },
      { name: "project.json", data: JSON.stringify(makeV2Project()), compress: true },
      { name: `images/${IMG_A}.png`, data: Buffer.from(PNG_BYTES) },
    ]);
    const doc = await openDocument(path, store);
    expect(doc.warnings).toContain(`hash mismatch: ${IMG_A} is ${sha(PNG_BYTES)}`);
    expect(doc.project.sources[0].lines[0].image.imageId).toBe(sha(PNG_BYTES));
    expect(doc.project.sources[0].lines[0].image.dataUrl).toBe(toDataUrl("image/png", PNG_BYTES));
  });

  it("refuses junk, broken legacy JSON and newer schemas with typed errors", async () => {
    const junk = join(dir, "junk.mocquereau");
    await writeFile(junk, "hello");
    await expect(openDocument(junk, store)).rejects.toMatchObject({ code: "invalid" });

    const broken = join(dir, "broken.mocquereau.json");
    await writeFile(broken, "{oops");
    await expect(openDocument(broken, store)).rejects.toMatchObject({ code: "invalid" });

    const newer = join(dir, "newer.mocquereau");
    await writeZip(newer, [
      { name: "mimetype", data: PACKAGE_MIMETYPE },
      { name: "project.json", data: JSON.stringify({ ...makeV2Project(), schemaVersion: 7, app: { name: "mocquereau", version: "3.0.0" } }) },
    ]);
    const err = await openDocument(newer, store).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DocumentError);
    expect(err).toMatchObject({ code: "newer", info: { version: "3.0.0" } });
  });
});
