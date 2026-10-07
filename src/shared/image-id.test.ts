import { describe, it, expect } from "vitest";
import {
  IMAGE_ENTRY_RE,
  IMAGE_ID_RE,
  decodeDataUrl,
  extForMime,
  imageEntryPath,
  mimeForExt,
  resolveImageMime,
  sha256Hex,
  sniffImageMime,
} from "@shared/image-id";

const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEAD = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);

describe("sha256Hex", () => {
  it("hashes 'abc' to the known digest", async () => {
    const bytes = new TextEncoder().encode("abc");
    expect(await sha256Hex(bytes)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("respects byteOffset of a subarray view", async () => {
    const whole = new TextEncoder().encode("xxabcxx");
    const view = whole.subarray(2, 5);
    expect(await sha256Hex(view)).toBe(await sha256Hex(new TextEncoder().encode("abc")));
  });

  it("produces ids accepted by IMAGE_ID_RE", async () => {
    expect(IMAGE_ID_RE.test(await sha256Hex(PNG_SIG))).toBe(true);
  });
});

describe("decodeDataUrl", () => {
  it("decodes a base64 PNG data URL", () => {
    const r = decodeDataUrl("data:image/png;base64,iVBORw0KGgo=");
    expect(r?.mimeType).toBe("image/png");
    expect(Array.from(r!.bytes)).toEqual(Array.from(PNG_SIG));
  });

  it("decodes an empty non-base64 data URL", () => {
    const r = decodeDataUrl("data:,");
    expect(r?.mimeType).toBe("text/plain");
    expect(r?.bytes.byteLength).toBe(0);
  });

  it("returns null for blob URLs and malformed base64", () => {
    expect(decodeDataUrl("blob:file:///abc")).toBeNull();
    expect(decodeDataUrl("data:image/png;base64,@@@@")).toBeNull();
    expect(decodeDataUrl("data:image/png;base64")).toBeNull();
  });
});

describe("MIME helpers", () => {
  it("sniffs PNG, JPEG and WEBP by magic bytes", () => {
    expect(sniffImageMime(PNG_SIG)).toBe("image/png");
    expect(sniffImageMime(JPEG_HEAD)).toBe("image/jpeg");
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffImageMime(webp)).toBe("image/webp");
    expect(sniffImageMime(Uint8Array.from([1, 2, 3, 4]))).toBeNull();
  });

  it("prefers the sniffed MIME over the declared one", () => {
    expect(resolveImageMime(JPEG_HEAD, "image/png")).toBe("image/jpeg");
    expect(resolveImageMime(Uint8Array.from([1, 2, 3]), "image/png")).toBe("image/png");
    // S4: any declared image/* type is kept (opaque bytes); non-images are not.
    expect(resolveImageMime(Uint8Array.from([1, 2, 3]), "image/x-foo")).toBe("image/x-foo");
    expect(resolveImageMime(Uint8Array.from([1, 2, 3]), "text/plain")).toBeNull();
    expect(resolveImageMime(Uint8Array.from([1, 2, 3]))).toBeNull();
  });

  it("maps MIME and extensions both ways", () => {
    expect(extForMime("image/jpeg")).toBe("jpg");
    expect(extForMime("IMAGE/PNG")).toBe("png");
    expect(extForMime("text/plain")).toBeNull();
    expect(mimeForExt("jpeg")).toBe("image/jpeg");
    expect(mimeForExt("exe")).toBeNull();
  });

  it("derives an extension for image types it does not know (S4)", () => {
    expect(extForMime("image/avif")).toBe("avif");
    expect(extForMime("image/svg+xml")).toBe("svg");
    expect(extForMime("image/x-foo")).toBe("foo");
    expect(mimeForExt("avif")).toBe("image/avif");
    expect(mimeForExt("svg")).toBe("image/svg+xml");
    // Never an executable extension, whatever the MIME claims.
    expect(extForMime("image/x-exe")).toBe("bin");
  });

  it("builds package entry paths and rejects unsupported MIME", () => {
    const id = "a".repeat(64);
    expect(imageEntryPath(id, "image/jpeg")).toBe(`images/${id}.jpg`);
    expect(() => imageEntryPath(id, "text/plain")).toThrow();
    expect(() => imageEntryPath("abc", "image/png")).toThrow();
  });
});

describe("IMAGE_ENTRY_RE", () => {
  it("accepts only images/<64 lowercase hex>.<short alnum ext>, never executables", () => {
    const id = "0123456789abcdef".repeat(4);
    expect(IMAGE_ENTRY_RE.test(`images/${id}.png`)).toBe(true);
    expect(IMAGE_ENTRY_RE.test(`images/${id}.jpeg`)).toBe(true);
    expect(IMAGE_ENTRY_RE.test(`images/${id.toUpperCase()}.png`)).toBe(false);
    expect(IMAGE_ENTRY_RE.test(`images/${id}.exe`)).toBe(false);
    expect(IMAGE_ENTRY_RE.test(`images/${id}.avif`)).toBe(true);
    expect(IMAGE_ENTRY_RE.test(`images/${id}.svg`)).toBe(true);
    expect(IMAGE_ENTRY_RE.test(`images/${id}.bin`)).toBe(true);
    expect(IMAGE_ENTRY_RE.test(`images/../${id}.png`)).toBe(false);
    expect(IMAGE_ENTRY_RE.test(`x/images/${id}.png`)).toBe(false);
  });
});
