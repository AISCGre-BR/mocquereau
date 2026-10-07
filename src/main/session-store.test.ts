import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "./session-store";
import { JPEG_BYTES, PNG_BYTES } from "../shared/__fixtures__/projects";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "mocq-sess-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("SessionStore", () => {
  it("creates the session folder with session.json", async () => {
    const s = await SessionStore.create(root, "s1");
    expect(s.dir).toBe(join(root, "s1"));
    const meta = JSON.parse(await readFile(join(s.dir, "session.json"), "utf-8"));
    expect(meta.sessionId).toBe("s1");
    expect(typeof meta.startedAt).toBe("string");
  });

  it("stores images by content hash and deduplicates", async () => {
    const s = await SessionStore.create(root, "s1");
    const a = await s.putImage(PNG_BYTES, "image/png");
    const b = await s.putImage(Uint8Array.from(PNG_BYTES), "image/png");
    expect(a).toEqual(b);
    expect(a.imageId).toBe(sha(PNG_BYTES));
    expect(a.fileName).toBe(`${sha(PNG_BYTES)}.png`);
    expect(existsSync(join(s.imagesDir, a.fileName))).toBe(true);
    expect(s.listImageIds()).toEqual([a.imageId]);
  });

  it("uses the sniffed MIME when the declared one is wrong", async () => {
    const s = await SessionStore.create(root, "s1");
    const info = await s.putImage(JPEG_BYTES, "image/png");
    expect(info.mimeType).toBe("image/jpeg");
    expect(info.fileName.endsWith(".jpg")).toBe(true);
  });

  it("rejects empty and unsupported images", async () => {
    const s = await SessionStore.create(root, "s1");
    await expect(s.putImage(new Uint8Array(0), "image/png")).rejects.toThrow(/empty/);
    await expect(s.putImage(Uint8Array.from([1, 2, 3]), "text/plain")).rejects.toThrow(/unsupported/);
  });

  it("returns bytes and MIME; unknown or malformed ids give null", async () => {
    const s = await SessionStore.create(root, "s1");
    const { imageId } = await s.putImage(PNG_BYTES, "image/png");
    const img = await s.getImage(imageId);
    expect(img?.mimeType).toBe("image/png");
    expect(Buffer.from(img!.bytes)).toEqual(Buffer.from(PNG_BYTES));
    expect(await s.getImage("f".repeat(64))).toBeNull();
    expect(await s.getImage("../../etc/passwd")).toBeNull();
  });

  it("rebuilds its index from disk when adopting an existing session", async () => {
    const s1 = await SessionStore.create(root, "s1");
    const { imageId } = await s1.putImage(PNG_BYTES, "image/png");
    await writeFile(join(s1.imagesDir, "notes.txt"), "ignored");
    const s2 = await SessionStore.create(root, "s1");
    expect(s2.has(imageId)).toBe(true);
    expect(s2.listImageIds()).toEqual([imageId]);
  });

  it("dispose removes the session folder", async () => {
    const s = await SessionStore.create(root, "s1");
    await s.putImage(PNG_BYTES, "image/png");
    await s.dispose();
    expect(existsSync(s.dir)).toBe(false);
    const t = await SessionStore.create(root, "s2");
    t.disposeSync();
    expect(existsSync(t.dir)).toBe(false);
  });

  it("sweepStale removes only sessions older than the limit", async () => {
    const fresh = await SessionStore.create(root, "fresh");
    const oldDir = join(root, "old");
    await mkdir(oldDir, { recursive: true });
    await writeFile(join(oldDir, "session.json"), JSON.stringify({ sessionId: "old", startedAt: "2020-01-01T00:00:00.000Z" }));
    const removed = await SessionStore.sweepStale(root, 7 * 24 * 3600 * 1000);
    expect(removed).toEqual(["old"]);
    expect(existsSync(fresh.dir)).toBe(true);
    expect(await SessionStore.sweepStale(join(root, "does-not-exist"), 1)).toEqual([]);
  });
});
