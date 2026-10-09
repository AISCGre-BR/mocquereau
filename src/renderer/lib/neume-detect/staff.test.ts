import { describe, expect, it } from 'vitest';
import { extractChannel } from './image';
import { staffMetrics } from './scale';
import {
  classifySpecialGlyphs,
  findStaves,
  findStavesRobust,
  isBarLine,
  removalLimit,
  removeStaffLines,
  staffCoverage,
  type Staff,
} from './staff';
import { buildDiastematicLine, createRaster, drawStaff, fillRect, RED_LINE, staffLineTop, type StaffSpec } from './synthetic';
import { binarizeOtsu } from './threshold';
import type { Mask, RasterRGBA } from './types';

const grayInk = (r: RasterRGBA): Mask => binarizeOtsu(extractChannel(r, 'gray'));
const center = (spec: StaffSpec, i: number, x: number) => staffLineTop(spec, i, x) + (spec.t - 1) / 2;

function detect(r: RasterRGBA): Staff {
  const ink = grayInk(r);
  const m = staffMetrics(ink)!;
  const staves = findStaves(ink, m);
  expect(staves.length).toBeGreaterThanOrEqual(1);
  return staves[0];
}

describe('staff', () => {
  it.each([
    [4, 1],
    [4, 2],
    [4, 3],
    [5, 2],
    [5, 4],
  ])('acha pauta de %i linhas com espessura %i', (lines, t) => {
    const spec: StaffSpec = { x0: 30, x1: 1170, yTop: 60, lines, d: 13, t };
    const r = createRaster(1200, 260);
    drawStaff(r, spec);
    const st = detect(r);
    expect(st.lines).toHaveLength(lines);
    expect(st.metrics.t).toBe(t);
    expect(st.metrics.d).toBe(13);
    expect(Math.abs(st.x0 - 30)).toBeLessThanOrEqual(2);
    expect(Math.abs(st.x1 - 1170)).toBeLessThanOrEqual(2);
    st.lines.forEach((l, i) => expect(Math.abs(l.mean - center(spec, i, 600))).toBeLessThanOrEqual(1));
  });

  it('acha pauta inclinada 6° (runs curtas na segunda tentativa) e devolve o ângulo', () => {
    const r = createRaster(700, 300);
    drawStaff(r, { x0: 40, x1: 660, yTop: 40, lines: 4, d: 14, t: 2, tiltDeg: 6 });
    const ink = binarizeOtsu(extractChannel(r, 'gray'), null);
    const m = staffMetrics(ink)!;
    expect(findStaves(ink, m)).toEqual([]); // runs >= 3d nao existem a 6 graus
    const st = findStavesRobust(ink, m);
    expect(st).toHaveLength(1);
    expect(st[0].lines).toHaveLength(4);
    expect(st[0].angleDeg).toBeCloseTo(6, 0);
  });

  it('pauta reta: mesmo resultado de antes (ângulo 0, mesmas linhas)', () => {
    const fx = buildDiastematicLine({ noise: false });
    const ink = binarizeOtsu(extractChannel(fx.raster, 'gray'), null);
    const st = findStavesRobust(ink, staffMetrics(ink)!);
    expect(st[0].angleDeg).toBe(0);
    // mesma formula do teste reto acima: centro = topo + (t - 1) / 2
    st[0].lines.forEach((l, i) => expect(Math.abs(l.mean - (fx.staff.yTop + i * 16 + 0.5))).toBeLessThanOrEqual(0.5));
  });

  it('rastreia inclinacao de 1 grau e curvatura leve (+-1 px)', () => {
    const spec: StaffSpec = { x0: 20, x1: 1980, yTop: 50, lines: 4, d: 14, t: 2, tiltDeg: 1, bend: 3 };
    const r = createRaster(2000, 200);
    drawStaff(r, spec);
    const st = detect(r);
    expect(st.lines).toHaveLength(4);
    for (const x of [100, 500, 1000, 1500, 1900])
      st.lines.forEach((l, i) => expect(Math.abs(l.ys[x] - center(spec, i, x))).toBeLessThanOrEqual(1));
  });

  it('remocao apaga a pauta e preserva 100% das notas que a cruzam', () => {
    const spec: StaffSpec = { x0: 20, x1: 1180, yTop: 60, lines: 4, d: 14, t: 2 };
    const withStaff = createRaster(1200, 200);
    const notesOnly = createRaster(1200, 200);
    drawStaff(withStaff, spec);
    for (const r of [withStaff, notesOnly]) {
      for (let k = 0; k < 12; k++) {
        const li = k % 4;
        const onLine = k % 2 === 0;
        const y = onLine ? Math.round(center(spec, li, 0) - 6) : staffLineTop(spec, Math.min(li, 2), 0) + spec.t + 1;
        fillRect(r, 80 + k * 90, y, 12, 12);
      }
      fillRect(r, 1100, 50, 3, 70); // barra cruzando todas as linhas
    }
    const st = detect(withStaff);
    const cleaned = removeStaffLines(grayInk(withStaff), st);
    const notes = grayInk(notesOnly);
    let lost = 0;
    let residual = 0;
    for (let i = 0; i < notes.data.length; i++) {
      if (notes.data[i] && !cleaned.data[i]) lost++;
      if (!notes.data[i] && cleaned.data[i]) residual++;
    }
    expect(lost).toBe(0);
    expect(residual).toBeLessThanOrEqual(0.01 * 4 * 1160 * 2);
  });

  it('pauta vermelha: aparece no cinza, quase nao aparece no canal R', () => {
    const spec: StaffSpec = { x0: 20, x1: 1180, yTop: 60, lines: 4, d: 14, t: 2, color: RED_LINE };
    const r = createRaster(1200, 200);
    drawStaff(r, spec);
    fillRect(r, 300, 70, 12, 12);
    const st = detect(r);
    expect(st.lines).toHaveLength(4);
    const rInk = binarizeOtsu(extractChannel(r, 'r'));
    expect(staffCoverage(rInk, st)).toBeLessThan(0.3);
    expect(staffCoverage(grayInk(r), st)).toBeGreaterThan(0.9);
  });

  it('sem linhas longas nao ha pauta', () => {
    const r = createRaster(800, 200);
    for (let k = 0; k < 20; k++) fillRect(r, 20 + k * 38, 60 + (k % 5) * 10, 12, 12);
    const ink = grayInk(r);
    const m = staffMetrics(ink);
    expect(m ? findStaves(ink, m) : []).toEqual([]);
  });

  it('removalLimit segue t + max(1, round(0,5t))', () => {
    expect([removalLimit(1), removalLimit(2), removalLimit(3), removalLimit(4)]).toEqual([2, 3, 5, 6]);
  });

  it('barras, clave e custos', () => {
    const spec: StaffSpec = { x0: 40, x1: 1360, yTop: 60, lines: 4, d: 14, t: 2 };
    const r = createRaster(1400, 200);
    drawStaff(r, spec);
    const st = detect(r);
    expect(isBarLine({ x: 600, y: 58, w: 3, h: 54 }, st, 2)).toBe(true);
    expect(isBarLine({ x: 600, y: 58, w: 12, h: 12 }, st, 2)).toBe(false);
    expect(isBarLine({ x: 600, y: 150, w: 3, h: 40 }, st, 2)).toBe(false);
    const glyphs = [
      { x: 48, y: 60, w: 14, h: 34, area: 296 }, // clave
      { x: 140, y: 70, w: 12, h: 12, area: 144 },
      { x: 500, y: 70, w: 12, h: 12, area: 144 },
      { x: 900, y: 70, w: 12, h: 12, area: 144 },
      { x: 1348, y: 68, w: 7, h: 12, area: 46 }, // custos
    ];
    const sp = classifySpecialGlyphs(glyphs, st, { firstX: 140, lastX: 1100 });
    expect(sp).toEqual({ clef: [0], custos: [4] });
    // custos grande (area >= 0,6 x mediana) nao e custos
    glyphs[4] = { ...glyphs[4], area: 144 };
    expect(classifySpecialGlyphs(glyphs, st, { firstX: 140, lastX: 1100 }).custos).toEqual([]);
  });
});
