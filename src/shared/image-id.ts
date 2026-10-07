// src/shared/image-id.ts
//
// Content-addressed image identity (SHA-256) and byte/MIME helpers.
// Uses only globalThis.crypto.subtle, atob and TextEncoder, available in the
// Electron main process (Node 24), the renderer (Chromium) and vitest (Node 22).

export const IMAGE_ID_RE = /^[0-9a-f]{64}$/;
/**
 * images/<sha256>.<ext>. Besides the formats the app sniffs, any image/* type
 * is kept as opaque bytes under an extension derived from its MIME (S4), so
 * the extension is any short lowercase alphanumeric one except executables.
 */
export const IMAGE_ENTRY_RE =
  /^images\/([0-9a-f]{64})\.(?!(?:exe|com|bat|cmd|scr|msi|dll|ps1|vbs|js|jar|sh|app|lnk)$)([a-z0-9]{1,10})$/;
/** Placeholder id for line images whose bytes could not be recovered. */
export const MISSING_IMAGE_ID = "0".repeat(64);

/** Extension for opaque bytes whose derived extension is unusable. */
export const OPAQUE_EXT = "bin";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/tiff": "tif",
  "image/bmp": "bmp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jxl": "jxl",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  tif: "image/tiff",
  bmp: "image/bmp",
  avif: "image/avif",
  svg: "image/svg+xml",
  heic: "image/heic",
  heif: "image/heif",
  jxl: "image/jxl",
  ico: "image/x-icon",
};

const IMAGE_MIME_RE = /^image\/([a-z0-9][a-z0-9.+-]*)$/;

/** Package extension for a MIME; any image/* type gets one (S4), other types null. */
export function extForMime(mimeType: string): string | null {
  const mime = mimeType.toLowerCase();
  const known = MIME_TO_EXT[mime];
  if (known) return known;
  const m = IMAGE_MIME_RE.exec(mime);
  if (!m) return null;
  const derived = m[1].replace(/^x-/, "").split("+")[0].replace(/[^a-z0-9]/g, "").slice(0, 10);
  const candidate = derived || OPAQUE_EXT;
  return IMAGE_ENTRY_RE.test(`images/${MISSING_IMAGE_ID}.${candidate}`) ? candidate : OPAQUE_EXT;
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

/**
 * Real MIME from magic bytes, falling back to the declared MIME when it is any
 * image/* type (kept as opaque bytes, S4). Non-image declarations give null.
 */
export function resolveImageMime(bytes: Uint8Array, declared?: string): string | null {
  const sniffed = sniffImageMime(bytes);
  if (sniffed) return sniffed;
  if (declared && IMAGE_MIME_RE.test(declared.toLowerCase())) return declared.toLowerCase();
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
      // N1: in the main process (Node) decode with Buffer: no multi-megabyte
      // binary string, no per-byte loop. Buffer silently skips bad characters,
      // so validate the alphabet first to keep atob's strictness.
      const NodeBuffer = (globalThis as { Buffer?: { from(s: string, enc: "base64"): Uint8Array } }).Buffer;
      if (NodeBuffer) {
        if (!/^[A-Za-z0-9+/\s]*={0,2}\s*$/.test(body)) return null;
        const buf = NodeBuffer.from(body, "base64");
        return { bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), mimeType };
      }
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
