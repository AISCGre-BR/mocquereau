// SPDX-License-Identifier: GPL-3.0-or-later
// Contem codigo portado de Othmar neo (othmar/candidates.py, AGPL-3.0-or-later), de autoria
// exclusiva de Gabriel Honorato Teixeira Bernardo, relicenciado pelo autor sob GPL-3.0-or-later.
// Ver NOTICE.
// Escala estimada na propria imagem: espessura do traco u, metricas de pauta (Fujinaga) e
// parametros derivados. Os valores de referencia sao os de Params em othmar/candidates.py,
// calibrados a 2400 px com u ~ 3; aqui viram multiplos de u (e de s no modo D).
import type { Mask } from './types';

export const U_MIN = 1.5;
export const U_MAX = 12;

/** Valor de 1..maxLen com maior contagem (empate: o menor). 0 se vazio. */
export function histMode(hist: Float64Array | Int32Array, lo: number, hi: number): number {
  let best = 0;
  let bestV = 0;
  for (let v = Math.max(0, lo); v <= Math.min(hist.length - 1, hi); v++) {
    if (hist[v] > bestV) {
      bestV = hist[v];
      best = v;
    }
  }
  return best;
}

/**
 * Espessura do traco: para cada pixel de tinta, min(run horizontal, run vertical) que o contem;
 * moda (ponderada por pixel) entre 1 e 40. Linhas de pauta contribuem com t (proximo de u);
 * runs longos de pauta e de tracos horizontais ficam de fora. Resultado limitado a [1,5; 12].
 * Retorna 0 quando nao ha tinta.
 */
export function estimateStrokeWidth(ink: Mask): number {
  const { width: w, height: h, data } = ink;
  const hr = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!data[y * w + x]) {
        x++;
        continue;
      }
      let e = x;
      while (e < w && data[y * w + e]) e++;
      for (let k = x; k < e; k++) hr[y * w + k] = e - x;
      x = e;
    }
  }
  const hist = new Float64Array(41);
  let any = false;
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!data[y * w + x]) {
        y++;
        continue;
      }
      let e = y;
      while (e < h && data[e * w + x]) e++;
      const vr = e - y;
      for (let k = y; k < e; k++) {
        const m = Math.min(vr, hr[k * w + x]);
        if (m <= 40) {
          hist[m]++;
          any = true;
        }
      }
      y = e;
    }
  }
  if (!any) return 0;
  const mode = histMode(hist, 1, 40);
  return Math.min(U_MAX, Math.max(U_MIN, mode));
}

/** u com as linhas [y0, y1) apagadas (texto, margem de contexto); 0 se nada sobra. */
export function strokeWidthOutside(ink: Mask, exclude: { y0: number; y1: number }[]): number {
  const { width: w, height: h } = ink;
  const data = ink.data.slice();
  for (const e of exclude) {
    const y0 = Math.max(0, Math.floor(e.y0));
    const y1 = Math.min(h, Math.ceil(e.y1));
    if (y1 > y0) data.fill(0, y0 * w, y1 * w);
  }
  return estimateStrokeWidth({ data, width: w, height: h });
}

export interface StaffMetrics {
  /** Espessura da linha de pauta: moda dos runs verticais de tinta. */
  t: number;
  /** Distancia entre linhas: moda dos runs verticais de branco que nao tocam as bordas. */
  d: number;
  s: number;
}

/** Metricas de Fujinaga sobre a mascara de tinta (binarizacao do cinza). null se nao ha dados. */
export function staffMetrics(ink: Mask): StaffMetrics | null {
  const { width: w, height: h, data } = ink;
  const black = new Float64Array(h + 1);
  const white = new Float64Array(h + 1);
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      const v = data[y * w + x];
      let e = y;
      while (e < h && data[e * w + x] === v) e++;
      if (v) black[e - y]++;
      else if (y > 0 && e < h) white[e - y]++;
      y = e;
    }
  }
  const t = histMode(black, 1, h);
  if (t === 0) return null;
  const d = histMode(white, t + 1, h);
  if (d === 0) return null;
  return { t, d, s: t + d };
}

export interface Params {
  u: number;
  window: number;
  k: number;
  darkThr: number;
  darkOpen: number;
  darkMargin: number;
  minArea: number;
  maxArea: number;
  minSide: number;
  maxSide: number;
  maxAspect: number;
  mergeGapX: number;
  mergeGapY: number;
  mergeMaxW: number;
  mergeMaxH: number;
}

/** Maior inteiro impar >= 3 mais proximo de v. */
export function odd(v: number): number {
  return Math.max(3, Math.round(v) | 1);
}

/**
 * Tabela "Etapa 0" da spec. Com staff (modo D) os limites passam a depender de s. `up` = fator da
 * ampliacao do raster de trabalho (1 ou 2): os pisos de minSide (2 px) e minArea (2 px^2) valem em
 * pixels da imagem, senao um ponto isolado do pergaminho ampliado 2x (2 x 2) passaria pelo filtro.
 */
export function deriveParams(u: number, staff?: StaffMetrics | null, up = 1): Params {
  const p: Params = {
    u,
    window: odd(10 * u),
    k: 0.2,
    darkThr: 0.35,
    darkOpen: odd(2.3 * u),
    darkMargin: Math.ceil(u),
    // M4a: pontos e tracos finos (punctum ~ u x u) sobrevivem; o ruido pontual e menor que isso.
    minArea: Math.max(0.35 * u * u, 2 * up * up),
    maxArea: 170 * u * u,
    minSide: Math.max(2 * up, 0.5 * u),
    maxSide: 30 * u,
    maxAspect: 8,
    mergeGapX: 1.3 * u,
    mergeGapY: 2 * u,
    mergeMaxW: 20 * u,
    mergeMaxH: 20 * u,
  };
  if (staff) {
    const s = staff.s;
    p.window = odd(Math.max(10 * u, 1.5 * s));
    // Notas quadradas sao cheias (~s): a abertura da mancha escura precisa ser maior que elas.
    p.darkOpen = odd(Math.max(2.3 * u, 1.5 * s));
    p.maxSide = 5 * s;
    p.maxArea = Math.max(p.maxArea, 12 * s * s);
    p.mergeGapX = 0.3 * s;
    p.mergeGapY = 0.5 * s;
    p.mergeMaxW = 3 * s;
    p.mergeMaxH = 4 * s;
  }
  return p;
}
