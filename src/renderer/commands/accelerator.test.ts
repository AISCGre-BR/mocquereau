import { describe, expect, it } from "vitest";
import { matchAccelerator, normalizeEventKey, parseAccelerator, type KeyLike } from "./accelerator";

const ev = (key: string, mods: Partial<KeyLike> = {}, code?: string): KeyLike => ({
  key, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods,
});

describe("parseAccelerator", () => {
  it("resolves CmdOrCtrl per platform", () => {
    expect(parseAccelerator("CmdOrCtrl+Shift+S", "win32")).toEqual({ key: "S", ctrl: true, meta: false, alt: false, shift: true });
    expect(parseAccelerator("CmdOrCtrl+Shift+S", "darwin")).toEqual({ key: "S", ctrl: false, meta: true, alt: false, shift: true });
    expect(parseAccelerator("CommandOrControl+o", "linux").ctrl).toBe(true);
  });

  it("normalizes named keys", () => {
    expect(parseAccelerator("Up", "linux").key).toBe("ArrowUp");
    expect(parseAccelerator("Delete", "linux").key).toBe("Delete");
    expect(parseAccelerator("F5", "linux").key).toBe("F5");
    expect(parseAccelerator("Ctrl+Plus", "linux").key).toBe("+");
    expect(parseAccelerator("Space", "linux").key).toBe("Space");
  });

  it("rejects invalid accelerators", () => {
    expect(() => parseAccelerator("", "linux")).toThrow();
    expect(() => parseAccelerator("Ctrl+", "linux")).toThrow();
    expect(() => parseAccelerator("Hyper+S", "linux")).toThrow();
    expect(() => parseAccelerator("Ctrl+Banana", "linux")).toThrow();
  });
});

describe("matchAccelerator", () => {
  it("requires exact modifiers (undo is not redo)", () => {
    expect(matchAccelerator("CmdOrCtrl+Z", ev("z", { ctrlKey: true }), "win32")).toBe(true);
    expect(matchAccelerator("CmdOrCtrl+Z", ev("Z", { ctrlKey: true, shiftKey: true }), "win32")).toBe(false);
    expect(matchAccelerator("CmdOrCtrl+Shift+Z", ev("Z", { ctrlKey: true, shiftKey: true }), "win32")).toBe(true);
    expect(matchAccelerator("CmdOrCtrl+Z", ev("z", { metaKey: true }), "win32")).toBe(false);
    expect(matchAccelerator("CmdOrCtrl+Z", ev("z", { metaKey: true }), "darwin")).toBe(true);
  });

  it("matches Ctrl+Y as a plain accelerator", () => {
    expect(matchAccelerator("Ctrl+Y", ev("y", { ctrlKey: true }), "linux")).toBe(true);
  });

  it("works on non-Latin and AZERTY layouts", () => {
    // Russian layout: the physical Z key types a Cyrillic letter.
    expect(matchAccelerator("CmdOrCtrl+Z", ev("я", { ctrlKey: true }, "KeyZ"), "linux")).toBe(true);
    // AZERTY: the key labelled Z sits where QWERTY has W; follow the label.
    expect(matchAccelerator("CmdOrCtrl+Z", ev("z", { ctrlKey: true }, "KeyW"), "win32")).toBe(true);
    expect(matchAccelerator("CmdOrCtrl+W", ev("z", { ctrlKey: true }, "KeyW"), "win32")).toBe(false);
  });

  it("normalizes event keys", () => {
    expect(normalizeEventKey(ev(" "))).toBe("Space");
    expect(normalizeEventKey(ev("ArrowUp"))).toBe("ArrowUp");
    expect(normalizeEventKey(ev("ß", {}, "Digit1"))).toBe("1");
  });
});
