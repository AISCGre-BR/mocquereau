// SPDX-License-Identifier: GPL-3.0-or-later
// Escolha da faixa de neumas (spec, etapa 2) e conversoes de coordenadas fracao <-> px.
import type { BandSource, FracRect, PxBox, SuggestInput } from './types';

const EPS = 1e-6;
/** floor/ceil tolerantes a erro de ponto flutuante (0,6 * 1000 = 600,0000000000001). */
export const floorPx = (v: number): number => Math.floor(v + EPS);
export const ceilPx = (v: number): number => Math.ceil(v - EPS);

/** Fracao -> px inteiros, arredondando para fora e cortando ao raster. */
export function fracToPxRect(f: FracRect, width: number, height: number): PxBox {
  const x0 = Math.max(0, floorPx(f.x * width));
  const y0 = Math.max(0, floorPx(f.y * height));
  const x1 = Math.min(width, ceilPx((f.x + f.w) * width));
  const y1 = Math.min(height, ceilPx((f.y + f.h) * height));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** Expande verticalmente por `by` px de cada lado, cortado a [0, height). */
export function expandY(b: PxBox, by: number, height: number): PxBox {
  const y0 = Math.max(0, floorPx(b.y - by));
  const y1 = Math.min(height, ceilPx(b.y + b.h + by));
  return { x: b.x, y: y0, w: b.w, h: Math.max(0, y1 - y0) };
}

export const LINE_ASPECT = 3;
export const BAND_MARGIN = 0.1;

/**
 * Prioridade: faixa do usuario; ancoras (num recorte de linha, a imagem inteira; num folio, a uniao
 * vertical das ancoras +50% da altura mediana para cada lado);
 * modo D: imagem inteira para buscar a pauta ('staff', confirmado ou rebaixado pelo pipeline);
 * recorte de linha (largura/altura >= 3): imagem inteira; senao 'none' (pedir a faixa).
 * Faixas do usuario e das ancoras recebem margem vertical de 10% da propria altura; `inner` e a faixa
 * sem a margem (so a tinta centrada nela conta; a margem e contexto).
 */
export function selectBand(
  input: Pick<SuggestInput, 'band' | 'anchors' | 'notation'>,
  width: number,
  height: number,
): { source: BandSource; rect: PxBox; inner?: PxBox } {
  const whole = { x: 0, y: 0, w: width, h: height };
  if (input.band) {
    const b = fracToPxRect(input.band, width, height);
    if (b.w > 0 && b.h > 0) return { source: 'user', rect: expandY(b, BAND_MARGIN * b.h, height), inner: b };
  }
  const anchors = (input.anchors ?? []).map((a) => fracToPxRect(a.box, width, height)).filter((b) => b.w > 0 && b.h > 0);
  if (anchors.length) {
    // recorte de linha: a faixa vertical das ancoras cortaria neumas mais altos ou mais baixos
    if (width / height >= LINE_ASPECT) return { source: 'anchors', rect: whole };
    const hs = anchors.map((a) => a.h).sort((p, q) => p - q);
    const medH = hs[hs.length >> 1];
    const y0 = Math.min(...anchors.map((a) => a.y));
    const y1 = Math.max(...anchors.map((a) => a.y + a.h));
    const v = expandY({ x: 0, y: y0, w: width, h: y1 - y0 }, 0.5 * medH, height);
    return { source: 'anchors', rect: expandY(v, BAND_MARGIN * v.h, height), inner: v };
  }
  if (input.notation === 'diastematic') return { source: 'staff', rect: whole };
  return lineOrNone(width, height);
}

export function lineOrNone(width: number, height: number): { source: BandSource; rect: PxBox } {
  const whole = { x: 0, y: 0, w: width, h: height };
  return width / height >= LINE_ASPECT ? { source: 'image', rect: whole } : { source: 'none', rect: whole };
}
