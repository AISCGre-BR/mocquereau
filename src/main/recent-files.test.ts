import { describe, expect, it } from "vitest";
import { MAX_RECENT, replaceRecent, withRecent } from "./recent-files";

describe("recent files", () => {
  it("puts the path first, de-duplicates and caps the list", () => {
    const list = Array.from({ length: MAX_RECENT }, (_, i) => `/p${i}`);
    const next = withRecent(list, "/p3");
    expect(next[0]).toBe("/p3");
    expect(next).toHaveLength(MAX_RECENT);
    expect(withRecent(list, "/new")).toHaveLength(MAX_RECENT);
    expect(withRecent(list, "/new")[0]).toBe("/new");
  });

  it("ignores null, empty and non-string paths (legacy open returns filePath null)", () => {
    const list = ["/a"];
    expect(withRecent(list, null)).toBe(list);
    expect(withRecent(list, "")).toBe(list);
    expect(withRecent(list, 42)).toBe(list);
  });

  it("replaces a legacy entry with the new package at the top", () => {
    expect(replaceRecent(["/x", "/old.mocquereau.json", "/y"], "/old.mocquereau.json", "/old.mocquereau"))
      .toEqual(["/old.mocquereau", "/x", "/y"]);
    expect(replaceRecent(["/x"], "/missing.json", "/new.mocquereau")).toEqual(["/new.mocquereau", "/x"]);
  });
});
