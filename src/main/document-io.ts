// src/main/document-io.ts
//
// Open/save orchestration for the main process, free of Electron so it can be
// tested in vitest. Wave A2: the renderer still exchanges SessionProject
// (images as data URLs); this module converts at the boundary.
import { readFile } from "node:fs/promises";
import type { InlineImage, LineRef, SessionProject } from "@shared/project-schema";
import { IMAGE_ID_RE, decodeDataUrl, sha256Hex } from "@shared/image-id";
import { MigrationError, migrateLegacyProject, migrateToCurrent } from "@shared/migrations";
import {
  dehydrateProject,
  hydrateProject,
  markMissingImages,
  rewriteImageIds,
  type ResolvedImage,
} from "@shared/project-adapter";
import { PackageError, detectFormat, readPackage, writePackage } from "./package-io";
import type { AtomicDeps } from "./atomic-write";
import type { SessionStore } from "./session-store";

export type DocumentErrorCode = "invalid" | "newer" | "missing-images" | "io";

export class DocumentError extends Error {
  constructor(
    readonly code: DocumentErrorCode,
    message: string,
    readonly info: { version?: string; count?: number } = {},
  ) {
    super(message);
    this.name = "DocumentError";
  }
}

export interface OpenedDocument {
  project: SessionProject;
  format: "package" | "legacy";
  warnings: string[];
  ambiguousLines: LineRef[];
}

export function toDataUrl(mimeType: string, bytes: Uint8Array): string {
  const b64 = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  return `data:${mimeType};base64,${b64}`;
}

function toDocumentError(err: unknown): DocumentError {
  if (err instanceof DocumentError) return err;
  if (err instanceof PackageError) return new DocumentError(err.code, err.message, err.info);
  if (err instanceof MigrationError) {
    return err.code === "newer"
      ? new DocumentError("newer", err.message, { version: err.version })
      : new DocumentError("invalid", [err.message, ...err.details].join("; "));
  }
  return new DocumentError("invalid", err instanceof Error ? err.message : String(err));
}

export async function openDocument(path: string, store: SessionStore): Promise<OpenedDocument> {
  let format: "package" | "legacy" | "unknown";
  try {
    format = await detectFormat(path);
  } catch (err) {
    throw new DocumentError("io", err instanceof Error ? err.message : String(err));
  }
  if (format === "unknown") throw new DocumentError("invalid", "not a Mocquereau project");
  return format === "legacy" ? openLegacy(path, store) : openPackage(path, store);
}

async function openLegacy(path: string, store: SessionStore): Promise<OpenedDocument> {
  let json: unknown;
  try {
    json = JSON.parse((await readFile(path, "utf-8")).replace(/^﻿/, ""));
  } catch {
    throw new DocumentError("invalid", "legacy file is not valid JSON");
  }
  let migrated;
  try {
    migrated = await migrateLegacyProject(json);
  } catch (err) {
    throw toDocumentError(err);
  }
  const urls = new Map<string, string>();
  for (const [id, img] of migrated.images) {
    const info = await store.putImage(img.bytes, img.mimeType);
    urls.set(id, toDataUrl(info.mimeType, img.bytes));
  }
  return {
    project: hydrateProject(migrated.project, (ref) => urls.get(ref.imageId) ?? ""),
    format: "legacy",
    warnings: migrated.warnings,
    ambiguousLines: migrated.ambiguousLines,
  };
}

async function openPackage(path: string, store: SessionStore): Promise<OpenedDocument> {
  let pkg;
  let current;
  try {
    pkg = await readPackage(path);
    current = migrateToCurrent(pkg.projectJson);
  } catch (err) {
    throw toDocumentError(err);
  }
  const warnings = [...pkg.warnings, ...current.warnings];
  const rename = new Map<string, string>();
  const urls = new Map<string, string>();
  for (const entry of pkg.imageEntries) {
    const real = await sha256Hex(entry.bytes);
    if (real !== entry.imageId) {
      warnings.push(`hash mismatch: ${entry.imageId} is ${real}`);
      rename.set(entry.imageId, real);
    }
    try {
      const info = await store.putImage(entry.bytes, entry.mimeType);
      urls.set(info.imageId, toDataUrl(info.mimeType, entry.bytes));
    } catch {
      warnings.push(`unreadable image: ${entry.imageId}`);
    }
  }
  const { file, missing } = markMissingImages(rewriteImageIds(current.project, rename), new Set(urls.keys()));
  for (const id of missing) warnings.push(`missing image: ${id}`);
  return {
    project: hydrateProject(file, (ref) => urls.get(ref.imageId) ?? ""),
    format: "package",
    warnings,
    ambiguousLines: [],
  };
}

export async function saveDocument(
  project: SessionProject,
  targetPath: string,
  store: SessionStore,
  appVersion: string,
  deps: AtomicDeps = {},
): Promise<void> {
  const resolve = async (img: InlineImage): Promise<ResolvedImage | null> => {
    if (img.dataUrl) {
      // Always re-derive the id from the bytes: a stale imageId may survive spreads.
      const decoded = decodeDataUrl(img.dataUrl);
      if (!decoded || decoded.bytes.byteLength === 0) return null;
      try {
        const info = await store.putImage(decoded.bytes, decoded.mimeType);
        return {
          ref: { imageId: info.imageId, width: img.width, height: img.height, mimeType: info.mimeType },
          byteLength: info.byteLength,
        };
      } catch {
        return null;
      }
    }
    if (img.imageId && IMAGE_ID_RE.test(img.imageId)) {
      const info = store.info(img.imageId);
      if (info) {
        return {
          ref: { imageId: info.imageId, width: img.width, height: img.height, mimeType: info.mimeType },
          byteLength: info.byteLength,
        };
      }
      // Known placeholder (opened as missing): keep the reference, no bytes.
      return {
        ref: { imageId: img.imageId, width: img.width, height: img.height, mimeType: img.mimeType, missing: true },
        byteLength: 0,
      };
    }
    return null;
  };

  const { file, unresolved } = await dehydrateProject(project, resolve, appVersion);
  if (unresolved > 0) {
    throw new DocumentError("missing-images", `${unresolved} image(s) could not be stored`, { count: unresolved });
  }
  try {
    await writePackage(targetPath, JSON.stringify(file, null, 2), store.imagesDir, deps);
  } catch (err) {
    if (err instanceof PackageError && err.code === "missing-images") {
      throw new DocumentError("missing-images", err.message, err.info);
    }
    throw new DocumentError("io", err instanceof Error ? err.message : String(err));
  }
}
