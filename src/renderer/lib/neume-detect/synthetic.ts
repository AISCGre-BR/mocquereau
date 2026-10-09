// SPDX-License-Identifier: GPL-3.0-or-later
// Geradores de imagens sinteticas para testes e avaliacao. Nada aqui e usado em producao.
// Todas as funcoes sao deterministicas (PRNG com semente).
import type { FracRect, PxBox, RasterRGBA, SuggestSyllable } from './types';

export type RGB = readonly [number, number, number];
export const PARCHMENT: RGB = [226, 212, 178];
export const INK: RGB = [45, 35, 30];
/** R igual ao do pergaminho: a linha some no canal R e aparece no cinza. */
export const RED_LINE: RGB = [226, 70, 60];
export const STAIN: RGB = [20, 15, 15];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRaster(width: number, height: number, bg: RGB = PARCHMENT): RasterRGBA {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

export function setPixel(r: RasterRGBA, x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= r.width || y >= r.height) return;
  const p = (y * r.width + x) * 4;
  r.data[p] = c[0];
  r.data[p + 1] = c[1];
  r.data[p + 2] = c[2];
}

/** Preenche [x, x+w) x [y, y+h) cortado ao raster; devolve a caixa efetivamente pintada. */
export function fillRect(r: RasterRGBA, x: number, y: number, w: number, h: number, c: RGB = INK): PxBox {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(r.width, Math.round(x) + Math.round(w));
  const y1 = Math.min(r.height, Math.round(y) + Math.round(h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) setPixel(r, xx, yy, c);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

export function unionBox(boxes: PxBox[]): PxBox {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    if (b.w <= 0 || b.h <= 0) continue;
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  if (x0 === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Traco de espessura t: carimba quadrados t x t ao longo de cada segmento da poligonal. */
export function drawPolyline(r: RasterRGBA, pts: [number, number][], t: number, c: RGB = INK): PxBox {
  const boxes: PxBox[] = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, ay] = pts[k];
    const [bx, by] = pts[k + 1];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let i = 0; i <= n; i++) {
      const px = Math.round(ax + ((bx - ax) * i) / n);
      const py = Math.round(ay + ((by - ay) * i) / n);
      boxes.push(fillRect(r, px, py, t, t, c));
    }
  }
  return unionBox(boxes);
}

export type NeumeShape = 'punctum' | 'virga' | 'pes' | 'clivis' | 'torculus';

/** Neuma adiastematico com traco u, canto superior esquerdo (x, y). Um componente conexo. */
export function drawNeume(r: RasterRGBA, shape: NeumeShape, x: number, y: number, u: number, c: RGB = INK): PxBox {
  switch (shape) {
    case 'punctum':
      return fillRect(r, x, y + 4 * u, u + 1, u + 1, c);
    case 'virga':
      return drawPolyline(r, [[x + u, y], [x, y + 6 * u]], u, c);
    case 'pes':
      return drawPolyline(r, [[x, y + 5 * u], [x + 2 * u, y + 6 * u], [x + 3 * u, y]], u, c);
    case 'clivis':
      return drawPolyline(r, [[x, y + 6 * u], [x + u, y], [x + 3 * u, y + 6 * u]], u, c);
    case 'torculus':
      return drawPolyline(r, [[x, y + 6 * u], [x + u, y], [x + 2 * u, y + 6 * u], [x + 3 * u, y + 2 * u]], u, c);
  }
}

/** Contorno retangular (letra "o"). */
function outline(r: RasterRGBA, x: number, y: number, w: number, h: number, u: number, c: RGB = INK): PxBox {
  fillRect(r, x, y, w, u, c);
  fillRect(r, x, y + h - u, w, u, c);
  fillRect(r, x, y, u, h, c);
  fillRect(r, x + w - u, y, u, h, c);
  return { x, y, w, h };
}

/**
 * Letra sintetica: contorno de 0,75xh x xh apoiado na linha de base; ascendentes (maiusculas e
 * b d f h k l t) ganham haste ate base - 2xh; descendentes (g p q y) ate base + 0,6xh.
 * Devolve a largura usada.
 */
export function drawLetter(r: RasterRGBA, ch: string, x: number, baseline: number, xh: number, u: number, c: RGB = INK): number {
  const w = Math.round(0.75 * xh);
  const boxes = [outline(r, x, baseline - xh, w, xh, u, c)];
  if (/[A-Zbdfhklt]/.test(ch)) boxes.push(fillRect(r, x, baseline - 2 * xh, u, xh, c));
  if (/[gpqy]/.test(ch)) boxes.push(fillRect(r, x, baseline, u, Math.round(0.6 * xh), c));
  return w;
}

export const LETTER_GAP = 4;

/** Escreve o texto de uma silaba a partir de x; devolve a caixa do texto. */
export function drawText(r: RasterRGBA, text: string, x: number, baseline: number, xh: number, u: number, c: RGB = INK): PxBox {
  let cx = x;
  for (const ch of text) cx += drawLetter(r, ch, cx, baseline, xh, u, c) + LETTER_GAP;
  return { x, y: baseline - 2 * xh, w: cx - LETTER_GAP - x, h: Math.round(2.6 * xh) };
}

/** Ruido uniforme +-amp nos tres canais e pontos escuros isolados (densidade speckle). */
export function addNoise(r: RasterRGBA, seed: number, amp = 12, speckle = 0.0003): void {
  const rnd = mulberry32(seed);
  for (let i = 0; i < r.width * r.height; i++) {
    const n = Math.round((rnd() * 2 - 1) * amp);
    for (let c = 0; c < 3; c++) r.data[i * 4 + c] = Math.max(0, Math.min(255, r.data[i * 4 + c] + n));
    if (rnd() < speckle) for (let c = 0; c < 3; c++) r.data[i * 4 + c] = INK[c];
  }
}

/** Rotacao exata por multiplos de 90 graus no sentido horario (permutacao de pixels). */
export function rotateRaster90(r: RasterRGBA, turns: number): RasterRGBA {
  let cur = r;
  for (let k = 0; k < (((turns % 4) + 4) % 4); k++) {
    const w = cur.width;
    const h = cur.height;
    const out = new Uint8ClampedArray(w * h * 4);
    // (x, y) -> (h - 1 - y, x) numa imagem h x w
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const s = (y * w + x) * 4;
        const d = (x * h + (h - 1 - y)) * 4;
        out[d] = cur.data[s];
        out[d + 1] = cur.data[s + 1];
        out[d + 2] = cur.data[s + 2];
        out[d + 3] = cur.data[s + 3];
      }
    cur = { data: out, width: h, height: w };
  }
  return cur;
}

/** Ampliacao inteira por vizinho mais proximo (simula digitalizacao em resolucao maior). */
export function upscaleRasterNearest(r: RasterRGBA, k: number): RasterRGBA {
  const w = r.width * k;
  const h = r.height * k;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = (Math.floor(y / k) * r.width + Math.floor(x / k)) * 4;
      out.set(r.data.subarray(s, s + 4), (y * w + x) * 4);
    }
  return { data: out, width: w, height: h };
}

export function scaleBox(b: PxBox, k: number): PxBox {
  return { x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k };
}

export function iou(a: PxBox, b: PxBox): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}

export function fracToPx(f: FracRect, width: number, height: number): PxBox {
  return { x: f.x * width, y: f.y * height, w: f.w * width, h: f.h * height };
}

export function pxToFrac(b: PxBox, width: number, height: number): FracRect {
  return { x: b.x / width, y: b.y / height, w: b.w / width, h: b.h / height };
}

export function padBox(b: PxBox, p: number): PxBox {
  return { x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p };
}

export interface LineFixture {
  raster: RasterRGBA;
  syllables: SuggestSyllable[];
  /** Uniao da tinta dos neumas de cada silaba (indice global). */
  ink: Record<number, PxBox>;
  /** Caixa de cada neuma desenhado, por sílaba. */
  neumes: Record<number, PxBox[]>;
  /** Caixa que um pesquisador desenharia: ver cada gerador. */
  truth: Record<number, PxBox>;
  u: number;
  baseline: number;
  xHeight: number;
}

const SHAPES: NeumeShape[] = ['punctum', 'virga', 'pes', 'clivis', 'torculus'];

export interface AdiastematicOptions {
  width?: number;
  height?: number;
  /** Palavras, cada uma lista de silabas. */
  words?: string[][];
  u?: number;
  seed?: number;
  /** Mancha escura grande entre a 3a e a 4a coluna. */
  stain?: boolean;
  noise?: boolean;
  /** Indice global da primeira silaba. */
  firstIndex?: number;
  /** Espessura da caneta do texto (padrão u). */
  textU?: number;
}

/**
 * Linha adiastematica: uma coluna por silaba, 2 ou 3 neumas por coluna (vaos internos de 6u a 10u),
 * texto sob os neumas (linha de base = altura - 45, xh = 16). Verdade = tinta dos neumas + max(2, u).
 */
export function buildAdiastematicLine(opts: AdiastematicOptions = {}): LineFixture {
  const width = opts.width ?? 1200;
  const height = opts.height ?? 260;
  const words = opts.words ?? [['Pu', 'er'], ['na', 'tus'], ['est']];
  const u = opts.u ?? 3;
  const rnd = mulberry32(opts.seed ?? 7);
  const first = opts.firstIndex ?? 0;
  const r = createRaster(width, height);
  const baseline = height - 45;
  const xh = 16;
  const syllables: SuggestSyllable[] = [];
  words.forEach((w, wi) => w.forEach((text) => syllables.push({ index: first + syllables.length, text, wordIndex: wi })));
  const n = syllables.length;
  const margin = 60;
  const colW = (width - 2 * margin) / n;
  const ink: Record<number, PxBox> = {};
  const neumes: Record<number, PxBox[]> = {};
  const truth: Record<number, PxBox> = {};
  syllables.forEach((s, j) => {
    const cx = Math.round(margin + j * colW);
    const count = 2 + Math.floor(rnd() * 2);
    const boxes: PxBox[] = [];
    let x = cx + Math.round(0.1 * colW);
    const limit = cx + 0.6 * colW;
    for (let k = 0; k < count; k++) {
      const y = 40 + Math.floor(rnd() * 50);
      const shape = SHAPES[Math.floor(rnd() * SHAPES.length)];
      const b = drawNeume(r, shape, x, y, u);
      boxes.push(b);
      x = b.x + b.w + 6 * u + Math.floor(rnd() * 4 * u);
      if (x + 4 * u > limit) break;
    }
    neumes[s.index] = boxes;
    ink[s.index] = unionBox(boxes);
    truth[s.index] = padBox(ink[s.index], Math.max(2, u));
    drawText(r, s.text, cx + Math.round(0.1 * colW), baseline, xh, opts.textU ?? u);
  });
  if (opts.stain) {
    const gx = Math.round(margin + 3 * colW - 0.2 * colW);
    fillRect(r, gx - 13, 70, 26, 26, STAIN);
  }
  if (opts.noise !== false) addNoise(r, (opts.seed ?? 7) + 1);
  return { raster: r, syllables, ink, neumes, truth, u, baseline, xHeight: xh };
}

export interface StaffSpec {
  x0: number;
  x1: number;
  yTop: number;
  lines: number;
  /** Distancia entre linhas d (branco). Espaco s = d + t. */
  d: number;
  t: number;
  tiltDeg?: number;
  /** Amplitude (px) de uma curvatura senoidal de meia onda. */
  bend?: number;
  color?: RGB;
}

/** Topo (primeira linha de pixels) da linha i em x. */
export function staffLineTop(spec: StaffSpec, i: number, x: number): number {
  const tilt = Math.tan(((spec.tiltDeg ?? 0) * Math.PI) / 180) * (x - spec.x0);
  const bend = (spec.bend ?? 0) * Math.sin((Math.PI * (x - spec.x0)) / Math.max(1, spec.x1 - spec.x0));
  return Math.round(spec.yTop + i * (spec.d + spec.t) + tilt + bend);
}

export function drawStaff(r: RasterRGBA, spec: StaffSpec): void {
  for (let i = 0; i < spec.lines; i++)
    for (let x = spec.x0; x < spec.x1; x++) {
      const y = staffLineTop(spec, i, x);
      for (let k = 0; k < spec.t; k++) setPixel(r, x, y + k, spec.color ?? INK);
    }
}

export interface DiastematicFixture extends LineFixture {
  staff: StaffSpec;
  clef: PxBox;
  custos: PxBox;
  bar: PxBox;
}

/**
 * Linha diastematica: pauta de 4 linhas (t = 2, d = 14, s = 16) de x = 40 a largura - 40, clave de do
 * no inicio, notas quadradas 12 x 12 sobre e entre as linhas (cruzando a pauta), barra de divisao
 * entre a 3a e a 4a silaba, custos no fim e texto 3,5s abaixo da ultima linha.
 * Verdade = x da tinta + max(2, u); y = [linha superior - 0,5s, linha inferior + 0,5s] uniao tinta + pad.
 */
export function buildDiastematicLine(opts: { seed?: number; red?: boolean; noise?: boolean; u?: number } = {}): DiastematicFixture {
  const width = 1400;
  const height = 240;
  const u = opts.u ?? 3;
  const rnd = mulberry32(opts.seed ?? 11);
  const r = createRaster(width, height);
  const staff: StaffSpec = { x0: 40, x1: width - 40, yTop: 60, lines: 4, d: 14, t: 2, color: opts.red ? RED_LINE : INK };
  drawStaff(r, staff);
  const s = staff.d + staff.t;
  const lineCenter = (i: number) => staff.yTop + i * s + (staff.t - 1) / 2;
  // clave de do: haste + dois quadrados, centrada na 2a linha
  const clef = unionBox([
    fillRect(r, 48, lineCenter(1) - 17, 4, 34),
    fillRect(r, 52, lineCenter(1) - 13, 10, 8),
    fillRect(r, 52, lineCenter(1) + 5, 10, 8),
  ]);
  const syllables: SuggestSyllable[] = ['Al', 'le', 'lu', 'ia'].map((text, i) => ({ index: i, text, wordIndex: 0 }));
  const cols = [140, 430, 720, 1010];
  const ink: Record<number, PxBox> = {};
  const neumes: Record<number, PxBox[]> = {};
  const truth: Record<number, PxBox> = {};
  const baseline = Math.round(lineCenter(3) + 3.5 * s);
  const xh = 14;
  syllables.forEach((syl, j) => {
    const boxes: PxBox[] = [];
    let x = cols[j];
    const count = 2 + Math.floor(rnd() * 2);
    for (let k = 0; k < count; k++) {
      // posicoes: sobre uma linha (cruza) ou num espaco (1 px de folga de cada lado)
      const onLine = rnd() < 0.5;
      const li = Math.floor(rnd() * 4);
      const y = onLine ? Math.round(lineCenter(li) - 6) : staff.yTop + Math.min(li, 2) * s + staff.t + 1;
      boxes.push(fillRect(r, x, y, 12, 12));
      x += 12 + 10 + Math.floor(rnd() * 8);
    }
    neumes[syl.index] = boxes;
    ink[syl.index] = unionBox(boxes);
    const pad = Math.max(2, u);
    const y0 = Math.min(lineCenter(0) - 0.5 * s, ink[syl.index].y - pad);
    const y1 = Math.max(lineCenter(3) + 0.5 * s, ink[syl.index].y + ink[syl.index].h + pad);
    truth[syl.index] = { x: ink[syl.index].x - pad, y: y0, w: ink[syl.index].w + 2 * pad, h: y1 - y0 };
    drawText(r, syl.text, cols[j], baseline, xh, u);
  });
  const bar = fillRect(r, 950, staff.yTop - 2, 3, 3 * s + staff.t + 4);
  const custos = unionBox([fillRect(r, width - 52, lineCenter(1) - 2, 6, 5), fillRect(r, width - 47, lineCenter(1) - 9, 2, 8)]);
  if (opts.noise !== false) addNoise(r, (opts.seed ?? 11) + 1);
  return { raster: r, syllables, ink, neumes, truth, u, baseline, xHeight: xh, staff, clef, custos, bar };
}
