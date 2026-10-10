import { describe, expect, it } from 'vitest';
import { cutScores, expectedCenters, fitCount, groupConfidence, overlapFraction, partitionDP, type Glyph } from './assign';
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

  it('overlapFraction: fracao de b dentro de a', () => {
    expect(overlapFraction(g(105), { x: 100, y: 0, w: 30, h: 40 })).toBe(1);
    expect(overlapFraction(g(125), { x: 100, y: 0, w: 30, h: 40 })).toBe(0.5);
  });

  it('centro esperado proporcional as letras, +1 por fronteira de palavra; ou pela faixa da palavra', () => {
    const seg = { L: 0, R: 100, syllables: [syl(0, 'ab', 0), syl(1, 'ab', 0), syl(2, 'abcd', 1)], glyphs: [] };
    // posicoes: 1, 3, (4 + 1 + 2) = 7, total 9
    expect(expectedCenters(seg, null).map((v) => +v.toFixed(3))).toEqual([11.111, 33.333, 77.778]);
    expect(expectedCenters(seg, [{ x0: 0, x1: 40 }, { x0: 60, x1: 100 }])).toEqual([10, 30, 80]);
  });
});

const letterBoxes = (n: number, x0 = 0) => Array.from({ length: n }, (_, i) => ({ x: x0 + i * 16, y: 100, w: 12, h: 16 }));

describe('fitCount', () => {
  it('texto com as letras das 9 primeiras sílabas: 9, mesmo com 30 na fila', () => {
    const queue = Array.from({ length: 30 }, (_, i) => syl(i, 'ta'));
    const glyphs = Array.from({ length: 20 }, (_, i) => g(i * 40));
    expect(fitCount(queue, glyphs, letterBoxes(18))).toBe(9);
  });
  it('melisma: uma sílaba de 3 letras com 6 agrupamentos e o texto só dela: 1', () => {
    const queue = [syl(0, 'tus'), syl(1, 'est'), syl(2, 'no')];
    const glyphs = [0, 60, 120, 180, 240, 300].map((x) => g(x));
    expect(fitCount(queue, glyphs, letterBoxes(3))).toBe(1);
  });
  it('sem texto: um por agrupamento separado por vão >= 2x o mediano', () => {
    const queue = Array.from({ length: 10 }, (_, i) => syl(i, 'a'));
    // tres grupos: [0,15,30] [100,115] [200]: vaos 5,5,60,5,75 -> mediana 5
    const glyphs = [0, 15, 30, 100, 115, 200].map((x) => g(x));
    expect(fitCount(queue, glyphs, [])).toBe(3);
  });
  it('nunca mais que os glifos; sem glifos, 0', () => {
    const queue = Array.from({ length: 12 }, (_, i) => syl(i, 'ta'));
    expect(fitCount(queue, [g(0), g(50), g(100), g(150)], letterBoxes(18))).toBe(4);
    expect(fitCount(queue, [], letterBoxes(18))).toBe(0);
  });
  it('letras unidas contam pela largura (ligadura de 2 letras = 2)', () => {
    const queue = [syl(0, 'st'), syl(1, 'a'), syl(2, 'bo')];
    const text = [{ x: 0, y: 0, w: 24, h: 16 }, { x: 30, y: 0, w: 12, h: 16 }, { x: 50, y: 0, w: 12, h: 16 }];
    expect(fitCount(queue, [g(0), g(40), g(80)], text)).toBe(2);
  });
});

describe('fitCount — robustez (melisma, palavras unidas, canto silábico, ruído)', () => {
  const glyphs = (n: number, step = 60) => Array.from({ length: n }, (_, i) => g(i * step));
  const queueOf = (...t: string[]) => t.map((s, i) => syl(i, s));
  // 6 agrupamentos nítidos de 2 glifos (vãos 5 e 55): sem texto, contariam 6
  const clusters6 = Array.from({ length: 12 }, (_, i) => g(Math.floor(i / 2) * 80 + (i % 2) * 15));

  it('melisma sobre uma vogal com 1 componente de texto: 1', () => {
    const q = queueOf('e', 'ta', 'ta', 'ta', 'ta', 'ta');
    expect(fitCount(q, clusters6, [{ x: 0, y: 100, w: 12, h: 16 }])).toBe(1);
  });
  it('melisma com 2 componentes de texto (t com haste + "us"): 1', () => {
    const q = queueOf('tus', 'est', 'no', 'bis', 'ta', 'ta');
    const text = [{ x: 0, y: 84, w: 12, h: 32 }, { x: 12, y: 100, w: 24, h: 16 }];
    expect(fitCount(q, clusters6, text)).toBe(1);
  });
  it('palavras unidas num componente: a altura-x segura a unidade (Glo-ri-a in ex-cel-sis De-o)', () => {
    const q = queueOf('Glo', 'ri', 'a', 'in', 'ex', 'cel', 'sis', 'De', 'o', 'et', 'in', 'ter', 'ra', 'pax');
    // letras de 12 px encostadas; palavras com haste têm 2xh de altura
    const text = [
      { x: 0, y: 84, w: 72, h: 32 },
      { x: 90, y: 100, w: 24, h: 16 },
      { x: 130, y: 84, w: 96, h: 32 },
      { x: 240, y: 84, w: 36, h: 32 },
    ];
    expect(Math.abs(fitCount(q, glyphs(20), text, { xHeight: 16 }) - 9)).toBeLessThanOrEqual(1);
  });
  it('canto silábico sem texto: 10 glifos igualmente espaçados com vão >= 12u: 10', () => {
    const q = Array.from({ length: 15 }, (_, i) => syl(i, 'ta'));
    expect(Math.abs(fitCount(q, glyphs(10, 40), [], { u: 2 }) - 10)).toBeLessThanOrEqual(1);
  });
  it('sem texto, com u: vãos internos de um neuma (< 12u) não cortam', () => {
    const q = Array.from({ length: 10 }, (_, i) => syl(i, 'a'));
    expect(fitCount(q, [0, 15, 30, 100, 115, 200].map((x) => g(x)), [], { u: 2 })).toBe(3);
  });
  it('ruído (pingos, traços, pontuação) não infla a contagem', () => {
    const q = Array.from({ length: 30 }, (_, i) => syl(i, 'ta'));
    const specks = Array.from({ length: 6 }, (_, i) => ({ x: 300 + i * 10, y: 90, w: 4, h: 4 }));
    expect(fitCount(q, glyphs(20, 40), [...letterBoxes(18), ...specks])).toBe(9);
  });
  it('mão de letras largas (largura = altura-x): a unidade vem das letras soltas, não de 0,75xh', () => {
    const q = Array.from({ length: 30 }, (_, i) => syl(i, 'ta'));
    const wide = Array.from({ length: 18 }, (_, i) => ({ x: i * 20, y: 100, w: 16, h: 16 }));
    expect(fitCount(q, glyphs(20, 40), wide, { xHeight: 16 })).toBe(9);
  });
  // Limitação conhecida: abreviaturas escrevem menos letras que a silabação ("dñs" por Do-mi-nus).
  it.todo('abreviaturas ("dñs" = Do-mi-nus) contam as sílabas da forma por extenso');
});

describe('partitionDP aberto (contagem incerta)', () => {
  // colunas de 2 glifos (vao interno 5), colunas separadas por 70: cortes fortes entre colunas
  const columns = (n: number) => Array.from({ length: 2 * n }, (_, i) => g(Math.floor(i / 2) * 100 + (i % 2) * 15));
  const run = (cols: number, K: number) => {
    const glyphs = columns(cols);
    const L = glyphs[0].x;
    const R = glyphs[glyphs.length - 1].x + 10;
    const sy = Array.from({ length: K }, (_, i) => syl(i, 'ta'));
    const expected = expectedCenters({ L, R, syllables: sy, glyphs }, null);
    const cuts = cutScores(glyphs, [], []);
    return { glyphs, open: partitionDP(glyphs, expected, L, R, cuts, { open: true }), closed: partitionDP(glyphs, expected, L, R, cuts) };
  };
  const colOf = (gr: [number, number]) => [Math.floor(gr[0] / 2), Math.floor((gr[1] - 1) / 2)];

  it('contagem de menos (6 sílabas, 7 colunas): as 6 primeiras colunas, sem deslocar; a cauda fica', () => {
    const { open, closed } = run(7, 6);
    expect(open.used).toBe(6);
    expect(open.glyphsUsed).toBe(12);
    expect(open.groups.map((gr) => colOf(gr!))).toEqual([0, 1, 2, 3, 4, 5].map((c) => [c, c]));
    // o modo fechado junta duas colunas em algum grupo
    expect(closed.groups.some((gr) => gr && colOf(gr)[0] !== colOf(gr)[1])).toBe(true);
  });
  it('contagem de mais (6 sílabas, 5 colunas): nenhuma coluna partida; a sobra fica sem grupo', () => {
    const { open } = run(5, 6);
    for (const gr of open.groups) if (gr) expect(gr[1] - gr[0]).toBe(2);
    expect(open.used).toBe(5);
    expect(open.glyphsUsed).toBe(10);
  });
  it('agrupamentos fundidos (7 colunas, as 2 primeiras quase encostadas): a sílaba a mais parte o vão fraco', () => {
    // colunas de 2 glifos a cada 90 px (vão interno 5); as colunas 0 e 1 são largas e ficam a 7 px
    // uma da outra (corte 1,4 < CLUSTER_CUT): um só agrupamento, como Do-mi no SG339
    const glyphs = [g(0, 40), g(45, 40), g(92, 40), g(137, 40)];
    for (let k = 2; k < 7; k++) glyphs.push(g(90 * k + 20, 20), g(90 * k + 45, 20));
    const cuts = cutScores(glyphs, [], []);
    let clusters = 1;
    for (const c of cuts) if (c >= 2) clusters++;
    expect(clusters).toBe(6);
    const sy = Array.from({ length: 7 }, (_, i) => syl(i, 'ta'));
    const expected = expectedCenters({ L: 0, R: 605, syllables: sy, glyphs }, null);
    const p = partitionDP(glyphs, expected, 0, 605, cuts, { open: true, lastExtra: true });
    expect(p.used).toBe(7);
    expect(p.groups).toEqual([0, 1, 2, 3, 4, 5, 6].map((c) => [2 * c, 2 * c + 2]));
  });
  it('sílaba a mais sem vão fraco que valha: fica sem grupo, nenhuma coluna partida', () => {
    const { glyphs } = run(5, 5);
    const sy = Array.from({ length: 6 }, (_, i) => syl(i, 'ta'));
    const expected = expectedCenters({ L: 0, R: 410, syllables: sy, glyphs }, null);
    const p = partitionDP(glyphs, expected, 0, 410, cutScores(glyphs, [], []), { open: true, lastExtra: true });
    expect(p.used).toBe(5);
    for (const gr of p.groups) if (gr) expect(gr[1] - gr[0]).toBe(2);
  });
  it('contagem certa: igual ao modo fechado', () => {
    const { open, closed } = run(6, 6);
    expect(open.groups).toEqual(closed.groups);
    expect(open.used).toBe(6);
  });
});
