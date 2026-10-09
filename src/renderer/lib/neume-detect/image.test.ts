import { describe, expect, it } from 'vitest';
import {
  cropRaster,
  alphaMask,
  downscaleMask,
  prepareWork,
  rednessInk,
  contrastScore,
  cropGray,
  downscaleGray,
  extractChannel,
  histogram,
  histPercentile,
  pickChannel,
  upscale2xGray,
} from './image';
import { addNoise, createRaster } from './synthetic';
import type { GrayImage, RasterRGBA } from './types';

function raster(w: number, h: number, px: (x: number, y: number) => [number, number, number, number]): RasterRGBA {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set(px(x, y), (y * w + x) * 4);
  return { data, width: w, height: h };
}

describe('image', () => {
  it('extractChannel le R, cinza e trata alfa 0 como fundo branco', () => {
    const r = raster(2, 1, (x) => (x === 0 ? [100, 50, 10, 255] : [0, 0, 0, 0]));
    expect(Array.from(extractChannel(r, 'r').data)).toEqual([100, 255]);
    expect(extractChannel(r, 'gray').data[0]).toBe(Math.round(0.299 * 100 + 0.587 * 50 + 0.114 * 10));
    expect(Array.from(alphaMask(r).data)).toEqual([1, 0]);
  });

  it('histPercentile acha mediana e p2 por histograma', () => {
    const img: GrayImage = { data: Uint8Array.from([10, 20, 30, 40, 50]), width: 5, height: 1 };
    const h = histogram(img);
    expect(histPercentile(h, 50)).toBe(30);
    expect(histPercentile(h, 2)).toBe(10);
  });

  it('pickChannel auto escolhe o canal com maior contraste tinta/pergaminho', () => {
    // tinta so difere no R; G e B sao planos
    const r = raster(100, 100, (x, y) => ((x * 7 + y * 3) % 50 === 0 ? [40, 200, 200, 255] : [200, 200, 200, 255]));
    expect(contrastScore(extractChannel(r, 'r'))).toBeGreaterThan(contrastScore(extractChannel(r, 'g')));
    expect(pickChannel(r, 'auto').name).toBe('r');
    expect(pickChannel(r, 'b').name).toBe('b');
  });

  it('downscaleGray faz media de area e arredonda dimensoes', () => {
    const img: GrayImage = { data: Uint8Array.from([0, 0, 200, 200, 0, 0, 200, 200, 100, 100, 50, 50, 100, 100, 50, 50]), width: 4, height: 4 };
    const d = downscaleGray(img, 0.5);
    expect([d.width, d.height]).toEqual([2, 2]);
    expect(Array.from(d.data)).toEqual([0, 200, 100, 50]);
    expect(downscaleGray({ data: new Uint8Array(2401 * 3).fill(9), width: 2401, height: 3 }, 2400 / 2401).width).toBe(2400);
  });

  it('upscale2xGray dobra as dimensoes e preserva regioes planas', () => {
    const img: GrayImage = { data: Uint8Array.from([10, 10, 10, 10]), width: 2, height: 2 };
    const u = upscale2xGray(img);
    expect([u.width, u.height]).toEqual([4, 4]);
    expect(Array.from(u.data).every((v) => v === 10)).toBe(true);
  });

  it('cropGray copia a regiao', () => {
    const img: GrayImage = { data: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]), width: 3, height: 3 };
    expect(Array.from(cropGray(img, { x: 1, y: 1, w: 2, h: 2 }).data)).toEqual([5, 6, 8, 9]);
  });

  it('cropRaster com a caixa igual ao raster inteiro devolve a mesma vista, sem copiar', () => {
    const r = { data: new Uint8ClampedArray(4 * 3 * 4), width: 4, height: 3 };
    expect(cropRaster(r, { x: 0, y: 0, w: 4, h: 3 }).data).toBe(r.data);
    expect(cropRaster(r, { x: 1, y: 0, w: 2, h: 3 }).data).not.toBe(r.data);
  });

  it('prepareWork equivale a recorte + canais + alfa + reducao, inclusive alfa 0 e escala 1', () => {
    const r = createRaster(37, 23);
    addNoise(r, 5, 60, 0.05);
    for (let i = 0; i < 40; i++) r.data[((i * 17) % (37 * 23)) * 4 + 3] = 0;
    const rect = { x: 3, y: 2, w: 31, h: 19 };
    for (const scale of [1, 0.5, 0.37]) {
      const crop = cropRaster(r, rect);
      const want = {
        r: downscaleGray(extractChannel(crop, 'r'), scale),
        g: downscaleGray(extractChannel(crop, 'g'), scale),
        b: downscaleGray(extractChannel(crop, 'b'), scale),
        gray: downscaleGray(extractChannel(crop, 'gray'), scale),
        valid: downscaleMask(alphaMask(crop), scale),
      };
      const got = prepareWork(r, rect, scale);
      expect([got.r.width, got.r.height]).toEqual([want.r.width, want.r.height]);
      expect([got.valid.width, got.valid.height]).toEqual([want.valid.width, want.valid.height]);
      expect(Array.from(got.r.data)).toEqual(Array.from(want.r.data));
      expect(Array.from(got.g.data)).toEqual(Array.from(want.g.data));
      expect(Array.from(got.b.data)).toEqual(Array.from(want.b.data));
      expect(Array.from(got.gray.data)).toEqual(Array.from(want.gray.data));
      expect(Array.from(got.valid.data)).toEqual(Array.from(want.valid.data));
    }
  });

  it('rednessInk: tinta = vermelho (r - g alto), escuro e pergaminho ficam claros', () => {
    const r = { data: Uint8Array.from([226, 235, 45, 226, 255]), width: 5, height: 1 };
    const g = { data: Uint8Array.from([70, 150, 35, 212, 0]), width: 5, height: 1 };
    expect(Array.from(rednessInk(r, g).data)).toEqual([0, 85, 235, 227, 0]);
  });
});
