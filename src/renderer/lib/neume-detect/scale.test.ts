import { describe, expect, it } from 'vitest';
import { extractChannel } from './image';
import { deriveParams, estimateStrokeWidth, odd, staffMetrics, strokeWidthOutside } from './scale';
import { createRaster, drawNeume, drawStaff, drawText } from './synthetic';
import { binarizeOtsu } from './threshold';
import type { Mask } from './types';

const inkOf = (r: ReturnType<typeof createRaster>): Mask => binarizeOtsu(extractChannel(r, 'gray'));

describe('scale', () => {
  it.each([2, 3, 6])('estima u = %i dentro de +-1 px', (u) => {
    const r = createRaster(800, 300);
    const shapes = ['virga', 'pes', 'clivis', 'torculus', 'punctum'] as const;
    for (let i = 0; i < 15; i++) drawNeume(r, shapes[i % 5], 20 + i * 50, 30, u);
    drawText(r, 'dominus', 40, 250, 8 * u, u);
    expect(Math.abs(estimateStrokeWidth(inkOf(r)) - u)).toBeLessThanOrEqual(1);
  });

  it('sem tinta devolve 0; traco de 1 px e limitado a 1,5', () => {
    expect(estimateStrokeWidth({ data: new Uint8Array(100), width: 10, height: 10 })).toBe(0);
    const r = createRaster(200, 100);
    for (let i = 0; i < 10; i++) drawNeume(r, 'virga', 10 + i * 18, 20, 1);
    expect(estimateStrokeWidth(inkOf(r))).toBe(1.5);
  });

  it.each([
    [2, 14],
    [3, 12],
    [1, 10],
  ])('metricas de pauta: t = %i, d = %i', (t, d) => {
    const r = createRaster(600, 200);
    drawStaff(r, { x0: 20, x1: 580, yTop: 50, lines: 4, d, t });
    const m = staffMetrics(inkOf(r))!;
    expect(m.t).toBe(t);
    expect(m.d).toBe(d);
    expect(m.s).toBe(t + d);
  });

  it('filtros mínimos: 0,35u² e max(2, 0,5u)', () => {
    expect(deriveParams(4).minArea).toBeCloseTo(5.6, 9);
    expect(deriveParams(4).minSide).toBe(2);
    expect(deriveParams(6).minSide).toBe(3);
  });

  it('strokeWidthOutside ignora as linhas excluídas', () => {
    const m = { data: new Uint8Array(40 * 40), width: 40, height: 40 };
    const fill = (x: number, y: number, w: number, h: number) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) m.data[yy * 40 + xx] = 1; };
    fill(2, 2, 2, 12); fill(10, 2, 2, 12);            // tracos finos (u = 2) em cima
    fill(2, 25, 30, 6); fill(2, 33, 6, 6);            // "texto" grosso (6) embaixo, mais pixels
    expect(estimateStrokeWidth(m)).toBe(6);
    expect(strokeWidthOutside(m, [{ y0: 20, y1: 40 }])).toBe(2);
  });

  it('deriveParams(3) reproduz os valores do Othmar a 2400 px (filtros minimos menores, M4a)', () => {
    const p = deriveParams(3);
    expect(p.window).toBe(31);
    expect(p.darkOpen).toBe(7);
    expect(p.darkMargin).toBe(3);
    expect(p.minArea).toBeCloseTo(3.15);
    expect(p.maxArea).toBe(1530);
    expect(p.minSide).toBe(2);
    expect(p.maxSide).toBe(90);
    expect(p.mergeGapX).toBeCloseTo(3.9);
    expect(p.mergeGapY).toBe(6);
    expect([p.mergeMaxW, p.mergeMaxH]).toEqual([60, 60]);
  });

  it('deriveParams no modo D usa s = d + t', () => {
    const p = deriveParams(2, { t: 2, d: 14, s: 16 });
    expect(p.window).toBe(25);
    expect(p.darkOpen).toBe(25);
    expect(p.maxSide).toBe(80);
    expect(p.mergeGapX).toBeCloseTo(4.8);
    expect(p.mergeGapY).toBe(8);
    expect([p.mergeMaxW, p.mergeMaxH]).toEqual([48, 64]);
  });

  it('odd arredonda para impar >= 3', () => {
    expect([odd(1), odd(6.9), odd(30), odd(31)]).toEqual([3, 7, 31, 31]);
  });
});
