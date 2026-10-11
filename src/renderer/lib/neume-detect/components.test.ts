import { describe, expect, it } from 'vitest';
import { dropIsolatedSpecks, filterComponents, labelComponents, labelsTouching, passesFilters } from './components';
import { deriveParams } from './scale';
import type { Mask } from './types';

function mask(rows: string[]): Mask {
  const h = rows.length;
  const w = rows[0].length;
  const data = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => (data[y * w + x] = c === '#' ? 1 : 0)));
  return { data, width: w, height: h };
}

describe('components', () => {
  it('conta componentes com 8-conexidade (diagonal liga) e calcula caixas e areas', () => {
    const m = mask([
      '#.....##', //
      '.#....##',
      '..#.....',
      '........',
      '###.....',
    ]);
    const lab = labelComponents(m);
    expect(lab.count).toBe(3);
    expect(lab.components.map(({ x, y, w, h, area }) => ({ x, y, w, h, area }))).toEqual([
      { x: 0, y: 0, w: 3, h: 3, area: 3 },
      { x: 6, y: 0, w: 2, h: 2, area: 4 },
      { x: 0, y: 4, w: 3, h: 1, area: 3 },
    ]);
  });

  it('formato em U exige uniao de rotulos (duas passadas)', () => {
    const m = mask(['#...#', '#...#', '#...#', '#####']);
    const lab = labelComponents(m);
    expect(lab.count).toBe(1);
    expect(lab.components[0].area).toBe(11);
    expect(new Set(Array.from(lab.labels).filter(Boolean))).toEqual(new Set([1]));
  });

  it('labelsTouching e filtros de area, lado e aspecto', () => {
    const m = mask(['##........', '##........', '..........', '....######']);
    const lab = labelComponents(m);
    const invalid = mask(['#.........', '..........', '..........', '..........']);
    expect(labelsTouching(lab, invalid)).toEqual(new Set([1]));
    const p = { ...deriveParams(1.5), minArea: 2, minSide: 1 };
    expect(passesFilters(lab.components[0], p)).toBe(true);
    expect(passesFilters(lab.components[1], { ...p, maxAspect: 5 })).toBe(false);
    expect(passesFilters(lab.components[0], { ...p, minArea: 5 })).toBe(false);
    expect(filterComponents(lab, p, new Set([1])).map((c) => c.label)).toEqual([2]);
  });

  it('dropIsolatedSpecks: ponto de até u² só fica perto de um componente maior', () => {
    const c = (x: number, y: number, w: number, h: number, area = w * h) => ({ label: 0, x, y, w, h, area });
    const neume = c(100, 100, 6, 18, 40);
    const near = c(110, 100, 3, 3); // folga 4 <= 6u
    const far = c(200, 100, 3, 3); // isolado
    const punctum = c(300, 100, 4, 4); // 16 > u² = 9: nunca é ponto
    expect(dropIsolatedSpecks([neume, near, far, punctum], 3, 18)).toEqual([neume, near, punctum]);
  });
});
