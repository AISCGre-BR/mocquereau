import { describe, expect, it } from 'vitest';
import {
  buildAdiastematicLine,
  buildDiastematicLine,
  createRaster,
  drawNeume,
  fillRect,
  INK,
  iou,
  mulberry32,
  rotateRaster90,
  unionBox,
  upscaleRasterNearest,
} from './synthetic';

describe('synthetic', () => {
  it('mulberry32 e deterministico', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('fillRect corta ao raster e devolve a caixa pintada', () => {
    const r = createRaster(10, 10);
    expect(fillRect(r, 8, 8, 5, 5)).toEqual({ x: 8, y: 8, w: 2, h: 2 });
    expect(Array.from(r.data.subarray((9 * 10 + 9) * 4, (9 * 10 + 9) * 4 + 3))).toEqual([...INK]);
  });

  it('drawNeume devolve a caixa da tinta', () => {
    const r = createRaster(100, 100);
    const b = drawNeume(r, 'virga', 10, 10, 3);
    expect(b).toEqual({ x: 10, y: 10, w: 6, h: 21 });
  });

  it('rotateRaster90 e uma permutacao exata; 4 voltas = identidade', () => {
    const r = createRaster(7, 3);
    fillRect(r, 0, 0, 1, 1);
    const q = rotateRaster90(r, 1);
    expect([q.width, q.height]).toEqual([3, 7]);
    // (0,0) vai para (h-1-0, 0) = (2, 0)
    expect(q.data[(0 * 3 + 2) * 4]).toBe(INK[0]);
    expect(Buffer.from(rotateRaster90(r, 4).data).equals(Buffer.from(r.data))).toBe(true);
  });

  it('iou e unionBox', () => {
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 0, w: 10, h: 10 })).toBeCloseTo(50 / 150);
    expect(unionBox([{ x: 0, y: 0, w: 2, h: 2 }, { x: 5, y: 5, w: 1, h: 1 }])).toEqual({ x: 0, y: 0, w: 6, h: 6 });
  });

  it('fixtures: verdades nao se sobrepoem e ficam acima do texto', () => {
    const a = buildAdiastematicLine();
    const xs = a.syllables.map((s) => a.truth[s.index]);
    for (let i = 0; i + 1 < xs.length; i++) expect(xs[i].x + xs[i].w).toBeLessThan(xs[i + 1].x);
    for (const t of xs) expect(t.y + t.h).toBeLessThan(a.baseline - 2 * a.xHeight);
    const d = buildDiastematicLine();
    expect(d.syllables).toHaveLength(4);
    expect(d.bar.x).toBeGreaterThan(d.ink[2].x + d.ink[2].w);
    expect(d.bar.x + d.bar.w).toBeLessThan(d.ink[3].x);
    expect(upscaleRasterNearest(a.raster, 2).width).toBe(2400);
  });
});
