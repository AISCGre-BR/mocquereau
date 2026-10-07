// src/main/save-queue.ts
//
// B3: saves to the same package run one at a time, in the order main received
// them, so the newest snapshot is always the last one renamed over the target
// (an older autosave whose rename is slow can no longer land after a manual
// save). Saves to different paths stay independent. idle() lets the quit path
// wait for in-flight writes before the working session is deleted.
import { resolve } from "node:path";

function keyOf(target: string): string {
  const abs = resolve(target);
  // Windows and macOS file systems are case-insensitive by default.
  return process.platform === "linux" ? abs : abs.toLowerCase();
}

export class SaveQueue {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly inFlight = new Set<Promise<void>>();
  private token = 0;

  /** Identifies one save request (see SaveThenClose). */
  nextToken(): number {
    return ++this.token;
  }

  get busy(): boolean {
    return this.inFlight.size > 0;
  }

  run<T>(target: string, job: () => Promise<T>): Promise<T> {
    const key = keyOf(target);
    const prev = this.tails.get(key) ?? Promise.resolve();
    const result = prev.then(job);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    this.inFlight.add(tail);
    void tail.then(() => {
      this.inFlight.delete(tail);
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }

  async idle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
  }
}
