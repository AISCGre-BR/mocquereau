// src/main/session-ipc.ts
//
// IPC for session images: images:put (renderer hands bytes in once, gets an
// ImageRef back) and images:get (renderer asks for bytes by id to build blob
// URLs). Handlers are exported separately so they can be tested without Electron.
import { ipcMain, nativeImage } from "electron";
import type { ImageBytesPayload, ImageRef } from "@shared/project-schema";
import { IMAGE_ID_RE } from "@shared/image-id";
import { DEFAULT_LIMITS } from "./package-io";
import type { SessionStore } from "./session-store";

export type MeasureImage = (bytes: Uint8Array) => { width: number; height: number };

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

export async function putImageHandler(
  store: SessionStore,
  payload: unknown,
  measure: MeasureImage,
  maxBytes: number = DEFAULT_LIMITS.maxEntryBytes,
): Promise<ImageRef> {
  const p = (payload ?? {}) as { bytes?: unknown; mimeType?: unknown };
  const bytes = toBytes(p.bytes);
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > maxBytes) throw new Error("invalid image payload");
  const declared = typeof p.mimeType === "string" ? p.mimeType : undefined;
  const info = await store.putImage(bytes, declared);
  const size = measure(bytes);
  return { imageId: info.imageId, width: size.width, height: size.height, mimeType: info.mimeType };
}

export async function getImagesHandler(store: SessionStore, ids: unknown): Promise<ImageBytesPayload[]> {
  if (!Array.isArray(ids)) return [];
  const out: ImageBytesPayload[] = [];
  for (const id of new Set(ids)) {
    if (typeof id !== "string" || !IMAGE_ID_RE.test(id)) continue;
    const img = await store.getImage(id);
    if (img) out.push({ imageId: img.imageId, mimeType: img.mimeType, bytes: img.bytes.slice().buffer });
  }
  return out;
}

const measureWithNativeImage: MeasureImage = (bytes) =>
  nativeImage.createFromBuffer(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)).getSize();

export function registerSessionImageHandlers(getStore: () => SessionStore): void {
  ipcMain.handle("images:put", (_event, payload: unknown) =>
    putImageHandler(getStore(), payload, measureWithNativeImage),
  );
  ipcMain.handle("images:get", (_event, ids: unknown) => getImagesHandler(getStore(), ids));
}
