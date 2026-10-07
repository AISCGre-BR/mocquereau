import { describe, it, expect } from "vitest";
import { formatAccelerator, matchAccelerator, parseAccelerator } from "./accelerator";

const ev = (key: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("accelerator", () => {
  it("interpreta modificadores e tecla", () => {
    expect(parseAccelerator("Ctrl+Shift+S")).toEqual({ ctrl: true, shift: true, alt: false, key: "s" });
  });

  it("Ctrl casa com Ctrl ou Cmd e exige os mesmos modificadores", () => {
    expect(matchAccelerator("Ctrl+S", ev("s", { ctrlKey: true }))).toBe(true);
    expect(matchAccelerator("Ctrl+S", ev("s", { metaKey: true }))).toBe(true);
    expect(matchAccelerator("Ctrl+S", ev("S", { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(matchAccelerator("Ctrl+Shift+S", ev("S", { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(matchAccelerator("Ctrl+1", ev("1", { ctrlKey: true }))).toBe(true);
    expect(matchAccelerator("Ctrl+1", ev("1"))).toBe(false);
  });

  it("formata para o macOS com símbolos e mantém o texto nas outras plataformas", () => {
    expect(formatAccelerator("Ctrl+Shift+S", "darwin")).toBe("⌘⇧S");
    expect(formatAccelerator("Ctrl+N", "darwin")).toBe("⌘N");
    expect(formatAccelerator("Ctrl+Shift+S", "win32")).toBe("Ctrl+Shift+S");
  });
});
