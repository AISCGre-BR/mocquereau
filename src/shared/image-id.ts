// src/shared/image-id.ts
//
// Content-addressed image identity (SHA-256) and byte/MIME helpers.
// Uses only globalThis.crypto.subtle, atob and TextEncoder, available in the
// Electron main process (Node 24), the renderer (Chromium) and vitest (Node 22).

export const IMAGE_ID_RE = /^[0-9a-f]{64}$/;
export const IMAGE_ENTRY_RE = /^images\/([0-9a-f]{64})\.(png|jpg|jpeg|webp|gif|tif|bmp)$/;
/** Placeholder id for line images whose bytes could not be recovered. */
export const MISSING_IMAGE_ID = "0".repeat(64);

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/tiff": "tif",
  "image/bmp": "bmp",
};

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  tif: "image/tiff",
  bmp: "image/bmp",
};

export function extForMime(mimeType: string): string | null {
  return MIME_TO_EXT[mimeType.toLowerCase()] ?? null;
}

export function mimeForExt(ext: string): string | null {
  return EXT_TO_MIME[ext.toLowerCase()] ?? null;
}

export function imageEntryPath(imageId: string, mimeType: string): string {
  const ext = extForMime(mimeType);
  if (!IMAGE_ID_RE.test(imageId) || !ext) {
    throw new Error(`No package path for image ${imageId} (${mimeType})`);
  }
  return `images/${imageId}.${ext}`;
}

export function sniffImageMime(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image/webp";
  }
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return "image/gif";
  }
  if (
    b.length >= 4 &&
    ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) ||
      (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a))
  ) {
    return "image/tiff";
  }
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  return null;
}

/** Real MIME from magic bytes, falling back to a supported declared MIME. */
export function resolveImageMime(bytes: Uint8Array, declared?: string): string | null {
  const sniffed = sniffImageMime(bytes);
  if (sniffed) return sniffed;
  if (declared && extForMime(declared)) return declared.toLowerCase();
  return null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const view =
    bytes.buffer instanceof ArrayBuffer
      ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : new Uint8Array(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", view);
  return Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, "0")).join("");
}

export function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string } | null {
  if (!dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(5, comma);
  const body = dataUrl.slice(comma + 1);
  const mimeType = (header.split(";")[0] || "text/plain").toLowerCase();
  try {
    if (/;base64$/i.test(header)) {
      const bin = atob(body);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes, mimeType };
    }
    return { bytes: new TextEncoder().encode(decodeURIComponent(body)), mimeType };
  } catch {
    return null;
  }
}
