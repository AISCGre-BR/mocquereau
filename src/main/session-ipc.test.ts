import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getImagesHandler, putImageHandler } from "./session-ipc";
import { SessionStore } from "./session-store";
import { JPEG_BYTES, PNG_BYTES } from "../shared/__fixtures__/projects";

let root: string;
let store: SessionStore;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "mocq-ipc-"));
  store = await SessionStore.create(root, "s1");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const measure = () => ({ width: 640, height: 480 });

describe("putImageHandler", () => {
  it("stores ArrayBuffer and typed-array payloads and returns an ImageRef", async () => {
    const ref = await putImageHandler(store, { bytes: PNG_BYTES.slice().buffer, mimeType: "image/png" }, measure);
    expect(ref).toEqual({ imageId: sha(PNG_BYTES), width: 640, height: 480, mimeType: "image/png" });
    const ref2 = await putImageHandler(store, { bytes: JPEG_BYTES, mimeType: "image/png" }, measure);
    expect(ref2.mimeType).toBe("image/jpeg");
    expect(store.listImageIds()).toHaveLength(2);
  });

  it("rejects malformed, empty and oversized payloads", async () => {
    await expect(putImageHandler(store, null, measure)).rejects.toThrow(/invalid/);
    await expect(putImageHandler(store, { bytes: "AAAA" }, measure)).rejects.toThrow(/invalid/);
    await expect(putImageHandler(store, { bytes: new ArrayBuffer(0) }, measure)).rejects.toThrow(/invalid/);
    await expect(putImageHandler(store, { bytes: PNG_BYTES }, measure, 8)).rejects.toThrow(/invalid/);
  });
});

describe("getImagesHandler", () => {
  it("returns bytes for known ids, skipping unknown, malformed and duplicate ids", async () => {
    const { imageId } = await store.putImage(PNG_BYTES, "image/png");
    const out = await getImagesHandler(store, [imageId, imageId, "f".repeat(64), "../x", 42]);
    expect(out).toHaveLength(1);
    expect(out[0].imageId).toBe(imageId);
    expect(out[0].mimeType).toBe("image/png");
    expect(Buffer.from(out[0].bytes)).toEqual(Buffer.from(PNG_BYTES));
    expect(await getImagesHandler(store, "nope")).toEqual([]);
  });
});
