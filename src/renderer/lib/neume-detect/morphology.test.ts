import { describe, expect, it } from 'vitest';
import {
  closeDisk,
  closeEllipse,
  closeRect,
  dilateOctagon,
  dilateRect,
  ellipseHalfWidths,
  erodeOctagon,
  erodeRect,
  openDisk,
  openEllipse,
  openRect,
} from './morphology';
import { mulberry32 } from './synthetic';
import type { Mask } from './types';

function mask(w: number, h: number, on: (x: number, y: number) => boolean): Mask {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = on(x, y) ? 1 : 0;
  return { data, width: w, height: h };
}
const count = (m: Mask) => m.data.reduce((a, b) => a + b, 0);

/**
 * Discos largos (raio 12 a 24, alguns sobrepostos ou cortados pela borda) e tracos finos (1 a 2 px),
 * semente fixa. Larguras longe do limiar de todos os sizes testados (3 a 17): o que se compara e a
 * forma deixada pelo elemento (cantos, cintura entre discos), nao a decisao de manter ou apagar um
 * objeto de largura ~size, que muda com qualquer discretizacao do disco.
 */
function randomBlobs(w: number, h: number, seed: number): Mask {
  const rnd = mulberry32(seed);
  const data = new Uint8Array(w * h);
  for (let k = 0; k < 9; k++) {
    const cx = rnd() * w;
    const cy = rnd() * h;
    const rad = 12 + rnd() * 12;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) data[y * w + x] = 1;
  }
  for (let k = 0; k < 14; k++) {
    const x0 = rnd() * w;
    const y0 = rnd() * h;
    const ang = rnd() * Math.PI;
    const len = 10 + rnd() * 60;
    const t = 1 + rnd();
    for (let s = 0; s <= len; s += 0.5) {
      const px = x0 + Math.cos(ang) * s;
      const py = y0 + Math.sin(ang) * s;
      for (let y = Math.ceil(py - t / 2); y < py + t / 2; y++)
        for (let x = Math.ceil(px - t / 2); x < px + t / 2; x++)
          if (x >= 0 && x < w && y >= 0 && y < h) data[y * w + x] = 1;
    }
  }
  return { data, width: w, height: h };
}

/** Erosao/dilatacao direta por uma lista de deslocamentos; fora da imagem e neutro. */
function bruteMorph(m: Mask, offs: [number, number][], erode: boolean): Mask {
  return mask(m.width, m.height, (x, y) => {
    for (const [ox, oy] of offs) {
      const xx = x + ox;
      const yy = y + oy;
      if (xx < 0 || yy < 0 || xx >= m.width || yy >= m.height) continue;
      const v = m.data[yy * m.width + xx];
      if (erode && !v) return false;
      if (!erode && v) return true;
    }
    return erode;
  });
}

function diffWithin(a: Mask, b: Mask, frac: number): void {
  let diff = 0;
  let on = 0;
  for (let i = 0; i < a.data.length; i++) {
    diff += a.data[i] !== b.data[i] ? 1 : 0;
    on += a.data[i];
  }
  expect(diff).toBeLessThanOrEqual(Math.max(5, frac * on));
}

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

  it('openDisk aproxima openEllipse: diferenca <= 3% dos pixels ligados em manchas aleatorias', () => {
    const m = randomBlobs(200, 120, 7);
    for (const size of [3, 5, 7, 9, 13, 17]) diffWithin(openEllipse(m, size), openDisk(m, size), 0.03);
  });

  it('closeDisk aproxima closeEllipse nas mesmas manchas (<= 5%; identico ate size 9)', () => {
    const m = randomBlobs(200, 120, 7);
    for (const size of [3, 5, 7, 9, 13, 17]) diffWithin(closeEllipse(m, size), closeDisk(m, size), 0.05);
  });

  it('openDisk(7) apaga traco de 3 px e preserva mancha de 14 px', () => {
    const m = mask(40, 40, (x, y) => (x >= 3 && x < 6 && y >= 2 && y < 38) || (x >= 20 && x < 34 && y >= 20 && y < 34));
    const o = openDisk(m, 7);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 10; x++) expect(o.data[y * 40 + x]).toBe(0);
    expect(o.data[27 * 40 + 27]).toBe(1);
    expect(count(o)).toBeGreaterThan(0.85 * 196);
  });

  it('erodeOctagon/dilateOctagon e erodeRect/dilateRect batem com o elemento direto, inclusive em bordas de palavra', () => {
    for (const [w, h, dens] of [[30, 20, 0.05], [70, 41, 0.85], [64, 33, 0.5]] as const) {
      const rnd = mulberry32(w);
      const m = mask(w, h, () => rnd() < dens);
      for (const o of [{ a: 1, p: 1 }, { a: 0, p: 2 }, { a: 1, p: 2 }, { a: 3, p: 6 }, { a: 2, p: 5 }, { a: 0, p: 40 }]) {
        const f = (o.p - 1) >> 1;
        const c = o.p - 1 - f;
        const offs: [number, number][] = [];
        for (let i = -f; i <= c; i++)
          for (let j = -f; j <= c; j++)
            for (let dy = -o.a; dy <= o.a; dy++)
              for (let dx = -o.a; dx <= o.a; dx++) offs.push([i + j - (c - f) + dx, i - j + dy]);
        expect(Array.from(erodeOctagon(m, o).data)).toEqual(Array.from(bruteMorph(m, offs, true).data));
        expect(Array.from(dilateOctagon(m, o).data)).toEqual(Array.from(bruteMorph(m, offs, false).data));
      }
      const rect: [number, number][] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -3; dx <= 3; dx++) rect.push([dx, dy]);
      expect(Array.from(erodeRect(m, 7, 3).data)).toEqual(Array.from(bruteMorph(m, rect, true).data));
      expect(Array.from(dilateRect(m, 7, 3).data)).toEqual(Array.from(bruteMorph(m, rect, false).data));
    }
  });
});
