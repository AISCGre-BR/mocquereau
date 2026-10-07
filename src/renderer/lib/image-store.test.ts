import { describe, expect, it, vi } from "vitest";
import type { ImageBytesPayload } from "@shared/project-schema";
import { ImageStore, type ImageFetcher } from "./image-store";

function fakeUrls() {
  let n = 0;
  const revoked: string[] = [];
  return { api: { create: () => `blob:test/${++n}`, revoke: (u: string) => void revoked.push(u) }, revoked };
}

const img = (imageId: string): ImageBytesPayload => ({
  imageId, mimeType: "image/png", bytes: Uint8Array.from([1, 2, 3]).buffer,
});

describe("ImageStore", () => {
  it("fetches missing ids once, de-duplicated, and caches blob URLs", async () => {
    const fetcher = vi.fn<ImageFetcher>(async (ids) => ids.map(img));
    const { api } = fakeUrls();
    const store = new ImageStore(fetcher, api);
    expect(await store.ensure(["a", "b", "a"])).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(["a", "b"]);
    expect(store.urlOf("a")).toBe("blob:test/1");
    await store.ensure(["a", "b"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("shares one fetch between concurrent ensure calls", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const fetcher = vi.fn<ImageFetcher>(async (ids) => {
      await gate;
      return ids.map(img);
    });
    const store = new ImageStore(fetcher, fakeUrls().api);
    const p1 = store.ensure(["a"]);
    const p2 = store.ensure(["a"]);
    release();
    expect(await Promise.all([p1, p2])).toEqual([[], []]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports ids the main process did not return", async () => {
    const store = new ImageStore(async () => [img("a")], fakeUrls().api);
    expect(await store.ensure(["a", "zzz"])).toEqual(["zzz"]);
    expect(store.has("zzz")).toBe(false);
  });

  it("adopt registers local bytes without fetching", () => {
    const fetcher = vi.fn<ImageFetcher>(async () => []);
    const store = new ImageStore(fetcher, fakeUrls().api);
    const url = store.adopt("a", "image/jpeg", Uint8Array.from([9]).buffer);
    expect(store.urlOf("a")).toBe(url);
    expect(store.adopt("a", "image/jpeg", Uint8Array.from([9]).buffer)).toBe(url);
    expect(store.blobOf("a")?.type).toBe("image/jpeg");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("revokeAll revokes every URL and a late fetch does not resurrect entries", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { api, revoked } = fakeUrls();
    const store = new ImageStore(async (ids) => {
      await gate;
      return ids.map(img);
    }, api);
    store.adopt("x", "image/png", Uint8Array.from([1]).buffer);
    const pending = store.ensure(["late"]);
    store.revokeAll();
    expect(revoked).toEqual(["blob:test/1"]);
    release();
    await pending;
    expect(store.has("late")).toBe(false);
    expect(store.has("x")).toBe(false);
  });

  it("propagates fetch errors and allows a retry", async () => {
    let fail = true;
    const store = new ImageStore(async (ids) => {
      if (fail) throw new Error("ipc down");
      return ids.map(img);
    }, fakeUrls().api);
    await expect(store.ensure(["a"])).rejects.toThrow(/ipc down/);
    fail = false;
    expect(await store.ensure(["a"])).toEqual([]);
  });
});
