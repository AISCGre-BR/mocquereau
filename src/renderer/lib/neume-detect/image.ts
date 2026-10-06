// SPDX-License-Identifier: GPL-3.0-or-later
// Contem codigo portado de Othmar neo (othmar/candidates.py, AGPL-3.0-or-later), de autoria
// exclusiva de Gabriel Honorato Teixeira Bernardo, relicenciado pelo autor sob GPL-3.0-or-later.
// Ver NOTICE.
// Imagens de um canal, mascaras, escolha de canal, recorte e reamostragem.
// contrastScore e pickChannel sao porte de othmar/candidates.py.
import type { ChannelName, GrayImage, Mask, PxBox, RasterRGBA } from './types';

/** Canal escolhido; pixels com alfa 0 viram 255 (fundo), para nunca parecerem tinta. */
export function extractChannel(raster: RasterRGBA, name: ChannelName): GrayImage {
  const { data, width, height } = raster;
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    if (data[p + 3] === 0) {
      out[i] = 255;
      continue;
    }
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    out[i] =
      name === 'r' ? r : name === 'g' ? g : name === 'b' ? b : Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return { data: out, width, height };
}

/** Mascara de validade: alfa > 0 (triangulos vazios do AABB rotacionado ficam fora). */
export function alphaMask(raster: RasterRGBA): Mask {
  const { data, width, height } = raster;
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 3; i < out.length; i++, p += 4) out[i] = data[p] > 0 ? 1 : 0;
  return { data: out, width, height };
}

/** Histograma de 256 posicoes, opcionalmente so dentro da mascara. */
export function histogram(img: GrayImage, mask?: Mask | null): Float64Array {
  const h = new Float64Array(256);
  const d = img.data;
  if (mask) {
    for (let i = 0; i < d.length; i++) if (mask.data[i]) h[d[i]]++;
  } else {
    for (let i = 0; i < d.length; i++) h[d[i]]++;
  }
  return h;
}

/** Percentil (0..100) por histograma: menor valor v com acumulado >= q * total. */
export function histPercentile(hist: Float64Array, q: number): number {
  let total = 0;
  for (let v = 0; v < hist.length; v++) total += hist[v];
  if (total === 0) return 0;
  const target = (q / 100) * total;
  let acc = 0;
  for (let v = 0; v < hist.length; v++) {
    acc += hist[v];
    if (acc >= target && acc > 0) return v;
  }
  return hist.length - 1;
}

/** Separacao tinta/pergaminho: (mediana - p2) / (1,4826 * MAD + 1). Porte de contrast_score. */
export function contrastScore(img: GrayImage, mask?: Mask | null): number {
  const hist = histogram(img, mask);
  let total = 0;
  for (let v = 0; v < 256; v++) total += hist[v];
  if (total < 100) return 0;
  const med = histPercentile(hist, 50);
  const p2 = histPercentile(hist, 2);
  const dev = new Float64Array(256);
  for (let v = 0; v < 256; v++) dev[Math.abs(v - med)] += hist[v];
  const mad = 1.4826 * histPercentile(dev, 50) + 1;
  return (med - p2) / mad;
}

/** 'auto' escolhe o canal de maior contrastScore (empate: ordem r, gray, g, b). */
export function pickChannel(
  raster: RasterRGBA,
  name: ChannelName | 'auto',
  mask?: Mask | null,
): { name: ChannelName; image: GrayImage } {
  if (name !== 'auto') return { name, image: extractChannel(raster, name) };
  let best: { name: ChannelName; image: GrayImage } | null = null;
  let bestScore = -Infinity;
  for (const n of ['r', 'gray', 'g', 'b'] as const) {
    const image = extractChannel(raster, n);
    const s = contrastScore(image, mask);
    if (s > bestScore) {
      bestScore = s;
      best = { name: n, image };
    }
  }
  return best!;
}

export function cropGray(img: GrayImage, box: PxBox): GrayImage {
  const out = new Uint8Array(box.w * box.h);
  for (let y = 0; y < box.h; y++) {
    const src = (box.y + y) * img.width + box.x;
    out.set(img.data.subarray(src, src + box.w), y * box.w);
  }
  return { data: out, width: box.w, height: box.h };
}

export function cropMask(m: Mask, box: PxBox): Mask {
  const g = cropGray(m, box);
  return { data: g.data as Uint8Array, width: g.width, height: g.height };
}

/**
 * Reducao por media de area: o pixel de destino (x, y) e a media dos pixels de origem em
 * [floor(x*f), floor((x+1)*f)) x [floor(y*f), floor((y+1)*f)), f = 1/scale. scale em (0, 1].
 */
export function downscaleGray(img: GrayImage, scale: number): GrayImage {
  if (scale >= 1) return { data: new Uint8Array(img.data), width: img.width, height: img.height };
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const fx = img.width / w;
  const fy = img.height / h;
  const out = new Uint8Array(w * h);
  const x0s = new Int32Array(w + 1);
  for (let x = 0; x <= w; x++) x0s[x] = Math.min(img.width, Math.floor(x * fx));
  for (let y = 0; y < h; y++) {
    const ya = Math.floor(y * fy);
    const yb = Math.max(ya + 1, Math.min(img.height, Math.floor((y + 1) * fy)));
    for (let x = 0; x < w; x++) {
      const xa = x0s[x];
      const xb = Math.max(xa + 1, x0s[x + 1]);
      let s = 0;
      for (let yy = ya; yy < yb; yy++) {
        const row = yy * img.width;
        for (let xx = xa; xx < xb; xx++) s += img.data[row + xx];
      }
      out[y * w + x] = Math.round(s / ((yb - ya) * (xb - xa)));
    }
  }
  return { data: out, width: w, height: h };
}

/** Reducao de mascara: ligado se >= 50% da area de origem estava ligada. */
export function downscaleMask(m: Mask, scale: number): Mask {
  const g = downscaleGray({ data: m.data.map((v) => (v ? 255 : 0)), width: m.width, height: m.height }, scale);
  const out = new Uint8Array(g.data.length);
  for (let i = 0; i < out.length; i++) out[i] = g.data[i] >= 128 ? 1 : 0;
  return { data: out, width: g.width, height: g.height };
}

/** Ampliacao 2x bilinear (usada quando u < 2). */
export function upscale2xGray(img: GrayImage): GrayImage {
  const w = img.width * 2;
  const h = img.height * 2;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(img.height - 1, y0 + 1);
    const ty = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(img.width - 1, x0 + 1);
      const tx = sx - x0;
      const a = img.data[y0 * img.width + x0];
      const b = img.data[y0 * img.width + x1];
      const c = img.data[y1 * img.width + x0];
      const d = img.data[y1 * img.width + x1];
      out[y * w + x] = Math.round((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty);
    }
  }
  return { data: out, width: w, height: h };
}

export function upscale2xMask(m: Mask): Mask {
  const w = m.width * 2;
  const out = new Uint8Array(w * m.height * 2);
  for (let y = 0; y < m.height * 2; y++)
    for (let x = 0; x < w; x++) out[y * w + x] = m.data[(y >> 1) * m.width + (x >> 1)];
  return { data: out, width: w, height: m.height * 2 };
}

/** Mediana dos valores dentro da mascara (todos, se mask ausente). */
export function maskedMedian(img: GrayImage, mask?: Mask | null): number {
  return histPercentile(histogram(img, mask), 50);
}

/** Recorte RGBA (copia) de [box.x, box.x + box.w) x [box.y, box.y + box.h); box deve caber no raster. */
export function cropRaster(r: RasterRGBA, box: PxBox): RasterRGBA {
  const out = new Uint8ClampedArray(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const src = ((box.y + y) * r.width + box.x) * 4;
    out.set(r.data.subarray(src, src + box.w * 4), y * box.w * 4);
  }
  return { data: out, width: box.w, height: box.h };
}
