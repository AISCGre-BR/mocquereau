import { describe, expect, it } from 'vitest';
import {
  cropRaster,
  alphaMask,
  contrastScore,
  cropGray,
  downscaleGray,
  extractChannel,
  histogram,
  histPercentile,
  pickChannel,
  upscale2xGray,
} from './image';
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
});
