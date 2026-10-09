import { describe, expect, it } from "vitest";
import { orderNeumeBands } from "./band-order";

describe("orderNeumeBands: reading order of neume line bands", () => {
  it("side by side bands whose tops differ slightly are one row, read left to right", () => {
    const right = { x: 0.55, y: 0.1, w: 0.4, h: 0.1 };
    const left = { x: 0.05, y: 0.12, w: 0.4, h: 0.1 };
    expect(orderNeumeBands([right, left])).toEqual([left, right]);
  });

  it("rows go top to bottom; bands overlapping by half the smaller height or less are separate rows", () => {
    const top = { x: 0.6, y: 0.1, w: 0.3, h: 0.1 };
    const lowLeft = { x: 0.1, y: 0.16, w: 0.3, h: 0.1 }; // overlaps top by 0.04 (40%)
    const bottom = { x: 0.1, y: 0.5, w: 0.8, h: 0.1 };
    expect(orderNeumeBands([bottom, lowLeft, top])).toEqual([top, lowLeft, bottom]);
  });

  it("is stable on an already ordered list and never mutates its input", () => {
    const bands = [
      { x: 0.05, y: 0.12, w: 0.4, h: 0.1 },
      { x: 0.55, y: 0.1, w: 0.4, h: 0.1 },
      { x: 0.1, y: 0.5, w: 0.8, h: 0.1 },
    ];
    const copy = bands.map((b) => ({ ...b }));
    const once = orderNeumeBands(bands);
    expect(orderNeumeBands(once)).toEqual(once);
    expect(bands).toEqual(copy);
  });
});
