// SPDX-License-Identifier: GPL-3.0-or-later
// Morfologia binaria. Retangulo: separavel, O(pixels) por somas prefixas.
// Elipse: uma meia-largura por linha do elemento estruturante, contagem por somas prefixas de linha.
// Fora da imagem conta como neutro (erosao nao come a borda; dilatacao nao inventa tinta).
import type { Mask } from './types';

function rowPrefix(m: Mask): Int32Array {
  const { width: w, height: h, data } = m;
  const p = new Int32Array((w + 1) * h);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const base = y * (w + 1);
    for (let x = 0; x < w; x++) {
      acc += data[y * w + x];
      p[base + x + 1] = acc;
    }
  }
  return p;
}

function hPass(m: Mask, r: number, erode: boolean): Mask {
  const { width: w, height: h } = m;
  const p = rowPrefix(m);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const base = y * (w + 1);
    for (let x = 0; x < w; x++) {
      const a = Math.max(0, x - r);
      const b = Math.min(w, x + r + 1);
      const c = p[base + b] - p[base + a];
      out[y * w + x] = erode ? (c === b - a ? 1 : 0) : c > 0 ? 1 : 0;
    }
  }
  return { data: out, width: w, height: h };
}

function transpose(m: Mask): Mask {
  const { width: w, height: h, data } = m;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + y] = data[y * w + x];
  return { data: out, width: h, height: w };
}

/** Dilatacao por retangulo kw x kh (lados forcados a impar). */
export function dilateRect(m: Mask, kw: number, kh: number = kw): Mask {
  const a = hPass(m, (kw | 1) >> 1, false);
  return transpose(hPass(transpose(a), (kh | 1) >> 1, false));
}

export function erodeRect(m: Mask, kw: number, kh: number = kw): Mask {
  const a = hPass(m, (kw | 1) >> 1, true);
  return transpose(hPass(transpose(a), (kh | 1) >> 1, true));
}

export function openRect(m: Mask, kw: number, kh: number = kw): Mask {
  return dilateRect(erodeRect(m, kw, kh), kw, kh);
}

export function closeRect(m: Mask, kw: number, kh: number = kw): Mask {
  return erodeRect(dilateRect(m, kw, kh), kw, kh);
}

/** Meia-largura por linha de uma elipse (disco) de diametro `size` (forcado a impar). */
export function ellipseHalfWidths(size: number): Int32Array {
  const r = (size | 1) >> 1;
  const hw = new Int32Array(2 * r + 1);
  for (let dy = -r; dy <= r; dy++) {
    hw[dy + r] = Math.min(r, Math.floor(Math.sqrt(Math.max(0, (r + 0.5) * (r + 0.5) - dy * dy))));
  }
  return hw;
}

function ellipsePass(m: Mask, size: number, erode: boolean): Mask {
  const { width: w, height: h } = m;
  const hw = ellipseHalfWidths(size);
  const r = hw.length >> 1;
  const p = rowPrefix(m);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = erode ? 1 : 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        const k = hw[dy + r];
        const a = Math.max(0, x - k);
        const b = Math.min(w, x + k + 1);
        const c = p[yy * (w + 1) + b] - p[yy * (w + 1) + a];
        if (erode) {
          if (c !== b - a) {
            on = 0;
            break;
          }
        } else if (c > 0) {
          on = 1;
          break;
        }
      }
      out[y * w + x] = on;
    }
  }
  return { data: out, width: w, height: h };
}

export function erodeEllipse(m: Mask, size: number): Mask {
  return ellipsePass(m, size, true);
}

export function dilateEllipse(m: Mask, size: number): Mask {
  return ellipsePass(m, size, false);
}

export function openEllipse(m: Mask, size: number): Mask {
  return dilateEllipse(erodeEllipse(m, size), size);
}

export function closeEllipse(m: Mask, size: number): Mask {
  return erodeEllipse(dilateEllipse(m, size), size);
}
