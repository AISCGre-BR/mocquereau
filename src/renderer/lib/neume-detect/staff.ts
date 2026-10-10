// SPDX-License-Identifier: GPL-3.0-or-later
// Pauta (modo D): deteccao por projecao dos runs horizontais longos (com busca de inclinacao ate 8 graus),
// agrupamento em pautas de 2 a 6 linhas, rastreamento em faixas verticais, remocao preservando
// a tinta que cruza a linha (LineTrack-Height), barras de divisao, clave e custos.
import type { StaffMetrics } from './scale';
import type { Mask, PxBox } from './types';

export interface StaffLine {
  /** y (centro da linha) em cada coluna x da mascara. */
  ys: Float64Array;
  /** Media de ys em [x0, x1). */
  mean: number;
}

export interface Staff {
  lines: StaffLine[];
  /** Extensao horizontal da pauta [x0, x1). */
  x0: number;
  x1: number;
  metrics: StaffMetrics;
  /** Inclinacao global estimada, em graus. */
  angleDeg: number;
}

const ANGLE_MAX_DEG = 8;
const ANGLE_COARSE_DEG = 0.5;
const ANGLE_STEP_DEG = 0.1;
const MIN_COVERAGE = 0.15;

interface Pt {
  xs: Int32Array;
  ys: Int32Array;
  n: number;
}

/** Pixels que pertencem a runs horizontais de tinta com comprimento >= minLen. */
export function longRunPoints(ink: Mask, minLen: number): Pt {
  const { width: w, height: h, data } = ink;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!data[y * w + x]) {
        x++;
        continue;
      }
      let e = x;
      while (e < w && data[y * w + e]) e++;
      if (e - x >= minLen) for (let k = x; k < e; k++) {
        xs.push(k);
        ys.push(y);
      }
      x = e;
    }
  }
  return { xs: Int32Array.from(xs), ys: Int32Array.from(ys), n: xs.length };
}

function profileAt(pts: Pt, h: number, w: number, angleDeg: number, pad: number): Float64Array {
  const prof = new Float64Array(h + 2 * pad);
  const tan = Math.tan((angleDeg * Math.PI) / 180);
  const cx = w / 2;
  for (let i = 0; i < pts.n; i++) {
    const r = Math.round(pts.ys[i] - tan * (pts.xs[i] - cx)) + pad;
    if (r >= 0 && r < prof.length) prof[r]++;
  }
  return prof;
}

/** Margem da projecao que cabe qualquer angulo ate ANGLE_MAX_DEG. */
function anglePad(w: number): number {
  return Math.ceil(Math.tan((ANGLE_MAX_DEG * Math.PI) / 180) * (w / 2)) + 1;
}

/**
 * Angulo (graus) que torna a projecao dos pontos mais concentrada (soma dos quadrados). Busca grossa
 * em [-8, 8] passo 0,5 (ordem 0, +0,5, -0,5, ...), fina em +-0,5 do melhor passo 0,1; empate = menor |a|.
 */
export function bestAngle(pts: { xs: Int32Array; ys: Int32Array; n: number }, h: number, w: number): number {
  const pad = anglePad(w);
  const score = (a: number): number => {
    const prof = profileAt(pts, h, w, a, pad);
    let sc = 0;
    for (let i = 0; i < prof.length; i++) sc += prof[i] * prof[i];
    return sc;
  };
  const search = (center: number, step: number, n: number): number => {
    let best = center;
    let bestScore = -1;
    for (let k = 0; k <= 2 * n; k++) {
      // ordem c, c + step, c - step, ... : empate fica com o mais perto do centro
      const a = Math.round((center + (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * step) * 10) / 10;
      if (Math.abs(a) > ANGLE_MAX_DEG + 1e-9) continue;
      const sc = score(a);
      if (sc > bestScore || (sc === bestScore && Math.abs(a) < Math.abs(best))) {
        bestScore = sc;
        best = a;
      }
    }
    return best;
  };
  const coarse = search(0, ANGLE_COARSE_DEG, Math.round(ANGLE_MAX_DEG / ANGLE_COARSE_DEG));
  return search(coarse, ANGLE_STEP_DEG, Math.round(ANGLE_COARSE_DEG / ANGLE_STEP_DEG)) + 0;
}

/**
 * Pautas na mascara (binarizacao do cinza). Linhas candidatas = picos da projecao dos runs
 * horizontais >= minRun (padrao max(8, 3d)), no angulo (|a| <= 8 graus, `bestAngle`) que torna a
 * projecao mais concentrada; picos >= 0,5 x o maior e cobertura >= 15% da largura. Pautas =
 * sequencias de 2 a 6 linhas com espacamento s +- 30%. Ordenadas por numero de linhas (desc) e depois por y.
 */
export function findStaves(ink: Mask, metrics: StaffMetrics, minRun = Math.max(8, 3 * metrics.d)): Staff[] {
  const { width: w, height: h } = ink;
  const pts = longRunPoints(ink, minRun);
  if (pts.n === 0) return [];
  const pad = anglePad(w);
  const angle = bestAngle(pts, h, w);
  const prof = profileAt(pts, h, w, angle, pad);
  let max = 0;
  for (let i = 0; i < prof.length; i++) max = Math.max(max, prof[i]);
  if (max / w < MIN_COVERAGE) return [];
  const thr = 0.5 * max;
  const centers: number[] = [];
  for (let i = 0; i < prof.length; ) {
    if (prof[i] < thr) {
      i++;
      continue;
    }
    let e = i;
    let sw = 0;
    let sy = 0;
    while (e < prof.length && prof[e] >= thr) {
      sw += prof[e];
      sy += prof[e] * (e - pad);
      e++;
    }
    centers.push(sy / sw);
    i = e;
  }
  const s = metrics.s;
  const groups: number[][] = [];
  let cur: number[] = [];
  for (const c of centers) {
    if (cur.length && Math.abs(c - cur[cur.length - 1] - s) > 0.3 * s) {
      groups.push(cur);
      cur = [];
    }
    cur.push(c);
  }
  if (cur.length) groups.push(cur);
  const tan = Math.tan((angle * Math.PI) / 180);
  const staves: Staff[] = [];
  for (const g of groups) {
    if (g.length < 2 || g.length > 6) continue;
    const tracked = trackLines(ink, g, tan, metrics);
    if (tracked) staves.push({ ...tracked, metrics, angleDeg: angle });
  }
  staves.sort((a, b) => b.lines.length - a.lines.length || a.lines[0].mean - b.lines[0].mean);
  return staves;
}

/** Pautas das tentativas de recurso (runs curtas, mapa r - g) precisam cobrir esta fracao das colunas. */
export const FALLBACK_MIN_COVERAGE = 0.5;

/**
 * Fracao das colunas da mascara em que ao menos metade das linhas da pauta tem tinta a +- ceil(t)
 * de ys[x]. Ao contrario de x1 - x0, nao conta os vaos entre rubricas nas duas pontas.
 */
export function staffColumnCoverage(ink: Mask, staff: Staff): number {
  const { width: w, height: h, data } = ink;
  const r = Math.max(1, Math.ceil(staff.metrics.t));
  const need = Math.ceil(staff.lines.length / 2);
  let present = 0;
  for (let x = staff.x0; x < staff.x1; x++) {
    let n = 0;
    for (const l of staff.lines) {
      const yc = Math.round(l.ys[x]);
      for (let y = Math.max(0, yc - r); y <= Math.min(h - 1, yc + r); y++)
        if (data[y * w + x]) {
          n++;
          break;
        }
    }
    if (n >= need) present++;
  }
  return w ? present / w : 0;
}

/** Linhas minimas de uma pauta das tentativas de recurso: o topo e a base de uma linha de letras sao 2. */
export const FALLBACK_MIN_LINES = 3;

/** Pauta aceitavel numa tentativa de recurso: >= FALLBACK_MIN_LINES linhas e cobertura das colunas. */
export function isFallbackStaff(ink: Mask, st: Staff): boolean {
  return st.lines.length >= FALLBACK_MIN_LINES && staffColumnCoverage(ink, st) >= FALLBACK_MIN_COVERAGE;
}

/**
 * Primeiro com runs >= 3d; sem pauta, de novo com runs >= max(8, 2t + 4): numa pauta inclinada os
 * runs horizontais de uma linha medem ~ t / tan(angulo), curtos demais para 3d a partir de ~3 graus.
 * Runs curtas tambem casam com tracos horizontais alinhados de letras grandes (rubricas): na segunda
 * tentativa so ficam pautas que cobrem FALLBACK_MIN_COVERAGE das colunas.
 */
export function findStavesRobust(ink: Mask, metrics: StaffMetrics): Staff[] {
  const first = findStaves(ink, metrics);
  if (first.length) return first;
  return findStaves(ink, metrics, Math.max(8, 2 * metrics.t + 4)).filter((st) => isFallbackStaff(ink, st));
}

function median3(a: number, b: number, c: number): number {
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
}

/**
 * Rastreamento: faixas verticais de largura max(16t, 4d); em cada uma, deslocamento dy em +- d/2 que
 * maximiza a tinta sob a reta prevista (centro do platô de maximos); mediana movel de 3 faixas;
 * interpolacao linear entre centros de faixa. Faixa "presente" se >= metade das linhas tem tinta em
 * >= 50% das colunas; [x0, x1) vai da primeira a ultima faixa presente.
 */
export function trackLines(
  ink: Mask,
  centersAtMid: number[],
  tan: number,
  metrics: StaffMetrics,
): { lines: StaffLine[]; x0: number; x1: number } | null {
  const { width: w, height: h, data } = ink;
  const sw = Math.max(8, Math.round(Math.max(16 * metrics.t, 4 * metrics.d)));
  const nStrips = Math.max(1, Math.ceil(w / sw));
  const R = Math.max(1, Math.ceil(metrics.d / 2));
  const cx = w / 2;
  const present = new Int32Array(nStrips);
  const lines: StaffLine[] = [];
  for (const c0 of centersAtMid) {
    const off = new Float64Array(nStrips).fill(NaN);
    for (let k = 0; k < nStrips; k++) {
      const xa = k * sw;
      const xb = Math.min(w, xa + sw);
      let best = -1;
      let sumDy = 0;
      let nBest = 0;
      for (let dy = -R; dy <= R; dy++) {
        let cnt = 0;
        for (let x = xa; x < xb; x++) {
          const y = Math.round(c0 + tan * (x - cx) + dy);
          if (y >= 0 && y < h && data[y * w + x]) cnt++;
        }
        if (cnt > best) {
          best = cnt;
          sumDy = dy;
          nBest = 1;
        } else if (cnt === best) {
          sumDy += dy;
          nBest++;
        }
      }
      if (best >= 0.5 * (xb - xa)) {
        off[k] = sumDy / nBest;
        present[k]++;
      }
    }
    const valid: number[] = [];
    for (let k = 0; k < nStrips; k++) if (!Number.isNaN(off[k])) valid.push(k);
    if (valid.length === 0) return null;
    const smooth = new Float64Array(valid.length);
    for (let i = 0; i < valid.length; i++) {
      const a = off[valid[Math.max(0, i - 1)]];
      const b = off[valid[i]];
      const c = off[valid[Math.min(valid.length - 1, i + 1)]];
      smooth[i] = median3(a, b, c);
    }
    const ys = new Float64Array(w);
    let vi = 0;
    for (let x = 0; x < w; x++) {
      const stripPos = (x + 0.5) / sw - 0.5; // posicao em unidades de faixa (centro da faixa k = k)
      while (vi + 1 < valid.length && valid[vi + 1] <= stripPos) vi++;
      let o: number;
      if (stripPos <= valid[0]) o = smooth[0];
      else if (vi + 1 >= valid.length) o = smooth[valid.length - 1];
      else {
        const t = (stripPos - valid[vi]) / (valid[vi + 1] - valid[vi]);
        o = smooth[vi] * (1 - t) + smooth[vi + 1] * t;
      }
      ys[x] = c0 + tan * (x - cx) + o;
    }
    lines.push({ ys, mean: 0 });
  }
  const need = Math.ceil(centersAtMid.length / 2);
  let k0 = -1;
  let k1 = -1;
  for (let k = 0; k < nStrips; k++)
    if (present[k] >= need) {
      if (k0 < 0) k0 = k;
      k1 = k;
    }
  if (k0 < 0) return null;
  // refina a extensao coluna a coluna a partir das faixas presentes
  const r = Math.max(1, Math.ceil(metrics.t));
  const columnPresent = (x: number): boolean => {
    let n = 0;
    for (const l of lines) {
      const yc = Math.round(l.ys[x]);
      for (let y = Math.max(0, yc - r); y <= Math.min(h - 1, yc + r); y++)
        if (data[y * w + x]) {
          n++;
          break;
        }
    }
    return n >= need;
  };
  let x0 = k0 * sw;
  let x1 = Math.min(w, (k1 + 1) * sw);
  while (x0 > 0 && columnPresent(x0 - 1)) x0--;
  while (x0 < x1 - 1 && !columnPresent(x0)) x0++;
  while (x1 < w && columnPresent(x1)) x1++;
  while (x1 > x0 + 1 && !columnPresent(x1 - 1)) x1--;
  for (const l of lines) {
    let s = 0;
    for (let x = x0; x < x1; x++) s += l.ys[x];
    l.mean = s / (x1 - x0);
  }
  lines.sort((a, b) => a.mean - b.mean);
  return { lines, x0, x1 };
}

/** Tolerancia de remocao: run vertical <= t + max(1, round(0,5t)) e apagado. */
export function removalLimit(t: number): number {
  return t + Math.max(1, Math.round(0.5 * t));
}

/**
 * Remove as linhas da pauta de `ink` (copia). Em cada coluna de [x0, x1) de cada linha, acha o run
 * vertical de tinta mais proximo de ys[x] (busca +- ceil(t)); apaga se curto (so linha), mantem se
 * longo (neuma cruzando a linha).
 */
export function removeStaffLines(ink: Mask, staff: Staff): Mask {
  const { width: w, height: h } = ink;
  const out = new Uint8Array(ink.data);
  const t = staff.metrics.t;
  const limit = removalLimit(t);
  const search = Math.max(1, Math.ceil(t));
  for (const line of staff.lines) {
    for (let x = staff.x0; x < staff.x1; x++) {
      const yc = Math.round(line.ys[x]);
      let yi = -1;
      for (let k = 0; k <= search && yi < 0; k++) {
        if (yc - k >= 0 && yc - k < h && ink.data[(yc - k) * w + x]) yi = yc - k;
        else if (k > 0 && yc + k >= 0 && yc + k < h && ink.data[(yc + k) * w + x]) yi = yc + k;
      }
      if (yi < 0) continue;
      let a = yi;
      let b = yi;
      while (a > 0 && ink.data[(a - 1) * w + x]) a--;
      while (b < h - 1 && ink.data[(b + 1) * w + x]) b++;
      if (b - a + 1 <= limit) for (let y = a; y <= b; y++) out[y * w + x] = 0;
    }
  }
  return { data: out, width: w, height: h };
}

/** Fracao de (linha, coluna em [x0, x1)) com tinta a +- ceil(t) de ys[x]. */
export function staffCoverage(ink: Mask, staff: Staff): number {
  const { width: w, height: h, data } = ink;
  const r = Math.max(1, Math.ceil(staff.metrics.t));
  let hit = 0;
  let total = 0;
  for (const line of staff.lines)
    for (let x = staff.x0; x < staff.x1; x++) {
      total++;
      const yc = Math.round(line.ys[x]);
      for (let y = Math.max(0, yc - r); y <= Math.min(h - 1, yc + r); y++)
        if (data[y * w + x]) {
          hit++;
          break;
        }
    }
  return total ? hit / total : 0;
}

export function staffTop(staff: Staff): number {
  let m = Infinity;
  const l = staff.lines[0];
  for (let x = staff.x0; x < staff.x1; x++) m = Math.min(m, l.ys[x]);
  return m;
}

export function staffBottom(staff: Staff): number {
  let m = -Infinity;
  const l = staff.lines[staff.lines.length - 1];
  for (let x = staff.x0; x < staff.x1; x++) m = Math.max(m, l.ys[x]);
  return m;
}

/** Linhas superior e inferior no intervalo [xa, xb) (cortado a [x0, x1)). */
export function staffSpanAt(staff: Staff, xa: number, xb: number): { top: number; bottom: number } {
  const a = Math.max(staff.x0, Math.floor(xa));
  const b = Math.min(staff.x1, Math.ceil(xb));
  const top = staff.lines[0].ys;
  const bot = staff.lines[staff.lines.length - 1].ys;
  if (b <= a) {
    const x = Math.min(staff.x1 - 1, Math.max(staff.x0, Math.round((xa + xb) / 2)));
    return { top: top[x], bottom: bot[x] };
  }
  let t = Infinity;
  let bo = -Infinity;
  for (let x = a; x < b; x++) {
    t = Math.min(t, top[x]);
    bo = Math.max(bo, bot[x]);
  }
  return { top: t, bottom: bo };
}

/** Translada a pauta (recorte do raster de trabalho em [ox, ox+w) x [oy, ...)). */
export function cropStaff(staff: Staff, ox: number, oy: number, w: number): Staff {
  return {
    ...staff,
    x0: Math.max(0, staff.x0 - ox),
    x1: Math.min(w, staff.x1 - ox),
    lines: staff.lines.map((l) => {
      const ys = new Float64Array(w);
      for (let x = 0; x < w; x++) ys[x] = l.ys[Math.min(l.ys.length - 1, Math.max(0, x + ox))] - oy;
      return { ys, mean: l.mean - oy };
    }),
  };
}

/** Barras de divisao: altura >= 1,5s, largura <= max(3u, 0,5d), h/w >= 4, cruzando a pauta. */
export function isBarLine(c: PxBox, staff: Staff, u: number): boolean {
  const { s, d } = staff.metrics;
  if (c.h < 1.5 * s || c.w > Math.max(3 * u, 0.5 * d) || c.h / c.w < 4) return false;
  const span = staffSpanAt(staff, c.x, c.x + c.w);
  return c.y <= span.bottom && c.y + c.h >= span.top;
}

export interface SpecialGlyphs {
  clef: number[];
  custos: number[];
}

/**
 * Clave: centro x < x0 + 3s, altura >= 1,2d e antes do primeiro componente de texto.
 * Custos: glifo mais a direita, a menos de 2s do fim da pauta, area < 0,6 x mediana das areas e
 * a direita do ultimo componente de texto. Indices em `glyphs`.
 */
export function classifySpecialGlyphs(
  glyphs: (PxBox & { area: number })[],
  staff: Staff,
  text: { firstX: number; lastX: number } | null,
): SpecialGlyphs {
  const { s, d } = staff.metrics;
  const clef: number[] = [];
  const custos: number[] = [];
  glyphs.forEach((g, i) => {
    const cx = g.x + g.w / 2;
    if (cx < staff.x0 + 3 * s && g.h >= 1.2 * d && (!text || cx < text.firstX)) clef.push(i);
  });
  if (glyphs.length >= 2) {
    let ri = 0;
    for (let i = 1; i < glyphs.length; i++)
      if (glyphs[i].x + glyphs[i].w / 2 > glyphs[ri].x + glyphs[ri].w / 2) ri = i;
    const areas = glyphs.map((g) => g.area).sort((a, b) => a - b);
    const med = areas[areas.length >> 1];
    const g = glyphs[ri];
    const cx = g.x + g.w / 2;
    if (g.x + g.w >= staff.x1 - 2 * s && g.area < 0.6 * med && (!text || cx > text.lastX) && !clef.includes(ri))
      custos.push(ri);
  }
  return { clef, custos };
}
