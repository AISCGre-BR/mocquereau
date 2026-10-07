// src/main/session-store.ts
//
// Working session on disk (spec D2): userData/sessions/<sessionId>/images/
// holds every image imported or opened in this run, named by sha256, written
// once and never modified. Saving zips from here. No Electron imports, so it
// is testable in vitest.
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { IMAGE_ID_RE, extForMime, mimeForExt, resolveImageMime, sha256Hex } from "@shared/image-id";
import { writeFileAtomic } from "./atomic-write";

export interface SessionImageInfo {
  imageId: string;
  mimeType: string;
  byteLength: number;
  fileName: string;
}

export interface SessionImage {
  imageId: string;
  mimeType: string;
  bytes: Uint8Array;
}

const FILE_RE = /^([0-9a-f]{64})\.([a-z]+)$/;

export class SessionStore {
  private readonly index = new Map<string, SessionImageInfo>();

  private constructor(
    readonly sessionId: string,
    readonly dir: string,
    readonly imagesDir: string,
  ) {}

  static async create(rootDir: string, sessionId: string = randomUUID()): Promise<SessionStore> {
    const dir = join(rootDir, sessionId);
    const imagesDir = join(dir, "images");
    await mkdir(imagesDir, { recursive: true });
    const store = new SessionStore(sessionId, dir, imagesDir);
    await writeFileAtomic(
      join(dir, "session.json"),
      JSON.stringify({ sessionId, startedAt: new Date().toISOString(), pid: process.pid }, null, 2),
    );
    await store.scan();
    return store;
  }

  private async scan(): Promise<void> {
    for (const name of await readdir(this.imagesDir)) {
      const match = FILE_RE.exec(name);
      const mimeType = match ? mimeForExt(match[2]) : null;
      if (!match || !mimeType) continue;
      const s = await stat(join(this.imagesDir, name));
      this.index.set(match[1], { imageId: match[1], mimeType, byteLength: s.size, fileName: name });
    }
  }

  async putImage(bytes: Uint8Array, declaredMime?: string): Promise<SessionImageInfo> {
    if (bytes.byteLength === 0) throw new Error("empty image");
    const mimeType = resolveImageMime(bytes, declaredMime);
    const ext = mimeType ? extForMime(mimeType) : null;
    if (!mimeType || !ext) throw new Error(`unsupported image format (${declaredMime ?? "unknown"})`);
    const imageId = await sha256Hex(bytes);
    const existing = this.index.get(imageId);
    if (existing) return existing;
    const fileName = `${imageId}.${ext}`;
    await writeFileAtomic(join(this.imagesDir, fileName), bytes);
    const info: SessionImageInfo = { imageId, mimeType, byteLength: bytes.byteLength, fileName };
    this.index.set(imageId, info);
    return info;
  }

  has(imageId: string): boolean {
    return this.index.has(imageId);
  }

  info(imageId: string): SessionImageInfo | undefined {
    return this.index.get(imageId);
  }

  listImageIds(): string[] {
    return [...this.index.keys()];
  }

  async getImage(imageId: string): Promise<SessionImage | null> {
    if (!IMAGE_ID_RE.test(imageId)) return null;
    const info = this.index.get(imageId);
    if (!info) return null;
    const buf = await readFile(join(this.imagesDir, info.fileName));
    return { imageId, mimeType: info.mimeType, bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
  }

  async dispose(): Promise<void> {
    this.index.clear();
    await rm(this.dir, { recursive: true, force: true });
  }

  disposeSync(): void {
    this.index.clear();
    rmSync(this.dir, { recursive: true, force: true });
  }

  /** Wave A2 has no recovery yet: drop sessions older than maxAgeMs (crash leftovers). */
  static async sweepStale(rootDir: string, maxAgeMs: number, now: number = Date.now()): Promise<string[]> {
    let names: string[];
    try {
      names = await readdir(rootDir);
    } catch {
      return [];
    }
    const removed: string[] = [];
    for (const name of names) {
      const dir = join(rootDir, name);
      let startedAt = Number.NaN;
      try {
        const meta = JSON.parse(await readFile(join(dir, "session.json"), "utf-8")) as { startedAt?: string };
        startedAt = Date.parse(meta.startedAt ?? "");
      } catch {
        try {
          startedAt = (await stat(dir)).mtimeMs;
        } catch {
          continue;
        }
      }
      if (!Number.isFinite(startedAt) || now - startedAt > maxAgeMs) {
        await rm(dir, { recursive: true, force: true });
        removed.push(name);
      }
    }
    return removed;
  }
}
