// src/main/atomic-write.ts
//
// Atomic replace: write <dir>/.<name>.<rand>.tmp in the destination folder,
// fsync, then rename over the target. rename is retried on EPERM/EBUSY/EACCES
// (Windows antivirus and indexers hold files briefly). The temp file is
// removed on any failure; the target is never opened for writing.
import { randomBytes } from "node:crypto";
import { open, rename as fsRename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export interface AtomicDeps {
  rename?: (from: string, to: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

export const RENAME_RETRY_DELAYS_MS = [100, 300, 900] as const;
const RETRYABLE_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function tempPathFor(target: string): string {
  return join(dirname(target), `.${basename(target)}.${randomBytes(6).toString("hex")}.tmp`);
}

export async function fsyncFile(path: string): Promise<void> {
  const fh = await open(path, "r+");
  try {
    await fh.sync();
  } finally {
    await fh.close();
  }
}

export async function renameWithRetry(from: string, to: string, deps: AtomicDeps = {}): Promise<void> {
  const rename = deps.rename ?? fsRename;
  const sleep = deps.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (!RETRYABLE_CODES.has(code) || attempt >= RENAME_RETRY_DELAYS_MS.length) throw err;
      await sleep(RENAME_RETRY_DELAYS_MS[attempt]);
    }
  }
}

export async function writeFileAtomic(
  target: string,
  data: string | Uint8Array,
  deps: AtomicDeps = {},
): Promise<void> {
  const tmp = tempPathFor(target);
  try {
    const fh = await open(tmp, "w");
    try {
      await fh.writeFile(data);
      await fh.sync();
    } finally {
      await fh.close();
    }
    await renameWithRetry(tmp, target, deps);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}
