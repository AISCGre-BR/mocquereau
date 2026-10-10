import { describe, expect, it } from 'vitest';
import { extractChannel } from './image';
import { anchorStaffOffsets, measureU, suggestBoxes } from './pipeline';
import { estimateStrokeWidth, staffMetrics } from './scale';
import { findStavesRobust } from './staff';
import { binarizeOtsu } from './threshold';
import type { RasterRGBA } from './types';
import {
  buildAdiastematicLine,
  buildDiastematicLine,
  createRaster,
  fillRect,
  INK,
  drawNeume,
  drawStaff,
  drawText,
  LIGHT_RED_LINE,
  RED_LINE,
  fracToPx,
  iou,
  pxToFrac,
  staffLineTop,
  rotateRaster90,
  scaleBox,
  upscaleRasterNearest,
} from './synthetic';
import type { PxBox, SuggestResult } from './types';

function boxesPx(res: SuggestResult, w: number, h: number): Record<number, PxBox> {
  const out: Record<number, PxBox> = {};
  for (const s of res.suggestions) out[s.index] = fracToPx(s.box, w, h);
  return out;
}

describe('suggestBoxes — adiastematico', () => {
  it('5 silabas com texto abaixo e mancha escura: uma caixa por silaba, IoU >= 0,9', () => {
    const fx = buildAdiastematicLine({ stain: true });
    const { width: W, height: H } = fx.raster;
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: fx.syllables });
    expect(res.debug.mode).toBe('A');
    expect(res.debug.bandSource).toBe('image');
    expect(res.debug.strokeWidth).toBe(3);
    expect(res.debug.textLine?.baseline).toBeCloseTo(fx.baseline, 0);
    expect(res.suggestions.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
    const got = boxesPx(res, W, H);
    for (const s of fx.syllables) expect(iou(got[s.index], fx.truth[s.index])).toBeGreaterThanOrEqual(0.9);
    for (const s of res.suggestions) expect(s.confidence).toBeGreaterThanOrEqual(0.2);
  });

  it('e deterministico (mesma entrada, mesmas caixas)', () => {
    const fx = buildAdiastematicLine({ seed: 3 });
    const a = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: fx.syllables });
    const b = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: fx.syllables });
    expect(b.suggestions).toEqual(a.suggestions);
  });

  it('ancora divide a linha: nenhuma sugestao para a silaba ancorada; vizinhas corretas', () => {
    const fx = buildAdiastematicLine({ seed: 5 });
    const { width: W, height: H } = fx.raster;
    const anchors = [{ index: 2, box: pxToFrac(fx.truth[2], W, H) }];
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: fx.syllables, anchors });
    expect(res.debug.bandSource).toBe('anchors');
    expect(res.suggestions.map((s) => s.index)).toEqual([0, 1, 3, 4]);
    const got = boxesPx(res, W, H);
    for (const i of [0, 1, 3, 4]) expect(iou(got[i], fx.truth[i])).toBeGreaterThanOrEqual(0.9);
    const a = fx.truth[2];
    for (const i of [0, 1, 3, 4]) {
      const b = got[i];
      expect(Math.min(a.x + a.w, b.x + b.w) <= Math.max(a.x, b.x) + 1e-9).toBe(true);
    }
  });

  it('ancora mal colocada (fora de ordem) nao gera sugestao atravessada', () => {
    const fx = buildAdiastematicLine({ seed: 5 });
    const { width: W, height: H } = fx.raster;
    // ancora da silaba 1 desenhada sobre os neumas da silaba 3
    const anchors = [{ index: 1, box: pxToFrac(fx.truth[3], W, H) }];
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: fx.syllables, anchors });
    const got = boxesPx(res, W, H);
    // M2: a ancora corta a fila na sua posicao: a silaba 0 fica antes dela, e depois so cabe o que
    // ha a direita (a silaba 2 nos neumas da 4); 3 e 4 ficam para o proximo "Sugerir"
    expect(res.suggestions.map((s) => s.index)).toEqual([0, 2]);
    expect(got[0].x + got[0].w).toBeLessThanOrEqual(fx.truth[3].x);
    expect(got[2].x).toBeGreaterThanOrEqual(fx.truth[3].x + fx.truth[3].w);
    for (const s of res.suggestions) {
      const b = got[s.index];
      const a = fx.truth[3];
      const overlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      expect(overlap).toBeLessThanOrEqual(1e-9);
    }
  });

  it('silaba rejeitada (suggest: false) ocupa espaco mas nao recebe sugestao', () => {
    const fx = buildAdiastematicLine({ seed: 9 });
    const { width: W, height: H } = fx.raster;
    const syllables = fx.syllables.map((s) => (s.index === 1 ? { ...s, suggest: false } : s));
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables });
    expect(res.suggestions.map((s) => s.index)).toEqual([0, 2, 3, 4]);
    const got = boxesPx(res, W, H);
    for (const i of [0, 2, 3, 4]) expect(iou(got[i], fx.truth[i])).toBeGreaterThanOrEqual(0.9);
  });

  it('faixa do usuario: caixas em fracoes do raster inteiro, nao da faixa', () => {
    const fx = buildAdiastematicLine({ height: 520, seed: 4 });
    const { width: W, height: H } = fx.raster;
    const band = { x: 0, y: 0, w: 1, h: 0.3 }; // so os neumas (y <= 156)
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: fx.syllables, band });
    expect(res.debug.bandSource).toBe('user');
    expect(res.suggestions).toHaveLength(5);
    const got = boxesPx(res, W, H);
    for (const s of fx.syllables) expect(iou(got[s.index], fx.truth[s.index])).toBeGreaterThanOrEqual(0.9);
  });

  it('folio sem faixa inferivel pede a faixa (needsBand) e nao sugere nada', () => {
    const fx = buildAdiastematicLine({ width: 900, height: 700 });
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: fx.syllables });
    expect(res.debug.needsBand).toBe(true);
    expect(res.suggestions).toEqual([]);
  });

  it('imagem em branco e lista sem alvos devolvem vazio sem lancar', () => {
    const blank = createRaster(1200, 260);
    const syl = [{ index: 0, text: 'a', wordIndex: 0 }];
    expect(suggestBoxes({ image: blank, notation: 'adiastematic', syllables: syl }).suggestions).toEqual([]);
    const fx = buildAdiastematicLine();
    const none = fx.syllables.map((s) => ({ ...s, suggest: false }));
    expect(suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: none }).suggestions).toEqual([]);
  });

  it('mais silabas que glifos: as excedentes ficam sem sugestao, sem lancar', () => {
    const fx = buildAdiastematicLine({ words: [['a'], ['b']], seed: 2 });
    const syllables = [...fx.syllables, ...[2, 3, 4, 5, 6, 7, 8].map((i) => ({ index: i, text: 'x', wordIndex: 9 }))];
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables });
    expect(res.suggestions.length).toBeLessThanOrEqual(9);
    for (const s of res.suggestions) {
      expect(s.box.x).toBeGreaterThanOrEqual(0);
      expect(s.box.x + s.box.w).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('raster invalido lanca erro claro', () => {
    expect(() =>
      suggestBoxes({
        image: { data: new Uint8ClampedArray(10), width: 3, height: 3 },
        notation: 'adiastematic',
        syllables: [{ index: 0, text: 'a', wordIndex: 0 }],
      }),
    ).toThrow(/width \* height \* 4/);
  });

  it('rotacao e responsabilidade do chamador: raster girado 90 graus e endireitado da caixas no proprio referencial', () => {
    const fx = buildAdiastematicLine({ seed: 6 });
    // a imagem "original" e retrato (a linha esta de pe); o chamador aplica a rotacao de 90 graus
    const original = rotateRaster90(fx.raster, 3);
    expect([original.width, original.height]).toEqual([fx.raster.height, fx.raster.width]);
    const visual = rotateRaster90(original, 1);
    expect(visual.width).toBe(fx.raster.width);
    expect(Buffer.from(visual.data).equals(Buffer.from(fx.raster.data))).toBe(true);
    const res = suggestBoxes({ image: visual, notation: 'adiastematic', syllables: fx.syllables });
    const got = boxesPx(res, visual.width, visual.height);
    for (const s of fx.syllables) expect(iou(got[s.index], fx.truth[s.index])).toBeGreaterThanOrEqual(0.9);
    // fracoes sao do referencial visual (largura 1200), nao do original (largura 260)
    expect(res.suggestions[4].box.x).toBeCloseTo(fx.truth[4].x / visual.width, 2);
  });
});

describe('suggestBoxes — escala e transparencia', () => {
  it('imagem 2x maior (4800 px) e reduzida a 2400 px: caixas continuam certas', () => {
    const fx = buildAdiastematicLine({ seed: 13 });
    const big = upscaleRasterNearest(fx.raster, 4);
    const res = suggestBoxes({ image: big, notation: 'adiastematic', syllables: fx.syllables });
    expect(res.debug.scale).toBeCloseTo(0.5, 2);
    const got = boxesPx(res, big.width, big.height);
    for (const s of fx.syllables) expect(iou(got[s.index], scaleBox(fx.truth[s.index], 4))).toBeGreaterThanOrEqual(0.8);
  });

  it('traco de 1 px (u < 2) amplia a faixa 2x e ainda acha as silabas', () => {
    // sem letras de haste: com caneta de 1 px, as hastes (32 px = 32u) passam de maxSide (30u) e
    // somem, e a contagem por texto (M2) ficaria com uma silaba a menos
    const fx = buildAdiastematicLine({ seed: 6, u: 1, words: [['mu', 'ne'], ['ra'], ['ve', 'ni']] });
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: fx.syllables });
    expect(res.debug.scale).toBe(2);
    const got = boxesPx(res, fx.raster.width, fx.raster.height);
    for (const s of fx.syllables) expect(iou(got[s.index], fx.truth[s.index])).toBeGreaterThanOrEqual(0.8);
  });

  it('pixels transparentes (triangulos do AABB rotacionado) nunca viram tinta', () => {
    const fx = buildAdiastematicLine({ seed: 15 });
    const { width: W, height: H } = fx.raster;
    const r = { ...fx.raster, data: new Uint8ClampedArray(fx.raster.data) };
    // triangulo superior direito transparente e preto (como sai de um canvas rotacionado)
    for (let y = 0; y < H; y++)
      for (let x = W - 1; x >= W - 300 + y / 5; x--) r.data.set([0, 0, 0, 0], (y * W + x) * 4);
    const res = suggestBoxes({ image: r, notation: 'adiastematic', syllables: fx.syllables });
    // a 5a coluna (neumas e texto em x >= 943) fica toda dentro da regiao transparente
    expect(res.suggestions.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    const got = boxesPx(res, W, H);
    for (const s of res.suggestions) expect(got[s.index].x + got[s.index].w).toBeLessThanOrEqual(W - 300);
  });
});

describe('suggestBoxes — diastematico', () => {
  it('pauta de 4 linhas, neumas cruzando, barra, clave e custos: 4 caixas com a pauta, IoU >= 0,85', () => {
    const fx = buildDiastematicLine();
    const { width: W, height: H } = fx.raster;
    const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: fx.syllables });
    expect(res.debug.mode).toBe('D');
    expect(res.debug.bandSource).toBe('staff');
    expect(res.debug.staff?.lines).toHaveLength(4);
    expect(res.debug.staff?.spacing).toBe(16);
    expect(res.debug.counts.bars).toBe(1);
    expect(res.debug.counts.ignored).toBe(2);
    expect(res.suggestions.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    const got = boxesPx(res, W, H);
    for (const s of fx.syllables) expect(iou(got[s.index], fx.truth[s.index])).toBeGreaterThanOrEqual(0.85);
    // clave e custos fora de qualquer caixa
    for (const b of Object.values(got)) {
      expect(b.x).toBeGreaterThan(fx.clef.x + fx.clef.w);
      expect(b.x + b.w).toBeLessThan(fx.custos.x);
    }
  });

  it('pauta vermelha (some no canal R): detectada no cinza, remocao pulada, caixas corretas', () => {
    const fx = buildDiastematicLine({ red: true, seed: 12 });
    const { width: W, height: H } = fx.raster;
    const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: fx.syllables });
    expect(res.debug.mode).toBe('D');
    expect(res.debug.staff?.red).toBe(true);
    const got = boxesPx(res, W, H);
    for (const s of fx.syllables) expect(iou(got[s.index], fx.truth[s.index])).toBeGreaterThanOrEqual(0.85);
  });

  it('diastematico sem pauta recai no modo A', () => {
    const fx = buildAdiastematicLine({ seed: 8 });
    const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: fx.syllables });
    expect(res.debug.mode).toBe('A');
    expect(res.debug.bandSource).toBe('image');
    expect(res.suggestions).toHaveLength(5);
  });
});

describe('suggestBoxes — desempenho', () => {
  const strict = process.env.NEUME_PERF === '1';
  const words = Array.from({ length: 5 }, (_, i) => ['Ky', 'ri', 'e', i % 2 ? 'e' : 'son']);
  it(`2400 x 600, 20 silabas < ${strict ? 1500 : 4000} ms`, () => {
    const fx = buildAdiastematicLine({ width: 2400, height: 600, words, seed: 21 });
    const { width: W, height: H } = fx.raster;
    const t0 = performance.now();
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: fx.syllables });
    const dt = performance.now() - t0;
    expect(res.suggestions).toHaveLength(20);
    const got = boxesPx(res, W, H);
    const good = fx.syllables.filter((s) => got[s.index] && iou(got[s.index], fx.truth[s.index]) >= 0.9);
    expect(good.length).toBeGreaterThanOrEqual(18);
    expect(dt).toBeLessThan(strict ? 1500 : 4000);
  });

  it(`folio 1600 x 2400 com area inteira < ${strict ? 600 : 3000} ms`, () => {
    const fx = buildAdiastematicLine({ width: 1600, height: 400, words, seed: 22 });
    const W = 1600;
    const H = 2400;
    const data = new Uint8ClampedArray(W * H * 4).fill(235);
    for (let k = 0; k < 6; k++) data.set(fx.raster.data, k * 400 * W * 4); // seis linhas
    const t0 = performance.now();
    suggestBoxes({
      image: { data, width: W, height: H },
      notation: 'adiastematic',
      syllables: fx.syllables,
      bands: Array.from({ length: 6 }, (_, k) => ({ x: 0, y: k / 6, w: 1, h: 1 / 6 })),
    });
    expect(performance.now() - t0).toBeLessThan(strict ? 600 : 3000);
  });
});

/** Duas linhas diastematicas empilhadas (a de baixo deslocada por 240 px). */
function stackedStaves() {
  const a = buildDiastematicLine({ seed: 11 });
  const b = buildDiastematicLine({ seed: 12 });
  const W = a.raster.width;
  const H = a.raster.height;
  const data = new Uint8ClampedArray(W * H * 2 * 4);
  data.set(a.raster.data, 0);
  data.set(b.raster.data, W * H * 4);
  const raster: RasterRGBA = { data, width: W, height: H * 2 };
  return { raster, a, b, W, H };
}

describe('suggestBoxes — varias pautas', () => {
  it('duas pautas empilhadas sem ancora: pede a faixa e nao sugere nada', () => {
    const { raster, a } = stackedStaves();
    const res = suggestBoxes({ image: raster, notation: 'diastematic', syllables: a.syllables });
    expect(res.debug.needsBand).toBe(true);
    expect(res.suggestions).toEqual([]);
  });

  it('com ancora na pauta de baixo: sugere na pauta de baixo', () => {
    const { raster, b, W, H } = stackedStaves();
    const off = H;
    const syllables = b.syllables;
    const t = (i: number) => ({ ...b.truth[i], y: b.truth[i].y + off });
    const anchors = [{ index: 0, box: pxToFrac(t(0), W, 2 * H) }];
    const res = suggestBoxes({ image: raster, notation: 'diastematic', syllables, anchors });
    expect(res.debug.mode).toBe('D');
    expect(res.suggestions.map((s) => s.index)).toEqual([1, 2, 3]);
    const got = boxesPx(res, W, 2 * H);
    for (const i of [1, 2, 3]) {
      expect(got[i].y).toBeGreaterThanOrEqual(off);
      expect(iou(got[i], t(i))).toBeGreaterThanOrEqual(0.8);
    }
  });
});

describe('suggestBoxes — escalas x e y distintas', () => {
  it('faixa estreita e alta: caixa volta ao lugar certo em y', () => {
    const W = 33;
    const H = 3000;
    const r = createRaster(W, H);
    fillRect(r, 15, 1500, 12, 24, INK);
    const res = suggestBoxes({
      image: r,
      notation: 'adiastematic',
      syllables: [{ index: 0, text: 'a', wordIndex: 0 }],
      band: { x: 0, y: 0, w: 1, h: 1 },
    });
    expect(res.suggestions).toHaveLength(1);
    const b = fracToPx(res.suggestions[0].box, W, H);
    expect(b.y).toBeGreaterThanOrEqual(1500 - 20);
    expect(b.y + b.h).toBeLessThanOrEqual(1524 + 20);
    expect(b.y).toBeLessThanOrEqual(1500);
    expect(b.y + b.h).toBeGreaterThanOrEqual(1524);
  });
});

describe('suggestBoxes — varias areas', () => {
  it('uma area em bands da o mesmo resultado que band', () => {
    const fx = buildAdiastematicLine({ seed: 31 });
    const band = { x: 0, y: 0, w: 1, h: 1 };
    const a = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: fx.syllables, band });
    const b = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: fx.syllables, bands: [band] });
    expect(a.suggestions.length).toBeGreaterThan(0);
    expect(b.suggestions).toEqual(a.suggestions);
  });

  it('duas linhas empilhadas: silabas distribuidas em ordem, nenhuma atravessa areas', () => {
    const a = buildAdiastematicLine({ seed: 41, words: [['Ky', 'ri', 'e'], ['e', 'lei', 'son']] });
    const b = buildAdiastematicLine({ seed: 42, words: [['Chri', 'ste'], ['e', 'lei', 'son']] });
    const W = a.raster.width;
    const H = a.raster.height;
    const data = new Uint8ClampedArray(W * H * 2 * 4);
    data.set(a.raster.data, 0);
    data.set(b.raster.data, W * H * 4);
    const raster = { data, width: W, height: 2 * H };
    const syllables = [
      ...a.syllables,
      ...b.syllables.map((s) => ({ ...s, index: s.index + a.syllables.length, wordIndex: s.wordIndex + 2 })),
    ];
    const res = suggestBoxes({
      image: raster,
      notation: 'adiastematic',
      syllables,
      bands: [
        { x: 0, y: 0, w: 1, h: 0.5 },
        { x: 0, y: 0.5, w: 1, h: 0.5 },
      ],
    });
    expect(res.suggestions.map((s) => s.index)).toEqual(syllables.map((s) => s.index));
    expect(res.debug.bandSource).toBe('user');
    expect(res.debug.bands).toHaveLength(2);
    const got = boxesPx(res, W, 2 * H);
    a.syllables.forEach((s) => {
      expect(got[s.index].y + got[s.index].h).toBeLessThanOrEqual(H + 1);
      expect(iou(got[s.index], a.truth[s.index])).toBeGreaterThanOrEqual(0.8);
    });
    b.syllables.forEach((s) => {
      const i = s.index + a.syllables.length;
      expect(got[i].y).toBeGreaterThanOrEqual(H - 1);
      expect(iou(got[i], { ...b.truth[s.index], y: b.truth[s.index].y + H })).toBeGreaterThanOrEqual(0.8);
    });
  });

  it('duas linhas empilhadas: cada area conta so as suas silabas e fica na binarizacao primaria', () => {
    // Linha de cima com 1 silaba (e marcas apagadas que so k menor pega), de baixo com 9: com a
    // meta da pagina inteira (10) a de cima sempre recairia na binarizacao mais ruidosa.
    const a = buildAdiastematicLine({ seed: 41, words: [['Ky']] });
    const b = buildAdiastematicLine({ seed: 42, words: [['Chri', 'ste'], ['e', 'lei', 'son'], ['Ky', 'ri', 'e', 'e']] });
    for (let g = 196; g < 240; g += 2) fillRect(a.raster, 200 + (g - 196) * 10, 60, 12, 12, [g, g, g]);
    const W = a.raster.width;
    const H = a.raster.height;
    const data = new Uint8ClampedArray(W * H * 2 * 4);
    data.set(a.raster.data, 0);
    data.set(b.raster.data, W * H * 4);
    const syllables = [
      ...a.syllables,
      ...b.syllables.map((s) => ({ ...s, index: s.index + a.syllables.length, wordIndex: s.wordIndex + 1 })),
    ];
    const res = suggestBoxes({
      image: { data, width: W, height: 2 * H },
      notation: 'adiastematic',
      syllables,
      bands: [
        { x: 0, y: 0, w: 0.5, h: 0.5 },
        { x: 0, y: 0.5, w: 1, h: 0.5 },
      ],
    });
    const alone = suggestBoxes({ image: a.raster, notation: 'adiastematic', syllables: a.syllables, band: { x: 0, y: 0, w: 1, h: 1 } });
    expect(res.debug.bands!.map((d) => [d.channel, d.sauvolaK])).toEqual([
      [alone.debug.channel, alone.debug.sauvolaK],
      ['r', alone.debug.sauvolaK],
    ]);
  });

  it('ancora na segunda area e ancora fora de todas: sem sugestao para elas, demais em ordem', () => {
    const a = buildAdiastematicLine({ seed: 41, words: [['Ky', 'ri', 'e'], ['e', 'lei', 'son']] });
    const b = buildAdiastematicLine({ seed: 42, words: [['Chri', 'ste'], ['e', 'lei', 'son']] });
    const W = a.raster.width;
    const H = a.raster.height;
    const data = new Uint8ClampedArray(W * H * 2 * 4);
    data.set(a.raster.data, 0);
    data.set(b.raster.data, W * H * 4);
    const n = a.syllables.length;
    const syllables = [
      ...a.syllables,
      ...b.syllables.map((s) => ({ ...s, index: s.index + n, wordIndex: s.wordIndex + 2 })),
    ];
    const t = (i: number) => ({ ...b.truth[i], y: b.truth[i].y + H });
    const anchors = [
      { index: n + 2, box: pxToFrac(t(2), W, 2 * H) },
      // fora das duas areas (faixa estreita a direita)
      { index: 0, box: { x: 0.99, y: 0.9, w: 0.005, h: 0.05 } },
    ];
    const res = suggestBoxes({
      image: { data, width: W, height: 2 * H },
      notation: 'adiastematic',
      syllables,
      anchors,
      bands: [
        { x: 0, y: 0, w: 0.98, h: 0.5 },
        { x: 0, y: 0.5, w: 0.98, h: 0.5 },
      ],
    });
    const want = syllables.map((s) => s.index).filter((i) => i !== 0 && i !== n + 2);
    expect(res.suggestions.map((s) => s.index)).toEqual(want);
    const got = boxesPx(res, W, 2 * H);
    for (const i of want) {
      if (i < n) {
        expect(got[i].y + got[i].h).toBeLessThanOrEqual(H + 1);
      } else {
        expect(got[i].y).toBeGreaterThanOrEqual(H - 1);
        expect(iou(got[i], t(i - n))).toBeGreaterThanOrEqual(0.8);
      }
    }
  });

  it('area vazia no meio nao rouba silabas', () => {
    const fx = buildAdiastematicLine({ seed: 43 });
    const W = fx.raster.width;
    const H = fx.raster.height;
    const data = new Uint8ClampedArray(W * H * 2 * 4).fill(235);
    data.set(fx.raster.data, 0);
    const res = suggestBoxes({
      image: { data, width: W, height: 2 * H },
      notation: 'adiastematic',
      syllables: fx.syllables,
      bands: [
        { x: 0, y: 0, w: 1, h: 0.5 },
        { x: 0, y: 0.5, w: 1, h: 0.5 },
      ],
    });
    expect(res.suggestions.map((s) => s.index)).toEqual(fx.syllables.map((s) => s.index));
  });
});

describe('suggestBoxes — modo candidatos', () => {
  const center = (b: PxBox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const contains = (b: PxBox, p: { x: number; y: number }) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

  it('um candidato cobre cada neuma; nenhum no texto; ordem de leitura por x', () => {
    const fx = buildAdiastematicLine({ seed: 51 });
    const { width: W, height: H } = fx.raster;
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: [], mode: 'candidates' });
    expect(res.suggestions).toEqual([]);
    const cands = res.candidates!.map((c) => fracToPx(c.box, W, H));
    for (const s of fx.syllables) for (const n of fx.neumes[s.index]) expect(cands.some((c) => contains(c, center(n)))).toBe(true);
    for (const c of cands) expect(c.y + c.h / 2).toBeLessThan(fx.baseline - 2 * fx.xHeight); // nenhum centro na faixa do texto
    const xs = res.candidates!.map((c) => c.box.x + c.box.w / 2);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(res.candidates!.every((c) => c.band === 0)).toBe(true);
  });

  it('duas áreas: band = índice da área; candidatos da primeira antes dos da segunda', () => {
    const a = buildAdiastematicLine({ seed: 52 });
    const b = buildAdiastematicLine({ seed: 53 });
    const W = a.raster.width, H = a.raster.height;
    const data = new Uint8ClampedArray(W * H * 2 * 4);
    data.set(a.raster.data, 0);
    data.set(b.raster.data, W * H * 4);
    const res = suggestBoxes({
      image: { data, width: W, height: 2 * H }, notation: 'adiastematic', syllables: [], mode: 'candidates',
      bands: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }],
    });
    const bands = res.candidates!.map((c) => c.band);
    expect(bands).toEqual([...bands].sort((p, q) => p - q));
    expect(new Set(bands)).toEqual(new Set([0, 1]));
  });

  it('grupo coberto por uma caixa existente não vira candidato', () => {
    const fx = buildAdiastematicLine({ seed: 54 });
    const { width: W, height: H } = fx.raster;
    const anchors = [{ index: 1, box: pxToFrac(fx.truth[1], W, H) }];
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: [], anchors, mode: 'candidates' });
    const cands = res.candidates!.map((c) => fracToPx(c.box, W, H));
    for (const n of fx.neumes[1]) expect(cands.some((c) => contains(c, center(n)))).toBe(false);
    for (const n of fx.neumes[0]) expect(cands.some((c) => contains(c, center(n)))).toBe(true);
  });
});

describe('M4a — caneta do texto mais grossa que os neumas', () => {
  const center = (b: PxBox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const contains = (b: PxBox, p: { x: number; y: number }) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

  it('u medido fora do texto; pontos e traços finos viram candidatos', () => {
    const fx = buildAdiastematicLine({ u: 2, textU: 5, seed: 61, noise: false });
    const { width: W, height: H } = fx.raster;
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: [], mode: 'candidates' });
    expect(res.debug.strokeWidth).toBeLessThanOrEqual(3);
    const cands = res.candidates!.map((c) => fracToPx(c.box, W, H));
    for (const s of fx.syllables) for (const n of fx.neumes[s.index]) expect(cands.some((c) => contains(c, center(n)))).toBe(true);
  });

  it('ruído pontual do pergaminho (pontos de 1, 2x2 e 3x3 px) não vira candidato com os filtros menores', () => {
    const fx = buildAdiastematicLine({ u: 3, seed: 62 }); // addNoise com pontos isolados de 1 px
    const { width: W, height: H } = fx.raster;
    // manchinhas de tinta isoladas no pergaminho: entre as colunas (altura dos neumas) e acima delas
    const colW = (W - 120) / fx.syllables.length;
    const specks: PxBox[] = [];
    for (let j = 0; j < fx.syllables.length; j++) {
      const x = Math.round(60 + (j + 0.8) * colW);
      specks.push(fillRect(fx.raster, x, 70, 2, 2, INK), fillRect(fx.raster, x + 9, 115, 3, 3, INK), fillRect(fx.raster, x - 20, 14, 3, 3, INK));
    }
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: [], mode: 'candidates' });
    const truth = Object.values(fx.truth);
    const cands = res.candidates!.map((k) => fracToPx(k.box, W, H));
    expect(cands.length).toBeGreaterThan(0); // não vazio: os neumas continuam lá
    for (const s of fx.syllables) for (const n of fx.neumes[s.index]) expect(cands.some((c) => contains(c, center(n)))).toBe(true);
    for (const c of cands) {
      expect(truth.some((t) => contains(t, center(c)))).toBe(true);
      expect(specks.some((b) => contains(c, center(b)))).toBe(false);
    }
  });
});

describe('M4b — pauta inclinada e vermelha', () => {
  const center = (b: PxBox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const contains = (b: PxBox, p: { x: number; y: number }) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  const allNotesFound = (fx: ReturnType<typeof buildDiastematicLine>, res: SuggestResult) => {
    const cands = res.candidates!.map((c) => fracToPx(c.box, fx.raster.width, fx.raster.height));
    for (const s of fx.syllables) for (const n of fx.neumes[s.index]) expect(cands.some((c) => contains(c, center(n)))).toBe(true);
  };

  it('pauta vermelha inclinada 6° com puncta quadrados: modo D e todas as notas', () => {
    const fx = buildDiastematicLine({ red: true, tiltDeg: 6, width: 800, height: 360, seed: 63 });
    const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: [], mode: 'candidates' });
    expect(res.debug.mode).toBe('D');
    allNotesFound(fx, res);
  });

  it('pauta vermelho-claro (invisível no cinza binarizado): achada pelo mapa r − g', () => {
    const fx = buildDiastematicLine({ lineColor: LIGHT_RED_LINE, seed: 64 });
    const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: [], mode: 'candidates' });
    expect(res.debug.mode).toBe('D');
    expect(res.debug.staff?.red).toBe(true);
    allNotesFound(fx, res);
  });

  it('rubrica vermelha num adiastemático pedido como D não vira pauta', () => {
    const fx = buildAdiastematicLine({ seed: 65, words: [['Do', 'mi', 'nus'], ['di', 'xit']] });
    drawText(fx.raster, 'DOMINUS', 80, 150, 40, 6, RED_LINE); // letras grandes vermelhas
    const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: [], mode: 'candidates' });
    expect(res.debug.mode).toBe('A');
  });

  it('rubricas vermelhas nas duas pontas da faixa não viram pauta (extensão sem cobertura)', () => {
    const fx = buildAdiastematicLine({ seed: 66, words: [['Do', 'mi', 'nus'], ['di', 'xit']] });
    drawText(fx.raster, 'DOMINUS', 20, 150, 40, 6, RED_LINE);
    drawText(fx.raster, 'DIXIT', 960, 150, 40, 6, RED_LINE);
    const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: [], mode: 'candidates' });
    expect(res.debug.mode).toBe('A');
  });

  it('uma linha inteira de capitais vermelhas não vira pauta', () => {
    const fx = buildAdiastematicLine({ seed: 67, words: [['Do', 'mi', 'nus'], ['di', 'xit']] });
    drawText(fx.raster, 'DOMINUSDIXITADMEFILIUSMEUS', 20, 150, 40, 6, RED_LINE);
    const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: [], mode: 'candidates' });
    expect(res.debug.mode).toBe('A');
  });

  it('pauta preta reta achada de primeira: o limite de u do modo D não se aplica', () => {
    const fx = buildDiastematicLine({ seed: 68, noise: false, staff: false });
    drawStaff(fx.raster, { x0: 40, x1: 700, yTop: 60, lines: 4, d: 14, t: 2 });
    // tracos grossos (6 px) em quantidade: a moda da espessura fica acima de max(t, s/4) = 4
    for (let i = 0; i < 24; i++) for (const y of [5, 95]) drawNeume(fx.raster, 'virga', 760 + i * 25, y, 6);
    const ink = binarizeOtsu(extractChannel(fx.raster, 'gray'));
    const u = estimateStrokeWidth(ink);
    expect(u).toBeGreaterThan(4);
    const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: [], mode: 'candidates' });
    expect(res.debug.mode).toBe('D');
    expect(res.debug.strokeWidth).toBe(u);
  });
});

describe('M4c — manchas escuras no modo D', () => {
  it('M4c — notação D sem pauta: puncta quadrados cheios não são apagados como manchas', () => {
    const fx = buildDiastematicLine({ staff: false, seed: 66 });
    const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: [], mode: 'candidates' });
    expect(res.debug.mode).toBe('A');
    const cands = res.candidates!.map((c) => fracToPx(c.box, fx.raster.width, fx.raster.height));
    for (const s of fx.syllables)
      for (const n of fx.neumes[s.index])
        expect(cands.some((c) => c.x <= n.x + n.w / 2 && n.x + n.w / 2 <= c.x + c.w && c.y <= n.y + n.h / 2 && n.y + n.h / 2 <= c.y + c.h)).toBe(true);
  });

  it('notação D: notas quadradas cheias ficam fora da medida de u', () => {
    const fx = buildDiastematicLine({ staff: false, seed: 66 }); // sem pauta: só notas 12x12, clave, barra e texto u = 3
    const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: [], mode: 'candidates' });
    expect(res.debug.strokeWidth).toBe(3);
  });

  const solidsOnly = (extra: (r: RasterRGBA) => void) => {
    const r = createRaster(1000, 240);
    for (let i = 0; i < 30; i++) fillRect(r, 40 + i * 30, 60 + (i % 4) * 16, 12, 12, INK);
    extra(r);
    return r;
  };

  it('notação D: resto minúsculo sem as notas cheias (pontos soltos) não decide u nem amplia a faixa', () => {
    const r = solidsOnly((rr) => {
      for (let i = 0; i < 12; i++) fillRect(rr, 50 + i * 70, 160, 1, 1, INK); // < 10% da tinta
    });
    const res = suggestBoxes({ image: r, notation: 'diastematic', syllables: [], mode: 'candidates' });
    expect(res.debug.scale).toBe(1);
    expect(res.debug.strokeWidth).toBe(12); // medida da mascara inteira
  });

  it('notação D: resto sem medida (só runs > 40) não torna a faixa "sem tinta"', () => {
    // retangulo 100 x 45 (aspecto > 2: nao e nota cheia), todo pixel com min(run) = 45 > 40: sem medida
    const r = solidsOnly((rr) => fillRect(rr, 400, 150, 100, 45, INK));
    const ink = binarizeOtsu(extractChannel(r, 'gray'));
    expect(measureU(ink, 'diastematic')).toBe(12); // volta a mascara inteira (antes: 0)
  });

  it('notação D com pauta e notas/pontos cheios: u igual ao medido sem a exclusão', () => {
    const fx = buildDiastematicLine({ seed: 69, noise: false });
    for (let i = 0; i < 30; i++) fillRect(fx.raster, 60 + i * 44, 20, 8, 8, INK); // pontos grossos
    const ink = binarizeOtsu(extractChannel(fx.raster, 'gray'));
    expect(measureU(ink, 'diastematic')).toBe(measureU(ink, 'adiastematic'));
  });
});

describe('M4d — margem é contexto', () => {
  it('M4d — área cortando o texto: pedaços de letra na margem não viram candidatos; neumas ficam', () => {
    const fx = buildAdiastematicLine({ seed: 67, noise: false });
    const H = fx.raster.height, W = fx.raster.width;
    const y0 = 30;
    // borda inferior do raster (área + 10%) a 4 px abaixo do topo da altura-x: só pedaços de 4 px das letras
    const bottom = fx.baseline - fx.xHeight + 4;
    const y1 = Math.round((bottom + 0.1 * y0) / 1.1);
    const band = { x: 0, y: y0 / H, w: 1, h: (y1 - y0) / H };
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: [], mode: 'candidates', bands: [band] });
    const cands = res.candidates!.map((c) => fracToPx(c.box, W, H));
    for (const c of cands) expect(c.y + c.h / 2).toBeLessThanOrEqual(y1);
    for (const c of cands) expect(c.y + c.h).toBeLessThanOrEqual(fx.baseline - fx.xHeight + 2);
    for (const s of fx.syllables)
      for (const n of fx.neumes[s.index])
        expect(cands.some((c) => c.x <= n.x + n.w / 2 && n.x + n.w / 2 <= c.x + c.w)).toBe(true);
  });

  it('measureU: a margem acima e abaixo da área fica fora da medida', () => {
    const m = { data: new Uint8Array(60 * 60), width: 60, height: 60 };
    const fill = (x: number, y: number, w: number, h: number) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) m.data[yy * 60 + xx] = 1; };
    fill(5, 20, 2, 15); fill(15, 20, 2, 15);   // tracos finos (2) dentro da area [18, 40)
    fill(5, 2, 40, 7); fill(5, 48, 40, 7);     // caneta grossa (7) so na margem, mais pixels
    expect(measureU(m, 'adiastematic')).toBe(7);
    expect(measureU(m, 'adiastematic', { x: 0, y: 18, w: 60, h: 22 })).toBe(2);
  });

  describe('regra da área sobre grupos inteiros', () => {
    // área desenhada y em [60, 160); com a margem de 10%, o raster de trabalho vai de 50 a 170
    const build = () => {
      const r = createRaster(1000, 200);
      for (let i = 0; i < 8; i++) drawNeume(r, i % 2 ? 'virga' : 'clivis', 600 + i * 45, 90, 3);
      return r;
    };
    const run = (r: RasterRGBA) =>
      suggestBoxes({ image: r, notation: 'adiastematic', syllables: [], mode: 'candidates', bands: [{ x: 0, y: 0.3, w: 1, h: 0.5 }] })
        .candidates!.map((c) => fracToPx(c.box, r.width, r.height));
    const covers = (c: PxBox, x: number, y: number) => c.x <= x && x <= c.x + c.w && c.y <= y && y <= c.y + c.h;

    it('neuma atravessando a borda com centro dentro fica inteiro', () => {
      const r = build();
      const n = drawNeume(r, 'virga', 100, 52, 3); // caixa 52..73: centro dentro, topo na margem
      const cands = run(r);
      expect(cands.some((c) => c.y <= n.y + 0.5 && c.y + c.h >= n.y + n.h - 0.5 && covers(c, n.x + n.w / 2, n.y + n.h / 2))).toBe(true);
    });

    it('fragmento de um neuma de dentro que cruza a borda fica no grupo', () => {
      const r = build();
      fillRect(r, 300, 64, 3, 20, INK); // traço dentro (centro 74)
      fillRect(r, 300, 57, 3, 3, INK); // ponta separada na margem (centro 58,5), vão de 4 px
      expect(run(r).some((c) => covers(c, 301.5, 58.5) && covers(c, 301.5, 74))).toBe(true);
    });

    it('rubrica na margem ao alcance da fusão não alarga a caixa do neuma de dentro', () => {
      const r = build();
      const n = drawNeume(r, 'virga', 200, 64, 3); // inteiro dentro (64..85)
      fillRect(r, 190, 55, 28, 4, INK); // traço de rubrica só na margem (55..59), vão de 5 px até o neuma
      const c = run(r).find((k) => covers(k, n.x + n.w / 2, n.y + n.h / 2));
      expect(c).toBeDefined();
      expect(c!.y).toBeGreaterThan(59); // o topo vem do neuma (64 - pad), não da rubrica
      expect(c!.x).toBeGreaterThan(192);
      expect(c!.x + c!.w).toBeLessThan(226);
    });

    it('tinta centrada fora da área é descartada', () => {
      const r = build();
      fillRect(r, 500, 50, 6, 6, INK); // marca isolada inteira na margem de cima
      expect(run(r).some((c) => covers(c, 503, 53))).toBe(false);
    });
  });
});

describe('M4e — restos de pauta', () => {
  it('M4e — restos de linha não viram candidatos; todas as notas continuam', () => {
    const fx = buildDiastematicLine({ residue: true, seed: 68 });
    const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: [], mode: 'candidates' });
    const cands = res.candidates!.map((c) => fracToPx(c.box, fx.raster.width, fx.raster.height));
    for (const r of fx.residues!) expect(cands.some((c) => c.x <= r.x + r.w / 2 && r.x + r.w / 2 <= c.x + c.w)).toBe(false);
    for (const s of fx.syllables)
      for (const n of fx.neumes[s.index]) expect(cands.some((c) => c.x <= n.x + n.w / 2 && n.x + n.w / 2 <= c.x + c.w)).toBe(true);
  });

  const coversX = (c: PxBox, b: PxBox) => c.x <= b.x + b.w / 2 && b.x + b.w / 2 <= c.x + c.w;

  it('elemento plano de nota (h = 2t + 3) e traço de ligadura fundido à cabeça ficam', () => {
    const fx = buildDiastematicLine({ seed: 70, noise: false });
    const lc = (i: number) => fx.staff.yTop + i * 16 + 0.5;
    const t = fx.staff.t;
    // elemento plano logo acima do limite, centrado na 3a linha, longe das notas
    const flat = fillRect(fx.raster, 300, Math.round(lc(2) - (2 * t + 3) / 2), 30, 2 * t + 3, INK);
    // clivis: cabeca 12x12 sobre a 2a linha + traço plano colado a direita, centrado na linha, com
    // h = 2t + 2 (sozinho seria resto; mais fino que isso a remocao da pauta ja o apagaria)
    const head = fillRect(fx.raster, 600, Math.round(lc(1) - 6), 12, 12, INK);
    const stroke = fillRect(fx.raster, 612, Math.round(lc(1) - (2 * t + 1) / 2), 24, 2 * t + 2, INK);
    const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: [], mode: 'candidates' });
    const cands = res.candidates!.map((c) => fracToPx(c.box, fx.raster.width, fx.raster.height));
    expect(cands.some((c) => coversX(c, flat))).toBe(true);
    expect(cands.some((c) => coversX(c, head) && coversX(c, stroke))).toBe(true);
  });

  it('pauta inclinada 5°: restos em vários x saem, notas ficam', () => {
    const fx = buildDiastematicLine({ residue: true, tiltDeg: 5, width: 1000, height: 360, seed: 71 });
    const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: [], mode: 'candidates' });
    expect(res.debug.mode).toBe('D');
    const cands = res.candidates!.map((c) => fracToPx(c.box, fx.raster.width, fx.raster.height));
    expect(fx.residues).toHaveLength(3);
    for (const r of fx.residues!) expect(cands.some((c) => coversX(c, r))).toBe(false);
    for (const s of fx.syllables) for (const n of fx.neumes[s.index]) expect(cands.some((c) => coversX(c, n))).toBe(true);
  });
});

describe('altura das caixas segue as caixas da própria página (modo D)', () => {
  const opts = { tiltDeg: 5, width: 1000, height: 360, seed: 72 } as const;
  const whole = [{ x: 0, y: 0, w: 1, h: 1 }];
  const px = (fx: ReturnType<typeof buildDiastematicLine>, b: { x: number; y: number; w: number; h: number }) => fracToPx(b, fx.raster.width, fx.raster.height);
  const ints = (fx: ReturnType<typeof buildDiastematicLine>, bs: { x: number; y: number; w: number; h: number }[]) =>
    bs.map((b) => { const p = px(fx, b); return [p.x, p.y, p.w, p.h].map((v) => Math.round(v)).join(','); }).join(' ');

  it('sem âncoras: caixas idênticas às de antes (pauta ±0,5s)', () => {
    const fx = buildDiastematicLine(opts);
    const cand = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: [], mode: 'candidates', bands: whole });
    const seq = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: fx.syllables, bands: whole });
    expect(ints(fx, cand.candidates!.map((c) => c.box))).toMatchInlineSnapshot(`"98,57,16,66 98,57,30,115 120,59,16,66 305,75,16,66 305,75,30,115 331,77,16,67 358,80,16,66 512,93,16,66 512,93,30,115 535,95,16,66 562,97,16,67 719,111,16,67 719,111,30,116 743,113,16,67 765,115,16,67"`);
    expect(ints(fx, seq.suggestions.map((c) => c.box))).toMatchInlineSnapshot(`"98,57,38,115 305,75,69,115 512,93,66,115 719,111,62,116"`);
  });

  // centro da linha i da pauta da fixture em x (topo + (t - 1) / 2)
  const lineC = (fx: ReturnType<typeof buildDiastematicLine>, i: number, x: number) => staffLineTop(fx.staff, i, x) + (fx.staff.t - 1) / 2;
  const S = 16;
  /** Âncora da sílaba 0: de 1s abaixo do topo da pauta a 2s abaixo da base (inclui parte do texto). */
  const anchorOf = (fx: ReturnType<typeof buildDiastematicLine>) => {
    const t = fx.truth[0];
    // inteiros: a fracao volta ao mesmo px sem o arredondamento para fora
    const y0 = Math.round(Math.min(lineC(fx, 0, t.x), lineC(fx, 0, t.x + t.w)) + 1 * S);
    const y1 = Math.round(Math.max(lineC(fx, 3, t.x), lineC(fx, 3, t.x + t.w)) + 2 * S);
    return { index: 0, box: pxToFrac({ x: t.x, y: y0, w: t.w, h: y1 - y0 }, fx.raster.width, fx.raster.height) };
  };

  it('com âncora: topo e base com os mesmos deslocamentos da âncora, no x de cada caixa (pauta a 5°)', () => {
    const fx = buildDiastematicLine(opts);
    const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: [], mode: 'candidates', bands: whole, anchors: [anchorOf(fx)] });
    const pad = Math.max(2, res.debug.strokeWidth);
    const notes = fx.syllables.slice(1).flatMap((s) => fx.neumes[s.index]);
    let checked = 0;
    for (const k of res.candidates!) {
      const c = px(fx, k.box);
      // so caixas de uma nota (glifo = a nota): as de letras do texto ficam de fora desta conta
      const n = notes.find((b) => b.x >= c.x && b.x + b.w <= c.x + c.w && Math.abs(c.w - (b.w + 2 * pad)) <= 1);
      if (!n) continue;
      const top = Math.min(lineC(fx, 0, c.x), lineC(fx, 0, c.x + c.w)) + 1 * S;
      const bottom = Math.max(lineC(fx, 3, c.x), lineC(fx, 3, c.x + c.w)) + 2 * S;
      // 2 px: arredondamento para fora da caixa (<= 1) + linha rastreada vs linha desenhada a 5 graus (<= 1)
      expect(Math.abs(c.y - Math.min(top, n.y - pad))).toBeLessThanOrEqual(2);
      expect(Math.abs(c.y + c.h - Math.max(bottom, n.y + n.h + pad))).toBeLessThanOrEqual(2);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(6);
  });

  it('com âncora: neuma acima do topo derivado continua inteiro na caixa', () => {
    const fx = buildDiastematicLine(opts);
    const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: [], mode: 'candidates', bands: whole, anchors: [anchorOf(fx)] });
    const cands = res.candidates!.map((k) => px(fx, k.box));
    for (const s of fx.syllables.slice(1))
      for (const n of fx.neumes[s.index])
        expect(cands.some((c) => c.x <= n.x && n.x + n.w <= c.x + c.w && c.y <= n.y && n.y + n.h <= c.y + c.h)).toBe(true);
  });

  it('duas faixas empilhadas, âncora só na primeira: a segunda fica no padrão', () => {
    const a = buildDiastematicLine({ seed: 73 });
    const b = buildDiastematicLine({ seed: 74 });
    const W = a.raster.width, H = a.raster.height;
    const data = new Uint8ClampedArray(W * H * 2 * 4);
    data.set(a.raster.data, 0);
    data.set(b.raster.data, W * H * 4);
    const image = { data, width: W, height: 2 * H };
    const bands = [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }];
    const an = anchorOf(a);
    const anchor = { index: 0, box: { ...an.box, y: an.box.y / 2, h: an.box.h / 2 } }; // fracoes da imagem empilhada
    const withA = suggestBoxes({ image, notation: 'diastematic', syllables: [], mode: 'candidates', bands, anchors: [anchor] });
    const without = suggestBoxes({ image, notation: 'diastematic', syllables: [], mode: 'candidates', bands });
    const second = (r: SuggestResult) => r.candidates!.filter((c) => c.band === 1).map((c) => c.box);
    expect(second(withA).length).toBeGreaterThan(0);
    expect(second(withA)).toEqual(second(without));
    // e a primeira muda: alguma caixa da faixa 1 com âncora não existe sem âncora
    const first = (r: SuggestResult) => r.candidates!.filter((c) => c.band === 0).map((c) => JSON.stringify(c.box));
    const old = new Set(first(without));
    expect(first(withA).some((k) => !old.has(k))).toBe(true);
  });

  describe('limites da altura vinda das âncoras', () => {
    // pauta reta sintética: 4 linhas, centro da 1a em 60,5, s = 16, de x = 40 a 1360
    const straight = () => {
      const r = createRaster(1400, 400);
      drawStaff(r, { x0: 40, x1: 1360, yTop: 60, lines: 4, d: 14, t: 2 });
      const ink = binarizeOtsu(extractChannel(r, 'gray'), null);
      return findStavesRobust(ink, staffMetrics(ink)!)[0];
    };

    it('âncoras só de outra pauta (fora de [topo − 2s, base + 3s]) → padrão (null)', () => {
      const st = straight();
      expect(anchorStaffOffsets(st, 16, [{ box: { x: 300, y: 240, w: 30, h: 60 } }])).toBeNull();
      // misturadas: a de outra pauta não entra na mediana
      const own = { box: { x: 500, y: 76, w: 30, h: 64 } }; // topo +1s, base +2s
      const off = anchorStaffOffsets(st, 16, [own, { box: { x: 300, y: 240, w: 30, h: 60 } }])!;
      expect(off.top).toBeCloseTo(1, 1);
      expect(off.bottom).toBeCloseTo(2, 1);
    });

    it('deslocamentos limitados: topo |off| ≤ 3s, base ≤ 5s', () => {
      const st = straight();
      const off = anchorStaffOffsets(st, 16, [{ box: { x: 500, y: 60 - 2 * 16, w: 30, h: 48 + 2 * 16 + 10 * 16 } }])!;
      expect(off.top).toBeCloseTo(-2, 1);
      expect(off.bottom).toBe(5);
      // topo 6s acima da pauta (dentro da janela: a caixa cruza a pauta) -> -3s
      const hi = anchorStaffOffsets(st, 16, [{ box: { x: 500, y: 60 - 6 * 16, w: 30, h: 6 * 16 + 48 } }])!;
      expect(hi.top).toBe(-3);
    });

    it('âncora com base +3s numa pauta com outra 2,5s abaixo: as caixas não chegam à pauta de baixo', () => {
      const r = createRaster(1400, 300);
      drawStaff(r, { x0: 40, x1: 1360, yTop: 40, lines: 4, d: 14, t: 2 }); // base da 1a: 88,5
      drawStaff(r, { x0: 40, x1: 1360, yTop: 128, lines: 4, d: 14, t: 2 }); // topo da 2a: 128,5 = base + 2,5s
      const notes = [200, 260, 420, 480, 700, 760].map((x, i) => fillRect(r, x, 40 + (i % 3) * 16 - 6, 12, 12, INK));
      const W = r.width, H = r.height;
      const anchor = { index: 0, box: pxToFrac({ x: 1000, y: 40, w: 40, h: 48 + 3 * 16 + 1 }, W, H) }; // base 3s abaixo
      const res = suggestBoxes({ image: r, notation: 'diastematic', syllables: [], mode: 'candidates', bands: [{ x: 0, y: 0, w: 1, h: 1 }], anchors: [anchor] });
      const cands = res.candidates!.map((c) => fracToPx(c.box, W, H));
      for (const n of notes) {
        const c = cands.find((k) => k.x <= n.x + 6 && n.x + 6 <= k.x + k.w && k.y <= n.y + 6 && n.y + 6 <= k.y + k.h);
        expect(c).toBeDefined();
        expect(c!.y + c!.h).toBeLessThan(128);
      }
    });

    it('âncora com base +10s: a base das caixas fica em base da pauta + 5s', () => {
      const fx = buildDiastematicLine({ seed: 75, height: 400 });
      const W = fx.raster.width, H = fx.raster.height;
      const anchor = { index: 0, box: pxToFrac({ x: fx.truth[0].x, y: 60, w: fx.truth[0].w, h: 48 + 10 * 16 }, W, H) };
      const res = suggestBoxes({ image: fx.raster, notation: 'diastematic', syllables: [], mode: 'candidates', bands: [{ x: 0, y: 0, w: 1, h: 1 }], anchors: [anchor] });
      const notes = fx.syllables.slice(1).flatMap((s) => fx.neumes[s.index]);
      let checked = 0;
      for (const k of res.candidates!) {
        const c = fracToPx(k.box, W, H);
        if (!notes.some((n) => n.x >= c.x && n.x + n.w <= c.x + c.w && Math.abs(c.w - n.w - 2 * Math.max(2, res.debug.strokeWidth)) <= 1)) continue;
        expect(c.y + c.h).toBeLessThanOrEqual(108.5 + 5 * 16 + 2);
        checked++;
      }
      expect(checked).toBeGreaterThanOrEqual(6);
    });
  });
});

describe('M4f — canal automático', () => {
  it('M4f — tinta avermelhada: canal trocado e neumas achados', () => {
    const fx = buildAdiastematicLine({ seed: 70, inkColor: [215, 120, 90] });
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: [], mode: 'candidates' });
    expect(res.debug.channel).not.toBe('r');
    const cands = res.candidates!.map((c) => fracToPx(c.box, fx.raster.width, fx.raster.height));
    for (const s of fx.syllables)
      for (const n of fx.neumes[s.index]) expect(cands.some((c) => c.x <= n.x + n.w / 2 && n.x + n.w / 2 <= c.x + c.w)).toBe(true);
  });

  it('tinta escura comum: continua no R', () => {
    const fx = buildAdiastematicLine({ seed: 70 });
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: [], mode: 'candidates' });
    expect(res.debug.channel).toBe('r');
  });

  it('rubrica vermelha numa faixa adiastemática sem pauta: continua no R', () => {
    const fx = buildAdiastematicLine({ seed: 71, words: [['Do', 'mi', 'nus'], ['di', 'xit']] });
    drawText(fx.raster, 'DOMINUS', 80, 150, 40, 6, RED_LINE); // letras grandes vermelhas
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: [], mode: 'candidates' });
    expect(res.debug.channel).toBe('r');
  });
});

describe('M2 — sequencial por área', () => {
  const extra = (from: number, n: number, word0: number) =>
    Array.from({ length: n }, (_, k) => ({ index: from + k, text: 'ta', wordIndex: word0 + k }));
  const ids = (res: SuggestResult) => res.suggestions.map((s) => s.index);

  it('30 sílabas no pedido, área com 9: só as 9 primeiras recebem sugestão, nos seus neumas', () => {
    const words = [['Do', 'mi', 'nus'], ['di', 'xit'], ['ad'], ['me'], ['fi', 'li']];
    const fx = buildAdiastematicLine({ width: 1600, words, seed: 71 });
    const { width: W, height: H } = fx.raster;
    const syllables = [...fx.syllables, ...extra(9, 21, 5)];
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables, bands: [{ x: 0, y: 0, w: 1, h: 1 }] });
    expect(ids(res)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const got = boxesPx(res, W, H);
    for (const s of fx.syllables) expect(iou(got[s.index], fx.truth[s.index])).toBeGreaterThanOrEqual(0.8);
  });

  it('continua na área seguinte de onde a anterior parou; as que sobram ficam sem sugestão', () => {
    const a = buildAdiastematicLine({ seed: 72, words: [['Ky', 'ri', 'e'], ['e', 'lei']] });
    const b = buildAdiastematicLine({ seed: 73, words: [['son'], ['Chri', 'ste'], ['e']], firstIndex: 5 });
    const W = a.raster.width, H = a.raster.height;
    const data = new Uint8ClampedArray(W * H * 2 * 4);
    data.set(a.raster.data, 0);
    data.set(b.raster.data, W * H * 4);
    const syllables = [...a.syllables, ...b.syllables.map((s) => ({ ...s, wordIndex: s.wordIndex + 2 })), ...extra(9, 6, 10)];
    const res = suggestBoxes({
      image: { data, width: W, height: 2 * H }, notation: 'adiastematic', syllables,
      bands: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }],
    });
    expect(ids(res)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const got = boxesPx(res, W, 2 * H);
    for (const i of [0, 1, 2, 3, 4]) expect(got[i].y + got[i].h).toBeLessThanOrEqual(H + 1);
    for (const i of [5, 6, 7, 8]) expect(got[i].y).toBeGreaterThanOrEqual(H - 1);
    for (const s of b.syllables) expect(iou(got[s.index], { ...b.truth[s.index], y: b.truth[s.index].y + H })).toBeGreaterThanOrEqual(0.8);
  });

  it('a caixa da sílaba anterior abre a fila: nada à esquerda dela, as seguintes nos seus neumas', () => {
    const fx = buildAdiastematicLine({ seed: 74, words: [['Pu', 'er'], ['na', 'tus'], ['est'], ['no', 'bis']] });
    const { width: W, height: H } = fx.raster;
    const anchors = [{ index: 2, box: pxToFrac(fx.truth[2], W, H) }];
    const syllables = [...fx.syllables.slice(2), ...extra(7, 5, 4)]; // fila começa na âncora
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables, anchors, bands: [{ x: 0, y: 0, w: 1, h: 1 }] });
    expect(ids(res)).toEqual([3, 4, 5, 6]);
    const got = boxesPx(res, W, H);
    for (const i of [3, 4, 5, 6]) expect(iou(got[i], fx.truth[i])).toBeGreaterThanOrEqual(0.8);
  });

  it('corrida presa entre âncoras em áreas diferentes: o fim da primeira e o começo da segunda', () => {
    const a = buildAdiastematicLine({ seed: 75, words: [['Ky', 'ri', 'e']] });
    const b = buildAdiastematicLine({ seed: 76, words: [['e', 'lei', 'son']], firstIndex: 3 });
    const W = a.raster.width, H = a.raster.height;
    const data = new Uint8ClampedArray(W * H * 2 * 4);
    data.set(a.raster.data, 0);
    data.set(b.raster.data, W * H * 4);
    const toFull = (t: PxBox, dy: number) => pxToFrac({ ...t, y: t.y + dy }, W, 2 * H);
    const anchors = [{ index: 0, box: toFull(a.truth[0], 0) }, { index: 5, box: toFull(b.truth[5], H) }];
    const syllables = [...a.syllables, ...b.syllables.map((s) => ({ ...s, wordIndex: 1 }))];
    const res = suggestBoxes({
      image: { data, width: W, height: 2 * H }, notation: 'adiastematic', syllables, anchors,
      bands: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }],
    });
    expect(ids(res)).toEqual([1, 2, 3, 4]);
    const got = boxesPx(res, W, 2 * H);
    for (const i of [1, 2]) expect(iou(got[i], a.truth[i])).toBeGreaterThanOrEqual(0.8);
    for (const i of [3, 4]) expect(iou(got[i], { ...b.truth[i], y: b.truth[i].y + H })).toBeGreaterThanOrEqual(0.8);
  });

  it('área sem texto: uma sílaba por agrupamento de neumas', () => {
    const fx = buildAdiastematicLine({ seed: 77, text: false });
    const res = suggestBoxes({ image: fx.raster, notation: 'adiastematic', syllables: [...fx.syllables, ...extra(5, 10, 3)], bands: [{ x: 0, y: 0, w: 1, h: 1 }] });
    expect(ids(res)).toEqual([0, 1, 2, 3, 4]);
  });
});
