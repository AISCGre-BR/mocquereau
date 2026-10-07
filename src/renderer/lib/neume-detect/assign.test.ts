import { describe, expect, it } from 'vitest';
import { cutScores, expectedCenters, groupConfidence, overlapFraction, partitionDP, segmentByAnchors, type Glyph } from './assign';
import type { SuggestSyllable } from './types';

const g = (x: number, w = 10): Glyph => ({ x, y: 10, w, h: 10, area: w * 10 });
const syl = (index: number, text = 'ab', wordIndex = index): SuggestSyllable => ({ index, text, wordIndex });

describe('assign', () => {
  it('particiona K grupos com vaos claros', () => {
    const glyphs = [g(0), g(15), g(100), g(115), g(130), g(250)];
    const cuts = cutScores(glyphs, [], []);
    const p = partitionDP(glyphs, [10, 120, 255], 0, 300, cuts);
    expect(p.groups).toEqual([[0, 2], [2, 5], [5, 6]]);
    const conf = groupConfidence(p, cuts, glyphs.length);
    expect(conf.every((v) => v > 0.5)).toBe(true);
  });

  it('M < K deixa grupos vazios sem lancar', () => {
    const glyphs = [g(0), g(200)];
    const p = partitionDP(glyphs, [5, 100, 205], 0, 300, cutScores(glyphs, [], []));
    expect(p.groups.filter(Boolean)).toHaveLength(2);
    expect(p.groups[1]).toBeNull();
  });

  it('barra de divisao forca o corte entre vaos iguais', () => {
    const glyphs = [g(0), g(30), g(60), g(90)];
    const noBar = partitionDP(glyphs, [30, 70], 0, 100, cutScores(glyphs, [], []));
    const withBar = partitionDP(glyphs, [30, 70], 0, 100, cutScores(glyphs, [25], []));
    expect(noBar.groups).toEqual([[0, 2], [2, 4]]);
    expect(withBar.groups).toEqual([[0, 1], [1, 4]]);
  });

  it('cutScores: vao / mediana + 2 barra + 1 palavra', () => {
    const glyphs = [g(0), g(20), g(40), g(100)];
    const c = cutScores(glyphs, [70], [30]);
    expect(Array.from(c)).toEqual([1, 1 + 1, 5 + 2]);
  });

  it('ancoras dividem segmentos; glifo dentro da ancora e descartado', () => {
    const sy = [syl(0), syl(1), syl(2), syl(3)];
    const glyphs = [g(10), g(105), g(200), g(300)];
    const segs = segmentByAnchors(sy, [{ index: 1, box: { x: 100, y: 0, w: 30, h: 40 } }], glyphs, 0, 400);
    expect(segs.map((s) => [s.L, s.R, s.syllables.map((x) => x.index), s.glyphs.map((x) => x.x)])).toEqual([
      [0, 100, [0], [10]],
      [130, 400, [2, 3], [200, 300]],
    ]);
    expect(overlapFraction(g(105), { x: 100, y: 0, w: 30, h: 40 })).toBe(1);
  });

  it('centro esperado proporcional as letras, +1 por fronteira de palavra; ou pela faixa da palavra', () => {
    const seg = { L: 0, R: 100, syllables: [syl(0, 'ab', 0), syl(1, 'ab', 0), syl(2, 'abcd', 1)], glyphs: [] };
    // posicoes: 1, 3, (4 + 1 + 2) = 7, total 9
    expect(expectedCenters(seg, null).map((v) => +v.toFixed(3))).toEqual([11.111, 33.333, 77.778]);
    expect(expectedCenters(seg, [{ x0: 0, x1: 40 }, { x0: 60, x1: 100 }])).toEqual([10, 30, 80]);
  });
});
