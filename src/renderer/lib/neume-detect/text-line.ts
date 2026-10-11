// SPDX-License-Identifier: GPL-3.0-or-later
// Linha de texto (letras do texto liturgico) dentro da faixa de neumas, para descarta-las.
import type { PxBox } from './types';

export type Comp = PxBox & { area: number };

export interface TextLine {
  baseline: number;
  xHeight: number;
  /** Banda do texto [top, bottom] = [base - 2xh, base + 0,8xh]. */
  top: number;
  bottom: number;
}

function median(v: number[]): number {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Componentes acima da linha (fracao dos da linha) para ela ser texto e nao a fileira de neumas. */
export const TEXT_MIN_INK_ABOVE = 0.25;
/** Espaco minimo (em altura-x) entre o topo da area e o topo da linha: onde ficam os neumas. */
export const TEXT_MIN_ROOM_ABOVE = 1.5;

/**
 * 'lowest': o pico mais baixo. `inkAbove`: so aceita a linha com tinta (neumas) acima dela (ver
 * TEXT_MIN_INK_ABOVE); a medida de u nao o usa (caneta do texto mais grossa infla a tinta da linha).
 */
export type TextPreference = { kind: 'lowest'; inkAbove?: boolean } | { kind: 'below'; y: number };

/**
 * Histograma das bases (y + h) ponderado por area, suavizado (janela 0,5 x altura mediana). Cada pico
 * qualifica se tem >= 3 componentes de altura semelhante (+-40% da mediana do pico) cobrindo >= 30%
 * da largura, altura-x >= minXHeight (descarta tocos e ruido) e espacamento de letra (>= 40% dos
 * vaos entre vizinhos <= 0,6xh, com as letras de haste; neumas alinhados por acaso sao esparsos). Preferencia: o pico mais baixo (modo A) ou o primeiro abaixo de y (modo D).
 */
export function findTextLine(
  comps: Comp[],
  bandWidth: number,
  pref: TextPreference,
  minXHeight = 0,
  inner?: { y0: number; y1: number },
): TextLine | null {
  if (comps.length < 3) return null;
  const medH = median(comps.map((c) => c.h));
  let maxBase = 0;
  for (const c of comps) maxBase = Math.max(maxBase, c.y + c.h);
  const hist = new Float64Array(maxBase + 2);
  for (const c of comps) hist[c.y + c.h] += c.area;
  const r = Math.max(1, Math.round(0.25 * medH));
  const sm = new Float64Array(hist.length);
  for (let i = 0; i < hist.length; i++) {
    let s = 0;
    for (let k = Math.max(0, i - r); k <= Math.min(hist.length - 1, i + r); k++) s += hist[k];
    sm[i] = s;
  }
  const tol = Math.max(2, 0.25 * medH);
  const candidates: { y: number; line: TextLine }[] = [];
  for (let i = 0; i < sm.length; i++) {
    if (sm[i] <= 0) continue;
    if (i > 0 && sm[i - 1] >= sm[i]) continue;
    // plato de maximos: o pico fica no centro do plato
    let e = i;
    while (e + 1 < sm.length && sm[e + 1] === sm[i]) e++;
    if (e + 1 < sm.length && sm[e + 1] > sm[i]) continue;
    const peak = (i + e) / 2;
    const members = comps.filter((c) => Math.abs(c.y + c.h - peak) <= tol);
    if (members.length < 3) continue;
    const hm = median(members.map((c) => c.h));
    const similar = members.filter((c) => Math.abs(c.h - hm) <= 0.4 * hm);
    if (similar.length < 3) continue;
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const c of similar) {
      x0 = Math.min(x0, c.x);
      x1 = Math.max(x1, c.x + c.w);
    }
    if ((x1 - x0) / bandWidth < 0.3) continue;
    const xh = median(similar.map((c) => c.h));
    if (xh < minXHeight) continue;
    // espacamento de letra: >= 40% dos vaos entre vizinhos semelhantes sao <= 0,6xh (neumas sao esparsos)
    // vizinhos entre as letras plausiveis (0,6 a 2,2 xh): as de haste (b d l t, maiusculas) contam como
    // vizinhas; so as semelhantes deixariam um buraco em cada haste e palavras curtas nao passariam
    const byX = members.filter((c) => c.h >= 0.6 * xh && c.h <= 2.2 * xh).sort((a, b) => a.x - b.x);
    let tight = 0;
    for (let k = 0; k + 1 < byX.length; k++) if (byX[k + 1].x - (byX[k].x + byX[k].w) <= 0.6 * xh) tight++;
    if (tight < 0.4 * (byX.length - 1)) continue;
    const baseline = median(similar.map((c) => c.y + c.h));
    if (pref.kind === 'lowest') {
      // Os neumas ficam sempre acima do texto. Mais tinta abaixo da linha do que nela (margem inclusa):
      // a linha mais baixa nao e esta (fileira de neumas sobre outra). Acima so conta o que esta na
      // area desenhada (a margem de cima e contexto). Com `inkAbove`, a linha tambem precisa de neumas acima: espaco de ao
      // menos TEXT_MIN_ROOM_ABOVE·xh entre o topo da area e o da linha, e componentes acima em numero
      // >= TEXT_MIN_INK_ABOVE x os da linha; senao e a propria fileira de neumas (grupos de tracos
      // curtos parecem letras). Conta componentes, nao area: a caneta do texto e mais pesada (texto
      // real medido com area acima de 0,14x a da linha).
      const bottom = baseline + 0.8 * xh;
      const top = baseline - xh;
      const set = new Set(members);
      let below = 0;
      let own = 0;
      let nAbove = 0;
      for (const c of comps) {
        if (set.has(c)) {
          own += c.area;
          continue;
        }
        const cy = c.y + c.h / 2;
        if (cy > bottom) below += c.area;
        else if (cy < top && !(inner && cy < inner.y0)) nAbove++;
      }
      if (below > own) continue;
      if (pref.inkAbove) {
        const room = top - (inner ? inner.y0 : 0);
        if (room < TEXT_MIN_ROOM_ABOVE * xh || nAbove < TEXT_MIN_INK_ABOVE * members.length) continue;
      }
    }
    candidates.push({ y: baseline, line: { baseline, xHeight: xh, top: baseline - 2 * xh, bottom: baseline + 0.8 * xh } });
  }
  if (candidates.length === 0) return null;
  if (pref.kind === 'lowest') return candidates.reduce((a, b) => (b.y > a.y ? b : a)).line;
  const below = candidates.filter((c) => c.y > pref.y).sort((a, b) => a.y - b.y);
  return below.length ? below[0].line : null;
}

/**
 * Componente e texto se o centro esta na banda E a altura esta em [0,6xh; 2,2xh] E (a base esta a
 * +-0,25xh da linha de base OU o topo esta a +-0,25xh da altura-x e a base desce abaixo dela, caso
 * das descendentes g p q y). Os dois criterios juntos preservam neumas que descem ate as ascendentes.
 */
export function isTextComponent(c: PxBox, tl: TextLine): boolean {
  const cy = c.y + c.h / 2;
  if (cy < tl.top || cy > tl.bottom) return false;
  if (c.h < 0.6 * tl.xHeight || c.h > 2.2 * tl.xHeight) return false;
  const base = c.y + c.h;
  const tol = 0.25 * tl.xHeight;
  if (Math.abs(base - tl.baseline) <= tol) return true;
  return base > tl.baseline && Math.abs(c.y - (tl.baseline - tl.xHeight)) <= tol;
}

/** Ruido do texto: pontos de i, pontuacao (lado maior < 0,6xh inteiramente dentro da banda). */
export function isTextDebris(c: PxBox, tl: TextLine): boolean {
  return c.y >= tl.top && c.y + c.h <= tl.bottom && Math.max(c.w, c.h) < 0.6 * tl.xHeight;
}

/**
 * Faixas x de W palavras: os W - 1 maiores vaos entre componentes de texto consecutivos (ordem x),
 * desde que coerentes (o W-esimo maior vao < 0,6 x o (W-1)-esimo). null se incoerente ou sem texto.
 */
export function wordSpans(text: PxBox[], words: number): { x0: number; x1: number }[] | null {
  if (words <= 0 || text.length < words) return null;
  const s = [...text].sort((a, b) => a.x - b.x || a.y - b.y);
  if (words === 1) return [{ x0: s[0].x, x1: Math.max(...s.map((c) => c.x + c.w)) }];
  const gaps: { i: number; g: number }[] = [];
  let reach = s[0].x + s[0].w;
  for (let i = 0; i + 1 < s.length; i++) {
    reach = Math.max(reach, s[i].x + s[i].w);
    gaps.push({ i, g: s[i + 1].x - reach });
  }
  const sorted = [...gaps].sort((a, b) => b.g - a.g || a.i - b.i);
  const chosen = sorted.slice(0, words - 1);
  if (chosen[chosen.length - 1].g <= 0) return null;
  if (sorted.length >= words && sorted[words - 1].g >= 0.6 * sorted[words - 2].g) return null;
  const cuts = chosen.map((c) => c.i).sort((a, b) => a - b);
  const spans: { x0: number; x1: number }[] = [];
  let start = 0;
  for (const cut of [...cuts, s.length - 1]) {
    let x1 = -Infinity;
    for (let k = start; k <= cut; k++) x1 = Math.max(x1, s[k].x + s[k].w);
    spans.push({ x0: s[start].x, x1 });
    start = cut + 1;
  }
  return spans;
}
