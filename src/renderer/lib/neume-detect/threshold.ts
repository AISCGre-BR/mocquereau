// SPDX-License-Identifier: GPL-3.0-or-later
// Contem codigo portado de Othmar neo (othmar/candidates.py, AGPL-3.0-or-later), de autoria
// exclusiva de Gabriel Honorato Teixeira Bernardo, relicenciado pelo autor sob GPL-3.0-or-later.
// Ver NOTICE.
// Otsu global e Sauvola por imagens integrais. Porte de binarize() de othmar/candidates.py.
import { histogram } from './image';
import type { GrayImage, Mask } from './types';

/** Limiar de Otsu: tinta = valor <= t. Maximiza a variancia entre classes [0..t] e (t..255]. */
export function otsuThreshold(img: GrayImage, mask?: Mask | null): number {
  const hist = histogram(img, mask);
  let total = 0;
  let sumAll = 0;
  for (let v = 0; v < 256; v++) {
    total += hist[v];
    sumAll += v * hist[v];
  }
  if (total === 0) return 127;
  let w0 = 0;
  let sum0 = 0;
  let best = -1;
  let bestT = 127;
  for (let t = 0; t < 255; t++) {
    w0 += hist[t];
    sum0 += t * hist[t];
    const w1 = total - w0;
    if (w0 === 0 || w1 === 0) continue;
    const m0 = sum0 / w0;
    const m1 = (sumAll - sum0) / w1;
    const between = w0 * w1 * (m0 - m1) * (m0 - m1);
    if (between > best) {
      best = between;
      bestT = t;
    }
  }
  return bestT;
}

export function binarizeOtsu(img: GrayImage, mask?: Mask | null): Mask {
  const t = otsuThreshold(img, mask);
  const out = new Uint8Array(img.data.length);
  for (let i = 0; i < out.length; i++) out[i] = img.data[i] <= t && (!mask || mask.data[i]) ? 1 : 0;
  return { data: out, width: img.width, height: img.height };
}

export interface Integrals {
  /** (width+1) x (height+1), sum[(y)*(w+1)+x] = soma de img[0..y) x [0..x). */
  sum: Float64Array;
  sq: Float64Array;
  stride: number;
}

export function integralImages(img: GrayImage): Integrals {
  const w = img.width;
  const h = img.height;
  const stride = w + 1;
  const sum = new Float64Array(stride * (h + 1));
  const sq = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0;
    let rq = 0;
    for (let x = 0; x < w; x++) {
      const v = img.data[y * w + x];
      rs += v;
      rq += v * v;
      sum[(y + 1) * stride + x + 1] = sum[y * stride + x + 1] + rs;
      sq[(y + 1) * stride + x + 1] = sq[y * stride + x + 1] + rq;
    }
  }
  return { sum, sq, stride };
}

/**
 * Sauvola: tinta = v < m * (1 + k * (sd / R - 1)), media m e desvio sd na janela window x window
 * centrada (cortada na borda). window e forcada a impar.
 */
export function sauvola(img: GrayImage, window: number, k = 0.2, R = 128, mask?: Mask | null): Mask {
  const w = img.width;
  const h = img.height;
  const r = (window | 1) >> 1;
  const { sum, sq, stride } = integralImages(img);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask && !mask.data[i]) continue;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const n = (y1 - y0) * (x1 - x0);
      const s = sum[y1 * stride + x1] - sum[y0 * stride + x1] - sum[y1 * stride + x0] + sum[y0 * stride + x0];
      const q = sq[y1 * stride + x1] - sq[y0 * stride + x1] - sq[y1 * stride + x0] + sq[y0 * stride + x0];
      const m = s / n;
      const sd = Math.sqrt(Math.max(0, q / n - m * m));
      const t = m * (1 + k * (sd / R - 1));
      out[i] = img.data[i] < t ? 1 : 0;
    }
  }
  return { data: out, width: w, height: h };
}
