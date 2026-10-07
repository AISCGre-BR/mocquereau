import { describe, expect, it } from "vitest";
import { MAX_RECENT, migrateRecentState, replaceRecentEntry, sanitizeRecentMeta, setRecentMeta, withRecentEntry } from "./recent-files";

const META = { title: "Gloria VIII", author: "A", updatedAt: "2026-04-27T12:00:00.000Z", thumb: "data:image/jpeg;base64,AAAA", sources: [{ siglum: "P", progress: 0.5 }] };

describe("recent entries", () => {
  it("reads the legacy string list", () => {
    expect(migrateRecentState({ recentFiles: ["/a.mocquereau", 3, "", "/b.mocquereau"] })).toEqual([{ path: "/a.mocquereau" }, { path: "/b.mocquereau" }]);
    expect(migrateRecentState({ recent: [{ path: "/a", meta: META }] })).toEqual([{ path: "/a", meta: META }]);
    expect(migrateRecentState(null)).toEqual([]);
  });
  it("puts the path first, de-duplicates and caps the list", () => {
    const list = Array.from({ length: MAX_RECENT }, (_, i) => ({ path: `/p${i}` }));
    expect(withRecentEntry(list, "/p3")[0].path).toBe("/p3");
    expect(withRecentEntry(list, "/p3")).toHaveLength(MAX_RECENT);
    expect(withRecentEntry(list, "/new")).toHaveLength(MAX_RECENT);
    expect(withRecentEntry(list, "/new")[0].path).toBe("/new");
  });
  it("ignores null, empty and non-string paths (legacy open returns filePath null)", () => {
    const list = [{ path: "/a" }];
    expect(withRecentEntry(list, null)).toBe(list);
    expect(withRecentEntry(list, "")).toBe(list);
    expect(withRecentEntry(list, 42)).toBe(list);
  });
  it("moves an entry to the top keeping its meta", () => {
    const list = withRecentEntry([{ path: "/a" }, { path: "/b", meta: META }], "/b");
    expect(list).toEqual([{ path: "/b", meta: META }, { path: "/a" }]);
  });
  it("replaces a path keeping meta", () => {
    expect(replaceRecentEntry([{ path: "/old.json", meta: META }], "/old.json", "/new.mocquereau")).toEqual([{ path: "/new.mocquereau", meta: META }]);
    expect(replaceRecentEntry([{ path: "/x" }], "/missing.json", "/new.mocquereau")).toEqual([{ path: "/new.mocquereau" }, { path: "/x" }]);
  });
  it("sets meta only for listed paths and valid meta", () => {
    const list = [{ path: "/a" }];
    expect(setRecentMeta(list, "/a", META)[0].meta).toEqual(META);
    expect(setRecentMeta(list, "/zzz", META)).toEqual(list);
    expect(setRecentMeta(list, "/a", { title: 1 })).toEqual(list);
  });
  it("sanitizes meta", () => {
    expect(sanitizeRecentMeta({ ...META, thumb: "data:text/html;base64,xx" })?.thumb).toBeUndefined();
    expect(sanitizeRecentMeta({ ...META, thumb: "data:image/jpeg;base64," + "A".repeat(300_001) })?.thumb).toBeUndefined();
    expect(sanitizeRecentMeta({ ...META, title: "x".repeat(600) })?.title).toHaveLength(500);
    expect(sanitizeRecentMeta({ ...META, sources: [{ siglum: "S", progress: 7 }] })?.sources[0].progress).toBe(1);
    expect(sanitizeRecentMeta({ ...META, sources: Array(60).fill({ siglum: "S", progress: 0 }) })?.sources).toHaveLength(50);
    expect(sanitizeRecentMeta("nope")).toBeNull();
  });
});
