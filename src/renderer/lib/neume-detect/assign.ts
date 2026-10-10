// SPDX-License-Identifier: GPL-3.0-or-later
// Atribuicao de glifos as silabas: segmentos entre ancoras e particao por programacao dinamica.
import type { PxBox, SuggestSyllable } from './types';

export type Glyph = PxBox & { area: number };

export const LAMBDA = 0.5;
export const EMPTY_COST = 3;
export const BAR_BONUS = 2;
export const WORD_BONUS = 1;
/** Vao (em multiplos do vao mediano) que separa agrupamentos de glifos quando nao ha texto. */
export const CLUSTER_CUT = 2;
/** Minimo de componentes de texto para medir a area em letras. */
export const MIN_TEXT_COMPONENTS = 3;

export interface Segment {
  /** Limites x [L, R] em px de trabalho. */
  L: number;
  R: number;
  syllables: SuggestSyllable[];
  /** Ordenados por centro x. */
  glyphs: Glyph[];
}

const cx = (b: PxBox) => b.x + b.w / 2;

/** Fracao da area de b dentro de a. */
export function overlapFraction(b: PxBox, a: PxBox): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return b.w * b.h > 0 ? (ix * iy) / (b.w * b.h) : 0;
}

/**
 * Divide a linha em segmentos independentes pelas ancoras (silabas com caixa). Silabas entre duas
 * ancoras consecutivas (na ordem de `syllables`) formam um segmento com L = borda direita da ancora
 * anterior (ou x0) e R = borda esquerda da seguinte (ou x1). Glifos >= 50% dentro de uma ancora sao
 * descartados; os demais vao para o segmento que contem o centro x.
 * Segmentos sem silabas sao omitidos.
 */
export function segmentByAnchors(
  syllables: SuggestSyllable[],
  anchors: { index: number; box: PxBox }[],
  glyphs: Glyph[],
  x0: number,
  x1: number,
): Segment[] {
  const anchorBy = new Map(anchors.map((a) => [a.index, a.box]));
  const free = glyphs.filter((g) => !anchors.some((a) => overlapFraction(g, a.box) >= 0.5));
  const segments: Segment[] = [];
  let L = x0;
  let cur: SuggestSyllable[] = [];
  const close = (R: number) => {
    if (cur.length) {
      const glyphsIn = free.filter((g) => cx(g) >= L && cx(g) <= R).sort((a, b) => cx(a) - cx(b) || a.y - b.y);
      segments.push({ L, R, syllables: cur, glyphs: glyphsIn });
    }
    cur = [];
  };
  for (const s of syllables) {
    const box = anchorBy.get(s.index);
    if (box) {
      close(box.x);
      L = box.x + box.w;
    } else cur.push(s);
  }
  close(x1);
  return segments;
}

/** Comprimento em letras (minimo 1). */
export function letters(s: SuggestSyllable): number {
  return Math.max(1, s.text.replace(/[^\p{L}]/gu, '').length);
}

/**
 * Centro esperado de cada silaba. Com faixas de palavra (mesmo numero de palavras do segmento):
 * proporcional as letras dentro da faixa da palavra. Sem: proporcional ao comprimento acumulado em
 * letras no segmento, +1 por fronteira de palavra.
 */
export function expectedCenters(seg: Segment, spans: { x0: number; x1: number }[] | null): number[] {
  const sy = seg.syllables;
  const wordOrder: number[] = [];
  for (const s of sy) if (wordOrder[wordOrder.length - 1] !== s.wordIndex) wordOrder.push(s.wordIndex);
  if (spans && spans.length === wordOrder.length) {
    return sy.map((s, j) => {
      const w = wordOrder.indexOf(s.wordIndex);
      let before = 0;
      let total = 0;
      sy.forEach((o, k) => {
        if (o.wordIndex !== s.wordIndex) return;
        if (k < j) before += letters(o);
        total += letters(o);
      });
      const sp = spans[w];
      return sp.x0 + ((before + letters(s) / 2) / total) * (sp.x1 - sp.x0);
    });
  }
  const pos: number[] = [];
  let acc = 0;
  sy.forEach((s, j) => {
    if (j > 0 && s.wordIndex !== sy[j - 1].wordIndex) acc += 1;
    pos.push(acc + letters(s) / 2);
    acc += letters(s);
  });
  return pos.map((p) => seg.L + (p / acc) * (seg.R - seg.L));
}

/**
 * Pontuacao de corte entre glifos i e i+1: vao / mediana dos vaos (minimo 1 px), +2 se ha barra de
 * divisao no vao, +1 se ha espaco entre palavras no vao. "No vao" = x em (cx_i, cx_{i+1}].
 */
export function cutScores(glyphs: Glyph[], barXs: number[], wordGapXs: number[]): Float64Array {
  const m = glyphs.length;
  const gaps = new Float64Array(Math.max(0, m - 1));
  let reach = -Infinity;
  for (let i = 0; i + 1 < m; i++) {
    reach = Math.max(reach, glyphs[i].x + glyphs[i].w);
    gaps[i] = Math.max(0, glyphs[i + 1].x - reach);
  }
  const sorted = Array.from(gaps).sort((a, b) => a - b);
  const med = Math.max(1, sorted.length ? sorted[sorted.length >> 1] : 1);
  const out = new Float64Array(gaps.length);
  for (let i = 0; i < gaps.length; i++) {
    const a = cx(glyphs[i]);
    const b = cx(glyphs[i + 1]);
    out[i] = gaps[i] / med;
    if (barXs.some((x) => x > a && x <= b)) out[i] += BAR_BONUS;
    if (wordGapXs.some((x) => x > a && x <= b)) out[i] += WORD_BONUS;
  }
  return out;
}

export interface Partition {
  /** groups[j] = [a, b) em glyphs, ou null (grupo vazio). */
  groups: ([number, number] | null)[];
  /** Custo de posicao de cada grupo (0 para vazios). */
  positionCost: number[];
  score: number;
}

/**
 * Particao dos M glifos (ordem x) em K grupos contiguos, possivelmente vazios, maximizando
 * soma(cortes usados) - soma(lambda * |centro_j - e_j| / ((R - L) / K)) - 3 x vazios. O(K * M^2).
 */
export function partitionDP(glyphs: Glyph[], expected: number[], L: number, R: number, cuts: Float64Array): Partition {
  const K = expected.length;
  const M = glyphs.length;
  const unit = Math.max(1, (R - L) / Math.max(1, K));
  const NEG = -Infinity;
  const f: Float64Array[] = [];
  const choice: Int32Array[] = [];
  for (let j = 0; j <= K; j++) {
    f.push(new Float64Array(M + 1).fill(NEG));
    choice.push(new Int32Array(M + 1).fill(-2));
  }
  f[0][0] = 0;
  for (let j = 1; j <= K; j++) {
    const e = expected[j - 1];
    for (let m = 0; m <= M; m++) {
      let best = f[j - 1][m] === NEG ? NEG : f[j - 1][m] - EMPTY_COST;
      let arg = best === NEG ? -2 : -1;
      let minX = Infinity;
      let maxX = -Infinity;
      for (let a = m - 1; a >= 0; a--) {
        minX = Math.min(minX, glyphs[a].x);
        maxX = Math.max(maxX, glyphs[a].x + glyphs[a].w);
        const prev = f[j - 1][a];
        if (prev === NEG) continue;
        const cost = (LAMBDA * Math.abs((minX + maxX) / 2 - e)) / unit;
        const v = prev + (a > 0 ? cuts[a - 1] : 0) - cost;
        if (v > best) {
          best = v;
          arg = a;
        }
      }
      f[j][m] = best;
      choice[j][m] = arg;
    }
  }
  const groups: ([number, number] | null)[] = new Array(K).fill(null);
  const positionCost: number[] = new Array(K).fill(0);
  let m = M;
  for (let j = K; j >= 1; j--) {
    const a = choice[j][m];
    if (a === -1 || a === -2) continue;
    groups[j - 1] = [a, m];
    let minX = Infinity;
    let maxX = -Infinity;
    for (let k = a; k < m; k++) {
      minX = Math.min(minX, glyphs[k].x);
      maxX = Math.max(maxX, glyphs[k].x + glyphs[k].w);
    }
    positionCost[j - 1] = (LAMBDA * Math.abs((minX + maxX) / 2 - expected[j - 1])) / unit;
    m = a;
  }
  return { groups, positionCost, score: f[K][M] };
}

/**
 * Confianca de cada grupo: media das forcas dos dois cortes que o delimitam (borda do segmento = 1;
 * corte c vira c / (1 + c)) menos o custo de posicao, cortada a [0, 1]. Vazio = 0.
 */
export function groupConfidence(p: Partition, cuts: Float64Array, M: number): number[] {
  return p.groups.map((g, j) => {
    if (!g) return 0;
    const [a, b] = g;
    const left = a === 0 ? 1 : cuts[a - 1] / (1 + cuts[a - 1]);
    const right = b === M ? 1 : cuts[b - 1] / (1 + cuts[b - 1]);
    return Math.max(0, Math.min(1, (left + right) / 2 - p.positionCost[j]));
  });
}

/**
 * Quantas silabas da fila cabem na area. Com texto (>= MIN_TEXT_COMPONENTS componentes): a
 * quantidade cujo total de letras mais se aproxima da largura do texto medida em letras (soma das
 * larguras / largura mediana; independe dos vaos, que esticam com os melismas). Sem texto: um por
 * agrupamento de glifos (vao >= CLUSTER_CUT x o mediano). Nunca mais que os glifos nem que a fila.
 */
export function fitCount(queue: SuggestSyllable[], glyphs: Glyph[], text: PxBox[]): number {
  const maxN = Math.min(queue.length, glyphs.length);
  if (maxN === 0) return 0;
  if (text.length >= MIN_TEXT_COMPONENTS) {
    const ws = text.map((c) => c.w).sort((a, b) => a - b);
    const wMed = Math.max(1, ws[ws.length >> 1]);
    const units = ws.reduce((s, w) => s + w, 0) / wMed;
    let best = 1;
    let bestD = Infinity;
    let acc = 0;
    for (let n = 1; n <= maxN; n++) {
      acc += letters(queue[n - 1]);
      const d = Math.abs(acc - units);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
      if (acc - units > bestD) break;
    }
    return best;
  }
  const sorted = [...glyphs].sort((a, b) => cx(a) - cx(b));
  const cuts = cutScores(sorted, [], []);
  let clusters = 1;
  for (const c of cuts) if (c >= CLUSTER_CUT) clusters++;
  return Math.min(maxN, clusters);
}
