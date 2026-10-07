import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PACKAGE_MIMETYPE } from "@shared/project-schema";
import { DEFAULT_LIMITS, PackageError, detectFormat, readPackage, writePackage } from "./package-io";
import { renameWithRetry } from "./atomic-write";
import { listEntries, rawStoredZip, writeZip } from "./__fixtures__/zip";
import { JPEG_BYTES, PNG_BYTES, makeV2Project } from "../shared/__fixtures__/projects";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mocq-pkg-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const IMAGES = [
  { bytes: PNG_BYTES, ext: "png", mime: "image/png" },
  { bytes: JPEG_BYTES, ext: "jpg", mime: "image/jpeg" },
];

async function sessionDir(extra: Uint8Array[] = []): Promise<string> {
  const imageDir = join(dir, "session-images");
  await mkdir(imageDir, { recursive: true });
  for (const img of IMAGES) await writeFile(join(imageDir, `${sha(img.bytes)}.${img.ext}`), img.bytes);
  for (const b of extra) await writeFile(join(imageDir, `${sha(b)}.png`), b);
  return imageDir;
}

function projectJson(): string {
  const p = makeV2Project();
  p.images = Object.fromEntries(
    IMAGES.map((i) => [sha(i.bytes), { path: `images/${sha(i.bytes)}.${i.ext}`, mimeType: i.mime, byteLength: i.bytes.byteLength }]),
  );
  p.sources[0].lines[0].image.imageId = sha(PNG_BYTES);
  return JSON.stringify(p, null, 2);
}

const noTmpLeft = async () => (await readdir(dir)).filter((n) => n.endsWith(".tmp"));

describe("writePackage + readPackage", () => {
  it("round-trips project.json and image bytes", async () => {
    const target = join(dir, "p.mocquereau");
    await writePackage(target, projectJson(), await sessionDir());
    const r = await readPackage(target);
    expect(r.projectJson).toEqual(JSON.parse(projectJson()));
    expect(r.warnings).toEqual([]);
    const byId = new Map(r.imageEntries.map((e) => [e.imageId, e]));
    expect(Buffer.from(byId.get(sha(PNG_BYTES))!.bytes)).toEqual(Buffer.from(PNG_BYTES));
    expect(byId.get(sha(JPEG_BYTES))!.mimeType).toBe("image/jpeg");
  });

  it("writes mimetype first and STOREs images, DEFLATEs project.json", async () => {
    const target = join(dir, "p.mocquereau");
    await writePackage(target, projectJson(), await sessionDir());
    const entries = await listEntries(target);
    expect(entries.map((e) => e.fileName)).toEqual([
      "mimetype", "project.json", `images/${sha(PNG_BYTES)}.png`, `images/${sha(JPEG_BYTES)}.jpg`,
    ]);
    expect(entries.map((e) => e.compressionMethod)).toEqual([0, 8, 0, 0]);
  });

  it("only packages images listed in project.json", async () => {
    const orphan = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]);
    const target = join(dir, "p.mocquereau");
    await writePackage(target, projectJson(), await sessionDir([orphan]));
    const names = (await listEntries(target)).map((e) => e.fileName);
    expect(names.some((n) => n.includes(sha(orphan)))).toBe(false);
  });

  it("refuses to write when a referenced image is missing, without touching the target", async () => {
    const imageDir = await sessionDir();
    await rm(join(imageDir, `${sha(JPEG_BYTES)}.jpg`));
    const target = join(dir, "p.mocquereau");
    await expect(writePackage(target, projectJson(), imageDir)).rejects.toMatchObject({
      code: "missing-images", info: { count: 1 },
    });
    expect(existsSync(target)).toBe(false);
    expect(await noTmpLeft()).toEqual([]);
  });

  it("keeps the previous file intact and removes the temp file when rename fails", async () => {
    const target = join(dir, "p.mocquereau");
    await writeFile(target, "OLD");
    const failing = async () => {
      throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
    };
    await expect(writePackage(target, projectJson(), await sessionDir(), { rename: failing })).rejects.toThrow(/disk full/);
    expect(await readFile(target, "utf-8")).toBe("OLD");
    expect(await noTmpLeft()).toEqual([]);
  });
});

describe("renameWithRetry", () => {
  it("retries EBUSY with 100 and 300 ms, then succeeds", async () => {
    await writeFile(join(dir, "a"), "A");
    const sleeps: number[] = [];
    let calls = 0;
    await renameWithRetry(join(dir, "a"), join(dir, "b"), {
      rename: async (from, to) => {
        calls++;
        if (calls <= 2) throw Object.assign(new Error("busy"), { code: "EBUSY" });
        await rename(from, to);
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(sleeps).toEqual([100, 300]);
    expect(await readFile(join(dir, "b"), "utf-8")).toBe("A");
  });

  it("gives up after three retries on EPERM", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const always = async () => {
      calls++;
      throw Object.assign(new Error("locked"), { code: "EPERM" });
    };
    await expect(
      renameWithRetry("x", "y", { rename: always, sleep: async (ms) => { sleeps.push(ms); } }),
    ).rejects.toThrow(/locked/);
    expect(calls).toBe(4);
    expect(sleeps).toEqual([100, 300, 900]);
  });

  it("does not retry other errors", async () => {
    let calls = 0;
    const enoent = async () => {
      calls++;
      throw Object.assign(new Error("nope"), { code: "ENOENT" });
    };
    await expect(renameWithRetry("x", "y", { rename: enoent, sleep: async () => {} })).rejects.toThrow(/nope/);
    expect(calls).toBe(1);
  });
});

describe("readPackage — hostile or broken input", () => {
  const MIMETYPE = { name: "mimetype", data: PACKAGE_MIMETYPE };
  const PROJECT = () => ({ name: "project.json", data: projectJson(), compress: true });

  it("ignores unexpected entries with a warning and never returns them", async () => {
    const path = join(dir, "x.mocquereau");
    await writeZip(path, [MIMETYPE, PROJECT(), { name: "notes/evil.sh", data: "rm -rf" }, { name: "images/abc.png", data: "x" }]);
    const r = await readPackage(path);
    expect(r.imageEntries).toEqual([]);
    expect(r.warnings).toEqual(["ignored entry: notes/evil.sh", "ignored entry: images/abc.png"]);
  });

  it("rejects packages with duplicate entry names (N1)", async () => {
    const img = { name: `images/${sha(PNG_BYTES)}.png`, data: Buffer.from(PNG_BYTES) };
    const a = join(dir, "dup-project.mocquereau");
    await writeZip(a, [MIMETYPE, PROJECT(), { name: "project.json", data: JSON.stringify({ evil: true }) }]);
    await expect(readPackage(a)).rejects.toMatchObject({ code: "invalid", message: expect.stringMatching(/duplicate/) });
    const b = join(dir, "dup-image.mocquereau");
    await writeZip(b, [MIMETYPE, PROJECT(), img, { ...img, data: Buffer.from(JPEG_BYTES) }]);
    await expect(readPackage(b)).rejects.toMatchObject({ code: "invalid", message: expect.stringMatching(/duplicate/) });
    const c = join(dir, "dup-mimetype.mocquereau");
    await writeZip(c, [MIMETYPE, PROJECT(), MIMETYPE]);
    await expect(readPackage(c)).rejects.toMatchObject({ code: "invalid" });
  });

  it("rejects path traversal entries (zip-slip)", async () => {
    const path = join(dir, "slip.mocquereau");
    await writeFile(path, rawStoredZip([
      { name: "mimetype", data: Buffer.from(PACKAGE_MIMETYPE) },
      { name: "../evil.txt", data: Buffer.from("x") },
    ]));
    await expect(readPackage(path)).rejects.toMatchObject({ code: "invalid" });
    expect(existsSync(join(dir, "..", "evil.txt"))).toBe(false);
  });

  it("rejects a package whose first entry is not mimetype, or has the wrong mimetype", async () => {
    const a = join(dir, "a.mocquereau");
    await writeZip(a, [PROJECT(), MIMETYPE]);
    await expect(readPackage(a)).rejects.toMatchObject({ code: "invalid" });
    const b = join(dir, "b.mocquereau");
    await writeZip(b, [{ name: "mimetype", data: "application/zip" }, PROJECT()]);
    await expect(readPackage(b)).rejects.toMatchObject({ code: "invalid" });
  });

  it("rejects entries above the per-entry limit", async () => {
    const path = join(dir, "big.mocquereau");
    await writeZip(path, [MIMETYPE, PROJECT()]);
    await expect(readPackage(path, { ...DEFAULT_LIMITS, maxEntryBytes: 100 })).rejects.toThrow(/too large/);
  });

  it("rejects missing or non-JSON project.json", async () => {
    const a = join(dir, "a.mocquereau");
    await writeZip(a, [MIMETYPE]);
    await expect(readPackage(a)).rejects.toMatchObject({ code: "invalid" });
    const b = join(dir, "b.mocquereau");
    await writeZip(b, [MIMETYPE, { name: "project.json", data: "{not json" }]);
    await expect(readPackage(b)).rejects.toMatchObject({ code: "invalid" });
  });

  it("reports newer schema versions with the creating app version", async () => {
    const path = join(dir, "new.mocquereau");
    const newer = { ...JSON.parse(projectJson()), schemaVersion: 3, app: { name: "mocquereau", version: "9.9.9" } };
    await writeZip(path, [MIMETYPE, { name: "project.json", data: JSON.stringify(newer) }]);
    const err = await readPackage(path).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PackageError);
    expect(err).toMatchObject({ code: "newer", info: { version: "9.9.9" } });
  });

  it("rejects files that are not ZIPs", async () => {
    const path = join(dir, "junk.mocquereau");
    await writeFile(path, Buffer.from("definitely not a zip file"));
    await expect(readPackage(path)).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("detectFormat", () => {
  it("detects packages, legacy JSON (with BOM and whitespace) and junk", async () => {
    const pkg = join(dir, "p.mocquereau");
    await writePackage(pkg, projectJson(), await sessionDir());
    expect(await detectFormat(pkg)).toBe("package");

    const legacy = join(dir, "l.mocquereau.json");
    await writeFile(legacy, "﻿\n  {\"meta\":{}}", "utf-8");
    expect(await detectFormat(legacy)).toBe("legacy");

    const junk = join(dir, "j.bin");
    await writeFile(junk, Buffer.from([1, 2, 3]));
    expect(await detectFormat(junk)).toBe("unknown");

    const empty = join(dir, "e.bin");
    await writeFile(empty, "");
    expect(await detectFormat(empty)).toBe("unknown");
  });
});
