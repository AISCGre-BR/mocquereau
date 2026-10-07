// src/main/package-io.ts
//
// .mocquereau package (ZIP): mimetype (STORE, first), project.json (DEFLATE),
// images/<sha256>.<ext> (STORE). Reading never uses entry names as paths:
// only exact names are accepted and bytes are returned in memory.
import { createWriteStream, existsSync } from "node:fs";
import { open, rm } from "node:fs/promises";
import { join } from "node:path";
import yazl from "yazl";
import yauzl from "yauzl";
import type { Entry, ZipFile as ReadZip } from "yauzl";
import { PACKAGE_MIMETYPE } from "@shared/project-schema";
import { IMAGE_ENTRY_RE, IMAGE_ID_RE, mimeForExt } from "@shared/image-id";
import { MigrationError, assertSupportedSchema } from "@shared/migrations";
import { fsyncFile, renameWithRetry, tempPathFor, type AtomicDeps } from "./atomic-write";

export type PackageErrorCode = "invalid" | "newer" | "missing-images";

export class PackageError extends Error {
  constructor(
    readonly code: PackageErrorCode,
    message: string,
    readonly info: { version?: string; count?: number } = {},
  ) {
    super(message);
    this.name = "PackageError";
  }
}

export interface PackageLimits {
  maxEntryBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_LIMITS: PackageLimits = {
  maxEntryBytes: 200 * 1024 * 1024,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
};

export interface PackageImageEntry {
  imageId: string;
  ext: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface ReadPackageResult {
  projectJson: unknown;
  imageEntries: PackageImageEntry[];
  warnings: string[];
}

export async function detectFormat(path: string): Promise<"package" | "legacy" | "unknown"> {
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(16);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    if (bytesRead >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
      return "package";
    }
    let i = bytesRead >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? 3 : 0;
    while (i < bytesRead && (buf[i] === 0x20 || buf[i] === 0x09 || buf[i] === 0x0a || buf[i] === 0x0d)) i++;
    return i < bytesRead && buf[i] === 0x7b ? "legacy" : "unknown";
  } finally {
    await fh.close();
  }
}

export async function writePackage(
  targetPath: string,
  projectJson: string,
  imageDir: string,
  deps: AtomicDeps = {},
): Promise<void> {
  let parsed: { images?: Record<string, { path?: unknown } | null> };
  try {
    parsed = JSON.parse(projectJson);
  } catch {
    throw new PackageError("invalid", "project.json is not valid JSON");
  }

  const files: Array<{ entryName: string; filePath: string }> = [];
  let missing = 0;
  for (const [id, meta] of Object.entries(parsed.images ?? {})) {
    const entryName = typeof meta?.path === "string" ? meta.path : "";
    const match = IMAGE_ENTRY_RE.exec(entryName);
    if (!IMAGE_ID_RE.test(id) || !match || match[1] !== id) {
      throw new PackageError("invalid", `invalid image entry for ${id}`);
    }
    const filePath = join(imageDir, entryName.slice("images/".length));
    if (existsSync(filePath)) files.push({ entryName, filePath });
    else missing++;
  }
  if (missing > 0) {
    throw new PackageError("missing-images", `${missing} image(s) missing from the session`, { count: missing });
  }

  const tmp = tempPathFor(targetPath);
  try {
    await new Promise<void>((resolve, reject) => {
      const zip = new yazl.ZipFile();
      const out = createWriteStream(tmp);
      const fail = (err: Error) => {
        out.destroy();
        reject(err);
      };
      out.on("close", () => resolve());
      out.on("error", fail);
      zip.on("error", fail);
      zip.outputStream.on("error", fail);
      zip.outputStream.pipe(out);
      zip.addBuffer(Buffer.from(PACKAGE_MIMETYPE, "utf-8"), "mimetype", { compress: false });
      zip.addBuffer(Buffer.from(projectJson, "utf-8"), "project.json", { compress: true });
      for (const f of files) zip.addFile(f.filePath, f.entryName, { compress: false });
      zip.end();
    });
    await fsyncFile(tmp);
    await renameWithRetry(tmp, targetPath, deps);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

function toPackageError(err: unknown): PackageError {
  if (err instanceof PackageError) return err;
  if (err instanceof MigrationError) {
    return err.code === "newer"
      ? new PackageError("newer", err.message, { version: err.version })
      : new PackageError("invalid", err.message);
  }
  return new PackageError("invalid", err instanceof Error ? err.message : String(err));
}

function openZip(path: string): Promise<ReadZip> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      path,
      { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true },
      (err, zip) => (err || !zip ? reject(toPackageError(err ?? new Error("unreadable ZIP"))) : resolve(zip)),
    );
  });
}

function readEntryBytes(zip: ReadZip, entry: Entry, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error("no stream"));
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          stream.destroy();
          reject(new PackageError("invalid", `entry too large: ${entry.fileName}`));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}

function readEntries(zip: ReadZip, limits: PackageLimits): Promise<ReadPackageResult> {
  return new Promise((resolve, reject) => {
    const imageEntries: PackageImageEntry[] = [];
    const warnings: string[] = [];
    let projectJson: unknown = undefined;
    let sawMimetype = false;
    let index = 0;
    let total = 0;
    let failed = false;
    const fail = (err: unknown) => {
      if (failed) return;
      failed = true;
      reject(toPackageError(err));
    };

    zip.on("error", fail);
    zip.on("end", () => {
      if (failed) return;
      if (!sawMimetype) return fail(new PackageError("invalid", "mimetype entry missing"));
      if (projectJson === undefined) return fail(new PackageError("invalid", "project.json missing"));
      try {
        assertSupportedSchema(projectJson);
      } catch (err) {
        return fail(err);
      }
      resolve({ projectJson, imageEntries, warnings });
    });
    zip.on("entry", (entry: Entry) => {
      const name = entry.fileName;
      const isFirst = index++ === 0;
      void (async () => {
        if (entry.uncompressedSize > limits.maxEntryBytes) {
          throw new PackageError("invalid", `entry too large: ${name}`);
        }
        total += entry.uncompressedSize;
        if (total > limits.maxTotalBytes) throw new PackageError("invalid", "package too large");

        if (isFirst) {
          if (name !== "mimetype") throw new PackageError("invalid", "first entry is not mimetype");
          const bytes = await readEntryBytes(zip, entry, limits.maxEntryBytes);
          if (bytes.toString("utf-8") !== PACKAGE_MIMETYPE) throw new PackageError("invalid", "wrong mimetype");
          sawMimetype = true;
        } else if (name === "project.json") {
          const bytes = await readEntryBytes(zip, entry, limits.maxEntryBytes);
          try {
            projectJson = JSON.parse(bytes.toString("utf-8"));
          } catch {
            throw new PackageError("invalid", "project.json is not valid JSON");
          }
        } else {
          const match = IMAGE_ENTRY_RE.exec(name);
          // Unknown extensions are opaque image bytes (S4); project.json carries their MIME.
          const mimeType = match ? (mimeForExt(match[2]) ?? "application/octet-stream") : null;
          if (match && mimeType) {
            const bytes = await readEntryBytes(zip, entry, limits.maxEntryBytes);
            imageEntries.push({
              imageId: match[1],
              ext: match[2],
              mimeType,
              bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
            });
          } else {
            warnings.push(`ignored entry: ${name}`);
          }
        }
      })().then(() => {
        if (!failed) zip.readEntry();
      }, fail);
    });
    zip.readEntry();
  });
}

export async function readPackage(path: string, limits: PackageLimits = DEFAULT_LIMITS): Promise<ReadPackageResult> {
  const zip = await openZip(path);
  try {
    return await readEntries(zip, limits);
  } finally {
    zip.close();
  }
}
