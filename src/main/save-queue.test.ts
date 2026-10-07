import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rename as fsRename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDocument, saveDocument } from "./document-io";
import { SessionStore } from "./session-store";
import { SaveQueue } from "./save-queue";
import { makeLegacyProject } from "../shared/__fixtures__/projects";
import type { SessionProject } from "@shared/project-schema";

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("SaveQueue", () => {
  it("runs saves to the same target one at a time, in request order", async () => {
    const q = new SaveQueue();
    const log: string[] = [];
    const first = deferred();
    const a = q.run("/a/p.mocquereau", async () => {
      log.push("a:start");
      await first.promise;
      log.push("a:end");
    });
    const b = q.run("/a/p.mocquereau", async () => {
      log.push("b:start");
    });
    await flush();
    expect(log).toEqual(["a:start"]);
    first.resolve();
    await Promise.all([a, b]);
    expect(log).toEqual(["a:start", "a:end", "b:start"]);
  });

  it("does not serialise saves to different targets", async () => {
    const q = new SaveQueue();
    const gate = deferred();
    const log: string[] = [];
    const a = q.run("/a/one.mocquereau", async () => {
      log.push("one");
      await gate.promise;
    });
    const b = q.run("/a/two.mocquereau", async () => {
      log.push("two");
    });
    await b;
    expect(log).toEqual(["one", "two"]);
    gate.resolve();
    await a;
  });

  it("a failed save does not block the next one and reports its own error", async () => {
    const q = new SaveQueue();
    const a = q.run("/p", async () => {
      throw new Error("disk full");
    });
    const b = q.run("/p", async () => "ok");
    await expect(a).rejects.toThrow("disk full");
    await expect(b).resolves.toBe("ok");
  });

  it("idle() waits for every in-flight save; busy reflects it", async () => {
    const q = new SaveQueue();
    expect(q.busy).toBe(false);
    const gate = deferred();
    let done = false;
    void q.run("/p", async () => {
      await gate.promise;
      done = true;
    });
    expect(q.busy).toBe(true);
    const idle = q.idle();
    await flush();
    expect(done).toBe(false);
    gate.resolve();
    await idle;
    expect(done).toBe(true);
    expect(q.busy).toBe(false);
  });

  it("hands out increasing tokens", () => {
    const q = new SaveQueue();
    const t1 = q.nextToken();
    const t2 = q.nextToken();
    expect(t2).toBeGreaterThan(t1);
  });
});

describe("overlapping autosave + manual save to the same package", () => {
  let dir: string;
  let store: SessionStore;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mocq-q-"));
    store = await SessionStore.create(join(dir, "sessions"), "s1");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("the latest snapshot lands last even when the older write is slower", async () => {
    const legacy = join(dir, "p.mocquereau.json");
    await writeFile(legacy, JSON.stringify(makeLegacyProject()), "utf-8");
    const base = (await openDocument(legacy, store)).project;
    const older: SessionProject = { ...base, meta: { ...base.meta, title: "autosave (older)" } };
    const newer: SessionProject = { ...base, meta: { ...base.meta, title: "manual (newer)" } };
    const target = join(dir, "p.mocquereau");

    // The autosave's rename is slow (antivirus, network drive...).
    const slowRename = async (from: string, to: string) => {
      await new Promise((r) => setTimeout(r, 40));
      await fsRename(from, to);
    };
    const q = new SaveQueue();
    const autosave = q.run(target, () => saveDocument(older, target, store, "t", { rename: slowRename }));
    const manual = q.run(target, () => saveDocument(newer, target, store, "t"));
    await Promise.all([autosave, manual]);

    const fresh = await SessionStore.create(join(dir, "sessions"), "s2");
    const reopened = await openDocument(target, fresh);
    expect(reopened.project.meta.title).toBe("manual (newer)");
  });
});
