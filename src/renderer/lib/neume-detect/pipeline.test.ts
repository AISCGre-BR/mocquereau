import { describe, expect, it } from 'vitest';
import { extractChannel } from './image';
import { measureU, suggestBoxes } from './pipeline';
import { estimateStrokeWidth } from './scale';
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
    expect(res.suggestions).toHaveLength(4);
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
    const fx = buildAdiastematicLine({ seed: 6, u: 1 });
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

    it('tinta centrada fora da área é descartada', () => {
      const r = build();
      fillRect(r, 500, 50, 6, 6, INK); // marca isolada inteira na margem de cima
      expect(run(r).some((c) => covers(c, 503, 53))).toBe(false);
    });
  });
});
