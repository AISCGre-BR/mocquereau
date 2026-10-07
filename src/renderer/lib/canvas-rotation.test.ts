import { describe, expect, it } from "vitest";
import { isRotateShortcut, rotateQuarter, splitRotation, withFine } from "./canvas-rotation";

describe("canvas-rotation", () => {
  it("splitRotation separa quarto de volta e resto fino", () => {
    expect(splitRotation(0)).toEqual({ base: 0, fine: 0 });
    expect(splitRotation(92.5)).toEqual({ base: 90, fine: 2.5 });
    expect(splitRotation(357)).toEqual({ base: 0, fine: -3 });
    expect(splitRotation(268.5)).toEqual({ base: 270, fine: -1.5 });
    expect(splitRotation(180)).toEqual({ base: 180, fine: 0 });
    expect(splitRotation(359.9)).toEqual({ base: 0, fine: -0.1 });
  });

  it("withFine preserva o quarto de volta", () => {
    expect(withFine(90, 3.2)).toBe(93.2);
    expect(withFine(0, -2)).toBe(358);
    expect(withFine(268, 0)).toBe(270);
    expect(withFine(87, 0)).toBe(90);
  });

  it("rotateQuarter soma +-90 em [0, 360) mantendo o resto fino", () => {
    expect(rotateQuarter(0, 1)).toBe(90);
    expect(rotateQuarter(0, -1)).toBe(270);
    expect(rotateQuarter(270, 1)).toBe(0);
    expect(rotateQuarter(2.5, 1)).toBe(92.5);
  });

  it("isRotateShortcut: Ctrl+] / Ctrl+[ apenas", () => {
    const k = (key: string, o = {}) => ({ key, code: "", ctrlKey: true, metaKey: false, altKey: false, ...o });
    expect(isRotateShortcut(k("]"))).toBe("cw");
    expect(isRotateShortcut(k("["))).toBe("ccw");
    expect(isRotateShortcut(k("]", { ctrlKey: false }))).toBeNull();
    expect(isRotateShortcut(k("]", { altKey: true }))).toBeNull();
    expect(isRotateShortcut(k("a"))).toBeNull();
  });
});
