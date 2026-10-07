import { describe, expect, it } from 'vitest';
import { suggestBoxes } from './pipeline';
import type { RasterRGBA } from './types';
import {
  buildAdiastematicLine,
  buildDiastematicLine,
  createRaster,
  fillRect,
  INK,
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
      for (let x = W - 1; x >= W - 60 + y / 5; x--) r.data.set([0, 0, 0, 0], (y * W + x) * 4);
    const res = suggestBoxes({ image: r, notation: 'adiastematic', syllables: fx.syllables.slice(0, 4) });
    const got = boxesPx(res, W, H);
    for (const s of res.suggestions) expect(got[s.index].x + got[s.index].w).toBeLessThan(W - 60);
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
  it(`2400 x 600, 20 silabas < ${strict ? 1500 : 4000} ms`, () => {
    const words = Array.from({ length: 5 }, (_, i) => ['Ky', 'ri', 'e', i % 2 ? 'e' : 'son']);
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
