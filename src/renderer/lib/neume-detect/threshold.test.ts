import { describe, expect, it } from 'vitest';
import { binarizeOtsu, integralImages, otsuThreshold, sauvola } from './threshold';
import type { GrayImage } from './types';

describe('threshold', () => {
  it('Otsu separa duas modas', () => {
    const data = new Uint8Array(1000);
    for (let i = 0; i < data.length; i++) data[i] = i % 4 === 0 ? 50 : 200;
    const img: GrayImage = { data, width: 100, height: 10 };
    const t = otsuThreshold(img);
    expect(t).toBeGreaterThanOrEqual(50);
    expect(t).toBeLessThan(200);
    const m = binarizeOtsu(img);
    expect(m.data[0]).toBe(1);
    expect(m.data[1]).toBe(0);
  });

  it('imagens integrais somam qualquer retangulo', () => {
    const img: GrayImage = { data: Uint8Array.from({ length: 12 }, (_, i) => i * 10), width: 4, height: 3 };
    const { sum, sq, stride } = integralImages(img);
    // retangulo x 1..2, y 1..2
    const s = sum[3 * stride + 3] - sum[1 * stride + 3] - sum[3 * stride + 1] + sum[1 * stride + 1];
    expect(s).toBe(50 + 60 + 90 + 100);
    const q = sq[3 * stride + 3] - sq[1 * stride + 3] - sq[3 * stride + 1] + sq[1 * stride + 1];
    expect(q).toBe(50 * 50 + 60 * 60 + 90 * 90 + 100 * 100);
  });

  it('Sauvola acha tracos sob gradiente forte de iluminacao, onde Otsu falha', () => {
    const w = 400;
    const h = 100;
    const data = new Uint8Array(w * h);
    const stroke = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const bg = 250 - (190 * x) / w; // 250 -> 60
        const isStroke = x % 20 < 3 && y > 20 && y < 80;
        stroke[y * w + x] = isStroke ? 1 : 0;
        data[y * w + x] = Math.round(isStroke ? bg * 0.45 : bg);
      }
    const img: GrayImage = { data, width: w, height: h };
    const score = (m: Uint8Array) => {
      let tp = 0;
      let fp = 0;
      let pos = 0;
      for (let i = 0; i < m.length; i++) {
        if (stroke[i]) pos++;
        if (m[i] && stroke[i]) tp++;
        if (m[i] && !stroke[i]) fp++;
      }
      return { recall: tp / pos, fpRate: fp / (m.length - pos) };
    };
    const sv = score(sauvola(img, 31, 0.2).data);
    const ot = score(binarizeOtsu(img).data);
    expect(sv.recall).toBeGreaterThan(0.95);
    expect(sv.fpRate).toBeLessThan(0.01);
    expect(ot.fpRate).toBeGreaterThan(0.2);
  });
});
