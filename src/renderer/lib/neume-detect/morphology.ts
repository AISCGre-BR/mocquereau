// SPDX-License-Identifier: GPL-3.0-or-later
// Morfologia binaria. Retangulo e disco (octogono) sao somas de segmentos lineares aplicados a mascara
// empacotada em bits: horizontal por duplicacao (O(log L) palavras por palavra), vertical e diagonais por
// van Herk/Gil-Werman (O(1) palavras por palavra). Elipse: uma meia-largura por linha do elemento,
// contagem por somas prefixas de linha (O(pixels x diametro); referencia para o disco).
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

/** Erosao/dilatacao por retangulo kw x kh (lados forcados a impar), separavel e empacotada. */
function rectPass(m: Mask, kw: number, kh: number, erode: boolean): Mask {
  const rx = (kw | 1) >> 1;
  const ry = (kh | 1) >> 1;
  const segs: Segment[] = [
    { dx: 'h', lo: -rx, hi: rx },
    { dx: 0, lo: -ry, hi: ry },
  ];
  return segmentsPass(m, segs, Math.max(rx, ry), 0, erode);
}

/** Dilatacao por retangulo kw x kh (lados forcados a impar). */
export function dilateRect(m: Mask, kw: number, kh: number = kw): Mask {
  return rectPass(m, kw, kh, false);
}

export function erodeRect(m: Mask, kw: number, kh: number = kw): Mask {
  return rectPass(m, kw, kh, true);
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

// Mascaras empacotadas: 32 pixels por palavra (bit b da palavra i = pixel x = 32i + b), nw palavras
// por linha. Tudo e feito como dilatacao (OR, fora = 0); a erosao e o complemento da dilatacao do
// complemento pela mesma janela.

/** dst[dOff + i] |= palavra i da linha `src` lida em x + s (bits fora da linha valem 0). */
function orShifted(dst: Int32Array, dOff: number, src: Int32Array, sOff: number, nw: number, s: number): void {
  const q = s >> 5;
  const r = s & 31;
  // palavras i com i + q e i + q + 1 dentro da linha: sem testes de borda
  const i0 = Math.max(0, -q);
  const i1 = Math.min(nw, nw - q - 1);
  for (let i = 0; i < Math.min(i0, nw); i++) dst[dOff + i] |= wordAt(src, sOff, nw, i + q, r);
  if (r === 0) for (let i = i0; i < i1; i++) dst[dOff + i] |= src[sOff + i + q];
  else for (let i = i0; i < i1; i++) dst[dOff + i] |= (src[sOff + i + q] >>> r) | (src[sOff + i + q + 1] << (32 - r));
  for (let i = Math.max(i0, i1); i < nw; i++) dst[dOff + i] |= wordAt(src, sOff, nw, i + q, r);
}

function wordAt(src: Int32Array, sOff: number, nw: number, k: number, r: number): number {
  const lo = k >= 0 && k < nw ? src[sOff + k] : 0;
  if (r === 0) return lo;
  const hi = k + 1 >= 0 && k + 1 < nw ? src[sOff + k + 1] : 0;
  return (lo >>> r) | (hi << (32 - r));
}

/**
 * Segmento horizontal [lo, hi] (lo <= 0 <= hi): OR por duplicacao (A_2k = A_k | A_k deslocado de k),
 * O(log L) palavras por palavra; a janela e a uniao de duas janelas de 2^k que a cobrem.
 */
function dilateRowsPacked(src: Int32Array, nw: number, h: number, lo: number, hi: number, dst: Int32Array): void {
  const L = hi - lo + 1;
  let A = new Int32Array(nw);
  let B = new Int32Array(nw);
  for (let y = 0; y < h; y++) {
    const off = y * nw;
    A.set(src.subarray(off, off + nw));
    let k = 1;
    while (2 * k <= L) {
      B.set(A);
      orShifted(B, 0, A, 0, nw, k);
      const t = A;
      A = B;
      B = t;
      k *= 2;
    }
    dst.fill(0, off, off + nw);
    orShifted(dst, off, A, 0, nw, lo);
    orShifted(dst, off, A, 0, nw, hi - k + 1);
  }
}

/**
 * Segmento de pixels (x + dx * t, y + t), t em [lo, hi], dx em {-1, 0, 1} (vertical e diagonais), por
 * van Herk/Gil-Werman sobre linhas inteiras de palavras: blocos de L = hi - lo + 1 linhas, g e q
 * acumulam o OR ao longo de cada reta desde o inicio/fim do bloco (O(1) palavras por palavra); a
 * janela cobre no maximo dois blocos.
 */
function dilateColsPacked(
  src: Int32Array,
  nw: number,
  h: number,
  dx: number,
  lo: number,
  hi: number,
  dst: Int32Array,
  g: Int32Array,
  q: Int32Array,
): void {
  const L = hi - lo + 1;
  for (let s = 0; s < h; s += L) {
    const e = Math.min(h, s + L) - 1;
    g.set(src.subarray(s * nw, (s + 1) * nw), s * nw);
    for (let y = s + 1; y <= e; y++) {
      g.set(src.subarray(y * nw, (y + 1) * nw), y * nw);
      orShifted(g, y * nw, g, (y - 1) * nw, nw, -dx); // g[y](x) |= g[y - 1](x - dx)
    }
    q.set(src.subarray(e * nw, (e + 1) * nw), e * nw);
    for (let y = e - 1; y >= s; y--) {
      q.set(src.subarray(y * nw, (y + 1) * nw), y * nw);
      orShifted(q, y * nw, q, (y + 1) * nw, nw, dx); // q[y](x) |= q[y + 1](x + dx)
    }
  }
  for (let y = 0; y < h; y++) {
    const a = y + lo < 0 ? 0 : y + lo;
    const b = y + hi >= h ? h - 1 : y + hi;
    const off = y * nw;
    dst.fill(0, off, off + nw);
    // mesmo bloco: ou a janela comeca no bloco (g), ou foi cortada no fim da imagem (q)
    const same = ((a / L) | 0) === ((b / L) | 0);
    if (!same || a % L !== 0) orShifted(dst, off, q, a * nw, nw, dx * (a - y));
    if (!same || a % L === 0) orShifted(dst, off, g, b * nw, nw, dx * (b - y));
  }
}

/**
 * Octogono: quadrado (2a + 1)^2 (segmentos horizontal e vertical) somado a dois segmentos diagonais
 * de p pixels cada. Deslocamentos diagonais t em [-f, c], f = floor((p - 1) / 2), c = p - 1 - f; com p
 * par a soma fica deslocada de (c - f, 0) = (1, 0), corrigido no recorte final.
 */
export interface Octagon {
  a: number;
  p: number;
}

function diagRange(p: number): { f: number; c: number } {
  const f = (p - 1) >> 1;
  return { f, c: p - 1 - f };
}

const octagonCache = new Map<number, Octagon>();

/**
 * Octogono que melhor aproxima ellipseHalfWidths(size): busca exaustiva em a em [0, r] e p entre os
 * octogonos de meia-largura a + p - 1 = r - 1, r ou r + 1 (os demais ja erram uma coluna inteira),
 * pela menor diferenca simetrica de conjuntos (empate: area mais proxima; depois menor a + p). Cache
 * por size.
 */
export function octagonParams(size: number): Octagon {
  const sz = size | 1;
  const hit = octagonCache.get(sz);
  if (hit) return hit;
  const hw = ellipseHalfWidths(sz);
  const r = hw.length >> 1;
  const R = 3 * r + 1; // alcance a + (p - 1) + deslocamento <= 3r + 1 cabe na grade
  const n = 2 * R + 1;
  const disk = new Uint8Array(n * n);
  let diskArea = 0;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -hw[dy + r]; dx <= hw[dy + r]; dx++) {
      disk[(dy + R) * n + dx + R] = 1;
      diskArea++;
    }
  let best: Octagon = { a: r, p: 1 };
  let bestKey = [Infinity, Infinity, Infinity];
  // o octogono como conjunto: dilatacao de um ponto no centro da grade
  const point = new Uint8Array(n * n);
  point[R * n + R] = 1;
  for (let a = 0; a <= r; a++)
    for (let p = Math.max(1, r - a); p <= r - a + 2; p++) {
      const oct = octagonPass({ data: point, width: n, height: n }, { a, p }, false).data;
      let sym = 0;
      let area = 0;
      for (let i = 0; i < oct.length; i++) {
        sym += oct[i] !== disk[i] ? 1 : 0;
        area += oct[i];
      }
      const key = [sym, Math.abs(area - diskArea), a + p];
      const better = key[0] - bestKey[0] || key[1] - bestKey[1] || key[2] - bestKey[2];
      if (better < 0) {
        bestKey = key;
        best = { a, p };
      }
    }
  octagonCache.set(sz, best);
  return best;
}

/** Segmento: horizontal ('h') ou ao longo de (x + dx * t, y + t); deslocamentos t em [lo, hi]. */
interface Segment {
  dx: 'h' | -1 | 0 | 1;
  lo: number;
  hi: number;
}

/**
 * Erosao/dilatacao pela soma dos segmentos, em mascara empacotada. A imagem e acolchoada com `pad`
 * pixels de 0 (neutro da dilatacao; para a erosao, 1 fora da imagem), pad >= alcance do elemento,
 * entao a composicao dos passes reproduz exatamente "fora da imagem conta como neutro" do elemento
 * composto. Bits alem do acolchoamento podem sujar, mas nenhuma janela de pixel que importa chega a
 * eles. A janela composta deslocada de (shiftX, 0) e corrigida no desempacotamento.
 */
function segmentsPass(m: Mask, segs: Segment[], pad: number, shiftX: number, erode: boolean): Mask {
  const P = pad;
  const { width: w, height: h } = m;
  const pw = w + 2 * P;
  const ph = h + 2 * P;
  const nw = (pw + 31) >> 5;
  let cur = new Int32Array(nw * ph);
  const flip = erode ? 1 : 0;
  for (let y = 0; y < h; y++) {
    const s = y * w;
    const off = (y + P) * nw;
    for (let x = 0; x < w; x++) {
      if (m.data[s + x] ^ flip) {
        const X = x + P;
        cur[off + (X >> 5)] |= 1 << (X & 31);
      }
    }
  }
  let nxt = new Int32Array(nw * ph);
  let g: Int32Array | null = null;
  let q: Int32Array | null = null;
  for (const sg of segs) {
    if (sg.lo === 0 && sg.hi === 0) continue;
    if (sg.dx === 'h') dilateRowsPacked(cur, nw, ph, sg.lo, sg.hi, nxt);
    else {
      g ??= new Int32Array(nw * ph);
      q ??= new Int32Array(nw * ph);
      dilateColsPacked(cur, nw, ph, sg.dx, sg.lo, sg.hi, nxt, g, q);
    }
    const t = cur;
    cur = nxt;
    nxt = t;
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const off = (y + P) * nw;
    for (let x = 0; x < w; x++) {
      const X = x + P - shiftX;
      out[y * w + x] = ((cur[off + (X >> 5)] >>> (X & 31)) & 1) ^ flip;
    }
  }
  return { data: out, width: w, height: h };
}

function octagonPass(m: Mask, oct: Octagon, erode: boolean): Mask {
  const { a, p } = oct;
  const { f, c } = diagRange(p);
  const segs: Segment[] = [
    { dx: 'h', lo: -a, hi: a },
    { dx: 0, lo: -a, hi: a },
    { dx: 1, lo: -f, hi: c },
    // (x - t, y + t) com t em [-c, f] e a mesma reta que (x + j, y - j) com j em [-f, c]
    { dx: -1, lo: -c, hi: f },
  ];
  // com p par a janela composta e o octogono centrado deslocado de (c - f, 0) = (1, 0)
  return segmentsPass(m, segs, a + p, c - f, erode);
}

export function erodeOctagon(m: Mask, oct: Octagon): Mask {
  return octagonPass(m, oct, true);
}

export function dilateOctagon(m: Mask, oct: Octagon): Mask {
  return octagonPass(m, oct, false);
}

/** Erosao por disco de diametro `size` aproximado por octogono (O(pixels)). */
export function erodeDisk(m: Mask, size: number): Mask {
  return octagonPass(m, octagonParams(size), true);
}

export function dilateDisk(m: Mask, size: number): Mask {
  return octagonPass(m, octagonParams(size), false);
}

export function openDisk(m: Mask, size: number): Mask {
  return dilateDisk(erodeDisk(m, size), size);
}

export function closeDisk(m: Mask, size: number): Mask {
  return erodeDisk(dilateDisk(m, size), size);
}
