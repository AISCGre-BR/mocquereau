import { describe, expect, it } from 'vitest';
import { closeRect, dilateRect, ellipseHalfWidths, erodeRect, openEllipse, openRect } from './morphology';
import type { Mask } from './types';

function mask(w: number, h: number, on: (x: number, y: number) => boolean): Mask {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = on(x, y) ? 1 : 0;
  return { data, width: w, height: h };
}
const count = (m: Mask) => m.data.reduce((a, b) => a + b, 0);

describe('morphology', () => {
  it('dilateRect 3x3 de um pixel da 9 pixels; erodeRect devolve o nucleo', () => {
    const m = mask(9, 9, (x, y) => x === 4 && y === 4);
    expect(count(dilateRect(m, 3))).toBe(9);
    const sq = mask(9, 9, (x, y) => x >= 2 && x < 7 && y >= 2 && y < 7);
    const e = erodeRect(sq, 3);
    expect(count(e)).toBe(9);
    expect(e.data[4 * 9 + 4]).toBe(1);
  });

  it('openRect remove linha de 1 px e mantem quadrado; closeRect fecha furo', () => {
    const m = mask(20, 20, (x, y) => y === 2 || (x >= 8 && x < 14 && y >= 8 && y < 14));
    const o = openRect(m, 3);
    expect(o.data[2 * 20 + 5]).toBe(0);
    expect(count(o)).toBe(36);
    const holed = mask(10, 10, (x, y) => x >= 2 && x < 8 && y >= 2 && y < 8 && !(x === 5 && y === 5));
    expect(closeRect(holed, 3).data[5 * 10 + 5]).toBe(1);
  });

  it('ellipseHalfWidths(7) aproxima um disco', () => {
    expect(Array.from(ellipseHalfWidths(7))).toEqual([1, 2, 3, 3, 3, 2, 1]);
  });

  it('openEllipse(7) apaga traco de 3 px e preserva mancha de 14 px', () => {
    const m = mask(40, 40, (x, y) => (x >= 3 && x < 6 && y >= 2 && y < 38) || (x >= 20 && x < 34 && y >= 20 && y < 34));
    const o = openEllipse(m, 7);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 10; x++) expect(o.data[y * 40 + x]).toBe(0);
    expect(o.data[27 * 40 + 27]).toBe(1);
    expect(count(o)).toBeGreaterThan(0.85 * 196);
  });
});
