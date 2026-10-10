// SPDX-License-Identifier: GPL-3.0-or-later
// Contem codigo portado de Othmar neo (othmar/candidates.py, AGPL-3.0-or-later), de autoria
// exclusiva de Gabriel Honorato Teixeira Bernardo, relicenciado pelo autor sob GPL-3.0-or-later.
// Ver NOTICE.
// suggestBoxes: pipeline puro, sincrono e deterministico (spec, etapas 0 a 6).
// Fluxo base: find_candidates() de othmar/candidates.py.
import { groupConfidence, cutScores, expectedCenters, fitDetail, overlapFraction, partitionDP, type Glyph } from './assign';
import { ceilPx, floorPx, fracToPxRect, lineOrNone, selectBand } from './band';
import { dropIsolatedSpecks, filterComponents, labelComponents, labelsTouching, type Component } from './components';
import {
  cropGray,
  cropMask,
  bestContrastChannel,
  inkContrasts,
  pickInkChannel,
  prepareWork,
  rednessInk,
  upscale2xGray,
  upscale2xMask,
} from './image';
import { darkBlobs } from './mask';
import { mergeBoxesIndexed } from './merge';
import { deriveParams, estimateStrokeWidth, staffMetrics, strokeWidthOutside, type Params, type StaffMetrics } from './scale';
import {
  classifySpecialGlyphs,
  cropStaff,
  findStavesRobust,
  isFallbackStaff,
  isStaffResidue,
  isBarLine,
  removeStaffLines,
  staffBottom,
  staffCoverage,
  staffSpanAt,
  staffTop,
  type Staff,
} from './staff';
import { binarizeOtsu, sauvola } from './threshold';
import { findTextLine, isTextComponent, isTextDebris, wordSpans, type TextLine } from './text-line';
import type {
  BandDebug,
  BandSource,
  Candidate,
  ChannelName,
  FracRect,
  GrayImage,
  Mask,
  PxBox,
  StaffDebug,
  SuggestAnchor,
  SuggestDebug,
  SuggestInput,
  SuggestResult,
  SuggestSyllable,
  Suggestion,
} from './types';

export const MAX_LONG_SIDE = 2400;
export const MIN_CONFIDENCE = 0.2;
const RED_COVERAGE = 0.3;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

interface Work {
  r: GrayImage;
  g: GrayImage;
  b: GrayImage;
  gray: GrayImage;
  valid: Mask;
  /** px do raster = ox + x / sx, oy + y / sy (sx e sy diferem levemente por arredondamento) */
  ox: number;
  oy: number;
  sx: number;
  sy: number;
}

function cropWork(w: Work, box: PxBox): Work {
  return {
    r: cropGray(w.r, box),
    g: cropGray(w.g, box),
    b: cropGray(w.b, box),
    gray: cropGray(w.gray, box),
    valid: cropMask(w.valid, box),
    ox: w.ox + box.x / w.sx,
    oy: w.oy + box.y / w.sy,
    sx: w.sx,
    sy: w.sy,
  };
}

function validate(input: SuggestInput): void {
  const { image } = input;
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width <= 0 || image.height <= 0)
    throw new Error('neume-detect: invalid raster size');
  if (image.data.length !== image.width * image.height * 4)
    throw new Error('neume-detect: raster data length must be width * height * 4');
}

function emptyDebug(): SuggestDebug {
  return {
    mode: 'A',
    bandSource: 'none',
    band: null,
    scale: 1,
    strokeWidth: 0,
    channel: 'r',
    sauvolaK: 0.2,
    counts: { components: 0, text: 0, glyphs: 0, bars: 0, ignored: 0 },
    needsBand: false,
    ms: {},
  };
}

interface InkStage {
  comps: Component[];
  bars: Component[];
  channel: ChannelName;
  k: number;
  red: boolean;
}

/**
 * Alcance (em u) que salva um ponto de ate u^2 de ser descartado como mancha do pergaminho: ha um
 * componente maior a ate 6u (vaos internos de um grupo de neumas). Escolhido pelo eval (2u a 6u).
 */
const SPECK_REACH = 6;

/** Etapas 1 e 3: binarizacao, manchas, remocao da pauta, rotulagem, barras, filtros, pontos isolados. */
function inkStage(
  work: Work,
  p: Params,
  staff: Staff | null,
  channel: ChannelName,
  k: number,
  blobs: Mask = darkBlobs(work.gray, work.valid, p),
): InkStage {
  const name = channel;
  let ink = sauvola(work[channel], p.window, k, 128, work.valid);
  let red = false;
  if (staff) {
    if (staffCoverage(ink, staff) < RED_COVERAGE) red = true;
    else ink = removeStaffLines(ink, staff);
  }
  const lab = labelComponents(ink);
  const reject = labelsTouching(lab, blobs);
  const bars: Component[] = [];
  if (staff)
    for (const c of lab.components) if (!reject.has(c.label) && isBarLine(c, staff, p.u)) {
      bars.push(c);
      reject.add(c.label);
    }
  const comps = dropIsolatedSpecks(filterComponents(lab, p, reject), p.u, SPECK_REACH * p.u);
  return { comps, bars, channel: name, k, red };
}

/** Pauta cuja extensao vertical contem (ou, senao, esta mais perto de) a mediana dos centros das ancoras. */
function pickStaffByAnchors(staves: Staff[], boxes: PxBox[]): Staff | null {
  if (!boxes.length) return null;
  const ys = boxes.map((b) => b.y + b.h / 2).sort((p, q) => p - q);
  const my = ys[ys.length >> 1];
  let best: Staff | null = null;
  let bestD = Infinity;
  for (const st of staves) {
    const top = staffTop(st) - st.metrics.s;
    const bottom = staffBottom(st) + st.metrics.s;
    const d = my >= top && my <= bottom ? 0 : Math.min(Math.abs(my - top), Math.abs(my - bottom));
    if (d < bestD) {
      bestD = d;
      best = st;
    }
  }
  return best;
}

type Lap = (name: string) => void;

interface SelectedBand {
  source: BandSource;
  rect: PxBox;
  /** Area desenhada sem a margem de contexto, em px do raster. */
  inner?: PxBox;
}

/** Resultado das etapas 0 a 5 numa faixa: tudo em px do raster de trabalho dessa faixa. */
interface BandAnalysis {
  band: SelectedBand;
  work: Work;
  staff: Staff | null;
  /** Outras pautas achadas no mesmo raster de trabalho (limitam a altura das caixas). */
  otherStaves: Staff[];
  metrics: StaffMetrics | null;
  tl: TextLine | null;
  u: number;
  glyphs: Glyph[];
  text: Component[];
  bars: Component[];
  red: boolean;
}

/** px do raster -> px do raster de trabalho. */
function rasterToWork(b: PxBox, work: Work): PxBox {
  return { x: (b.x - work.ox) * work.sx, y: (b.y - work.oy) * work.sy, w: b.w * work.sx, h: b.h * work.sy };
}

/** Fracao do raster -> px do raster de trabalho. */
function fracToWork(b: FracRect, work: Work, W: number, H: number): PxBox {
  const px = fracToPxRect(b, W, H);
  return {
    x: (px.x - work.ox) * work.sx,
    y: (px.y - work.oy) * work.sy,
    w: px.w * work.sx,
    h: px.h * work.sy,
  };
}

/** Extensao do raster de trabalho, em fracoes do raster. */
function workFrac(work: Work, W: number, H: number): FracRect {
  return {
    x: work.ox / W,
    y: work.oy / H,
    w: work.r.width / work.sx / W,
    h: work.r.height / work.sy / H,
  };
}

/** Fracao minima de preenchimento da caixa para uma nota quadrada cheia. */
const SOLID_FILL = 0.85;
/** Sem as notas cheias, sobra ao menos esta fracao da tinta para a medida valer. */
const SOLID_MIN_RESIDUAL = 0.1;
// SOLID_FILL, SOLID_MIN_RESIDUAL e o fator 2x de withoutSolidNotes foram escolhidos nas fixtures
// sinteticas da Task 5 (notas 12x12 sem pauta, pontos soltos, resto sem medida, pauta com pontos
// grossos); no eval dos 3 projetos do usuario nao mudaram nenhum numero.

/**
 * Notacao quadrada: notas cheias (quase quadradas, preenchidas, lado >= 4 px) nao sao traco; cada
 * pixel conta com o lado da nota e, sem pauta nem texto suficientes, a moda vira o tamanho da nota.
 * Devolve a mascara sem elas, ou a propria mascara se nao houver nenhuma, se sobrar menos de
 * SOLID_MIN_RESIDUAL da tinta (um resto minusculo, como pontos soltos, nao mede o traco nem deve
 * levar a ampliacao 2x), se o resto nao tiver medida, ou se a medida da mascara inteira nao for ao
 * menos 2x a do resto (so corrige quando as notas cheias claramente dominam a moda).
 */
function withoutSolidNotes(ink: Mask): Mask {
  const lab = labelComponents(ink);
  const solid = new Set<number>();
  let solidArea = 0;
  let total = 0;
  for (const c of lab.components) {
    total += c.area;
    const lo = Math.min(c.w, c.h);
    const hi = Math.max(c.w, c.h);
    if (lo >= 4 && hi <= 2 * lo && c.area >= SOLID_FILL * c.w * c.h) {
      solid.add(c.label);
      solidArea += c.area;
    }
  }
  if (!solid.size || total - solidArea < SOLID_MIN_RESIDUAL * total) return ink;
  const data = ink.data.slice();
  for (let i = 0; i < data.length; i++) if (data[i] && solid.has(lab.labels[i])) data[i] = 0;
  const rest = { data, width: ink.width, height: ink.height };
  const uRest = estimateStrokeWidth(rest);
  const uAll = estimateStrokeWidth(ink);
  if (uRest === 0 || uAll < 2 * uRest) return ink;
  return rest;
}

/**
 * Espessura do traco medida fora da linha de texto: a caneta do texto costuma ser mais grossa que a
 * dos neumas e, com mais pixels, domina a moda (M4a). Sem linha de texto, ou se nada sobra fora dela,
 * fica a medida da faixa inteira; a medida de fora so e aceita se for menor. Na notacao quadrada
 * as notas cheias ficam fora da medida (`withoutSolidNotes`). `inner` (px de trabalho) = area
 * desenhada: as faixas da margem acima e abaixo tambem ficam fora (M4d).
 */
export function measureU(grayInk: Mask, notation: SuggestInput['notation'], inner?: PxBox): number {
  const ink = notation === 'diastematic' ? withoutSolidNotes(grayInk) : grayInk;
  const u0 = estimateStrokeWidth(ink);
  if (u0 === 0) return 0;
  // margem de contexto acima e abaixo da area desenhada (meias-letras, caneta do texto): fora da medida
  const margins = inner
    ? [
        { y0: 0, y1: inner.y },
        { y0: inner.y + inner.h, y1: ink.height },
      ]
    : [];
  const comps = labelComponents(ink).components.filter((c) => c.area >= 4);
  const tl = findTextLine(comps, ink.width, { kind: 'lowest' });
  if (!tl) {
    const um = margins.length ? strokeWidthOutside(ink, margins) : 0;
    return um > 0 ? Math.min(um, u0) : u0;
  }
  const u1 = strokeWidthOutside(ink, [{ y0: tl.top, y1: tl.bottom }, ...margins]);
  // So para baixo: fora do texto pode sobrar uma mancha cheia (run ~ seu tamanho) que domina a moda.
  return u1 > 0 ? Math.min(u1, u0) : u0;
}

/**
 * Etapa 0: raster de trabalho (recorte, reducao a MAX_LONG_SIDE, ampliacao 2x se u < 2) e espessura
 * de traco. Unico ponto de preparacao do raster de trabalho de uma faixa.
 */
function buildWork(
  image: SuggestInput['image'],
  rect: PxBox,
  notation: SuggestInput['notation'],
  inner?: PxBox,
): { work: Work; grayInk: Mask; u: number; up: number } {
  const scale = Math.min(1, MAX_LONG_SIDE / Math.max(rect.w, rect.h));
  let work: Work = { ...prepareWork(image, rect, scale), ox: rect.x, oy: rect.y, sx: 1, sy: 1 };
  work.sx = work.r.width / rect.w;
  work.sy = work.r.height / rect.h;
  let grayInk = binarizeOtsu(work.gray, work.valid);
  let u = measureU(grayInk, notation, inner && rasterToWork(inner, work));
  let up = 1;
  if (u > 0 && u < 2) {
    up = 2;
    work = {
      r: upscale2xGray(work.r),
      g: upscale2xGray(work.g),
      b: upscale2xGray(work.b),
      gray: upscale2xGray(work.gray),
      valid: upscale2xMask(work.valid),
      ox: work.ox,
      oy: work.oy,
      sx: work.sx * 2,
      sy: work.sy * 2,
    };
    grayInk = binarizeOtsu(work.gray, work.valid);
    u = measureU(grayInk, notation, inner && rasterToWork(inner, work));
  }
  return { work, grayInk, u, up };
}

/**
 * Etapas 0 a 5 numa faixa: raster de trabalho, pauta, tinta, linha de texto, glifos. Escreve em
 * `debug` o mesmo que o fluxo de uma faixa sempre escreveu. null = faixa sem tinta (u = 0).
 */
function analyzeBand(
  input: SuggestInput,
  selected: SelectedBand,
  anchors: SuggestAnchor[],
  needed: number,
  debug: SuggestDebug,
  lap: Lap,
): BandAnalysis | { needsBand: true } | null {
  const W = input.image.width;
  const H = input.image.height;
  let band = selected;
  const prep = buildWork(input.image, band.rect, input.notation, band.inner);
  let work = prep.work;
  const { grayInk } = prep;
  let u = prep.u;
  debug.scale = work.sx;
  lap('prepare');
  if (u === 0) {
    debug.bandSource = band.source;
    return null;
  }

  // Etapa 3: pauta
  let staff: Staff | null = null;
  let metrics: StaffMetrics | null = null;
  let fromRed = false;
  let otherStaves: Staff[] = [];
  if (input.notation === 'diastematic') {
    const anchorBoxes = () => anchors.map((a) => fracToWork(a.box, work, W, H));
    metrics = staffMetrics(grayInk);
    let staves = metrics ? findStavesRobust(grayInk, metrics) : [];
    if (!staves.length) {
      // pauta vermelha clara que some no cinza binarizado: terceira tentativa no mapa r - g
      const redInk = binarizeOtsu(rednessInk(work.r, work.g), work.valid);
      const m2 = staffMetrics(redInk);
      // so linhas longas: rubricas (letras vermelhas grandes) tambem tem tracos horizontais alinhados
      const s2 = (m2 ? findStavesRobust(redInk, m2) : []).filter((st) => isFallbackStaff(redInk, st));
      if (s2.length) {
        metrics = m2;
        staves = s2;
        fromRed = true;
      }
    }
    if (staves.length > 1 && band.source === 'staff') {
      // varias pautas e nada indica qual: pedir a faixa em vez de chutar a primeira
      const picked = anchors.length ? pickStaffByAnchors(staves, anchorBoxes()) : null;
      if (!picked) {
        debug.needsBand = true;
        debug.bandSource = band.source;
        return { needsBand: true };
      }
      staff = picked;
    } else if (staves.length > 1 && anchors.length) {
      staff = pickStaffByAnchors(staves, anchorBoxes()) ?? staves[0];
    } else staff = staves[0] ?? null;
    otherStaves = staff ? staves.filter((o) => o !== staff) : [];
    if (staff && metrics && band.source === 'staff') {
      const s = metrics.s;
      const y0 = Math.max(0, Math.floor(staffTop(staff) - 2.5 * s));
      const y1 = Math.min(work.r.height, Math.ceil(staffBottom(staff) + 2 * s));
      const box = { x: 0, y: y0, w: work.r.width, h: y1 - y0 };
      work = cropWork(work, box);
      staff = cropStaff(staff, 0, y0, work.r.width);
      otherStaves = otherStaves.map((o) => cropStaff(o, 0, y0, work.r.width));
    }
    if (!staff && band.source === 'staff') {
      band = lineOrNone(W, H);
      if (band.source === 'none') {
        debug.needsBand = true;
        return { needsBand: true };
      }
    }
  }
  lap('staff');
  debug.mode = staff ? 'D' : 'A';
  debug.bandSource = band.source;
  // Pauta so no mapa r - g: as linhas nao estao no cinza e measureU apaga o texto, entao a moda da
  // espessura vira o lado das notas quadradas cheias (~d). So nesse caso u e limitado.
  if (staff && metrics && fromRed) u = Math.min(u, Math.max(metrics.t, metrics.s / 4));
  debug.strokeWidth = u;
  const p = deriveParams(u, staff ? metrics : null, prep.up);
  // componentes esperados nesta faixa: os alvos, limitados ao que cabe na largura (um grupo a cada 10u)
  needed = Math.min(needed, Math.ceil(work.r.width / (10 * u)));

  // Etapa 1: binarizacao comum (com repeticao k = 0,1 e canal auto se faltarem componentes)
  // independe de canal e de k: calculado uma vez. Notacao D sem pauta: os parametros caem para os do
  // modo A (darkOpen ~ 2,3u) e os puncta quadrados cheios sobreviveriam a abertura como "manchas" (M4c).
  const blobs: Mask =
    input.notation === 'diastematic' && !staff
      ? { data: new Uint8Array(work.gray.data.length), width: work.gray.width, height: work.gray.height }
      : darkBlobs(work.gray, work.valid, p);
  // M4f: R por padrao; outro canal so com contraste claramente maior (pickInkChannel). Pauta vermelha
  // (some no R) fica no R: as linhas somam "tinta" no cinza e puxariam a troca, mas o R ja as apaga.
  const contrasts = inkContrasts(work); // uma vez por faixa: primeira passada e repeticao
  let channel = pickInkChannel(work, contrasts).name;
  if (staff && channel !== 'r' && staffCoverage(sauvola(work.r, p.window, p.k, 128, work.valid), staff) < RED_COVERAGE)
    channel = 'r';
  let st = inkStage(work, p, staff, channel, p.k, blobs);
  if (st.comps.length < needed) {
    const retry = inkStage(work, p, staff, bestContrastChannel(work, contrasts), 0.1, blobs);
    if (retry.comps.length > st.comps.length) st = retry;
  }
  debug.channel = st.channel;
  debug.sauvolaK = st.k;
  debug.counts.components = st.comps.length;
  debug.counts.bars = st.bars.length;
  lap('ink');

  // Etapa 4: linha de texto
  const bandW = work.r.width;
  const tl: TextLine | null = findTextLine(
    st.comps,
    bandW,
    staff ? { kind: 'below', y: staffBottom(staff) } : { kind: 'lowest' },
    2 * u,
  );
  let neumes: Component[] = st.comps;
  let text: Component[] = [];
  if (tl) {
    text = st.comps.filter((c) => isTextComponent(c, tl));
    const textSet = new Set(text);
    neumes = st.comps
      .filter((c) => !textSet.has(c) && !isTextDebris(c, tl) && c.y + c.h / 2 <= tl.baseline)
      .map((c) => {
        const cut = tl.top + 0.2 * tl.xHeight;
        if (c.y < tl.top && c.y + c.h > cut) return { ...c, h: Math.max(1, Math.floor(cut - c.y)) };
        return c;
      });
    debug.textLine = { baseline: work.oy + tl.baseline / work.sy, xHeight: tl.xHeight / work.sy };
  }
  // M4d: com area desenhada, componentes cortados pela borda inferior do raster de trabalho, na metade
  // de baixo da area, sao texto. (O centro na area e cobrado dos glifos, depois da fusao.)
  const workH = work.r.height;
  const innerW = band.inner ? rasterToWork(band.inner, work) : null;
  if (innerW) neumes = neumes.filter((c) => !(c.y + c.h >= workH - 1 && c.y > innerW.y + 0.5 * innerW.h));
  if (staff) {
    // fragmentos de texto cortados pela borda inferior da faixa da pauta
    const bottom = staffBottom(staff);
    neumes = neumes.filter((c) => !(c.y > bottom && c.y + c.h >= workH - 1));
  }
  debug.counts.text = text.length;
  lap('text');

  // Etapa 5: glifos
  const merged = mergeBoxesIndexed(neumes, p.mergeGapX, p.mergeGapY, p.mergeMaxW, p.mergeMaxH);
  const toGlyph = (members: number[]): Glyph => {
    const cs = members.map((i) => neumes[i]);
    const x0 = Math.min(...cs.map((c) => c.x));
    const y0 = Math.min(...cs.map((c) => c.y));
    const x1 = Math.max(...cs.map((c) => c.x + c.w));
    const y1 = Math.max(...cs.map((c) => c.y + c.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, area: cs.reduce((sum, c) => sum + c.area, 0) };
  };
  let glyphs: Glyph[];
  if (innerW) {
    // M4d: a margem de 10% e contexto. A fusao usa todos os componentes, para que a ponta de uma virga
    // ou a cauda de uma liquescente que cruza a borda fique no grupo; o grupo vale se algum membro tem
    // centro na area desenhada, e a caixa sai so dos membros que tocam a area (tinta inteiramente na
    // margem, como rubrica acima ou topo de letras abaixo, nunca alarga nem desloca o grupo).
    const inside = (c: PxBox) => {
      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2;
      return cx >= innerW.x && cx <= innerW.x + innerW.w && cy >= innerW.y && cy <= innerW.y + innerW.h;
    };
    const touches = (c: PxBox) =>
      c.x <= innerW.x + innerW.w && c.x + c.w >= innerW.x && c.y <= innerW.y + innerW.h && c.y + c.h >= innerW.y;
    glyphs = merged
      .filter((m) => m.members.some((i) => inside(neumes[i])))
      .map((m) => toGlyph(m.members.filter((i) => touches(neumes[i]))));
  } else glyphs = merged.map((m) => toGlyph(m.members));
  if (staff) {
    const tx = text.length
      ? { firstX: Math.min(...text.map((c) => c.x)), lastX: Math.max(...text.map((c) => c.x + c.w)) }
      : null;
    const special = classifySpecialGlyphs(glyphs, staff, tx);
    const drop = new Set([...special.clef, ...special.custos]);
    debug.counts.ignored = drop.size;
    glyphs = glyphs.filter((g, i) => !drop.has(i) && !isStaffResidue(g, staff));
  }
  debug.counts.glyphs = glyphs.length;
  lap('glyphs');

  return { band, work, staff, otherStaves, metrics, tl, u, glyphs, text, bars: st.bars, red: st.red };
}

function median(v: number[]): number {
  const s = [...v].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Deslocamento maximo (em s) que as caixas da pagina podem impor: topo |off| <= 3s; base em
 * [-3s, 5s] (as caixas do usuario incluem o texto abaixo da pauta; a pauta vizinha e o fundo da
 * faixa ainda limitam).
 */
const ANCHOR_TOP_MAX = 3;
const ANCHOR_BOTTOM_MAX = 5;

/**
 * Deslocamentos (em s) do topo e da base das caixas da pagina em relacao a pauta, no x de cada uma:
 * (y - topo da pauta) / s e (y + h - base da pauta) / s; mediana sobre as ancoras desta pauta (as que
 * cruzam [topo - 2s, base + 3s]: num folio sem faixas chegam ancoras de outras pautas), limitada a
 * ANCHOR_TOP_MAX / ANCHOR_BOTTOM_MAX. null sem ancoras desta pauta.
 */
export function anchorStaffOffsets(staff: Staff, s: number, anchors: { box: PxBox }[]): { top: number; bottom: number } | null {
  if (s <= 0) return null;
  const tops: number[] = [];
  const bottoms: number[] = [];
  for (const { box } of anchors) {
    const span = staffSpanAt(staff, box.x, box.x + box.w);
    if (box.y >= span.bottom + 3 * s || box.y + box.h <= span.top - 2 * s) continue;
    tops.push((box.y - span.top) / s);
    bottoms.push((box.y + box.h - span.bottom) / s);
  }
  if (!tops.length) return null;
  return {
    top: Math.max(-ANCHOR_TOP_MAX, Math.min(ANCHOR_TOP_MAX, median(tops))),
    bottom: Math.max(-ANCHOR_TOP_MAX, Math.min(ANCHOR_BOTTOM_MAX, median(bottoms))),
  };
}

/**
 * Caixa de um grupo de glifos (px de trabalho da faixa `a`): pad, extensao da pauta, corte na linha
 * de texto, recuo diante das ancoras; trabalho -> raster (arredondando para fora) -> fracoes.
 */
function placeBox(
  members: PxBox[],
  a: BandAnalysis,
  anchorsWork: { index: number; box: PxBox }[],
  W: number,
  H: number,
): FracRect | null {
  const { work, staff, metrics, tl } = a;
  const pad = Math.max(2, a.u);
  let x0 = Math.min(...members.map((m) => m.x)) - pad;
  let x1 = Math.max(...members.map((m) => m.x + m.w)) + pad;
  let y0 = Math.min(...members.map((m) => m.y)) - pad;
  let y1 = Math.max(...members.map((m) => m.y + m.h)) + pad;
  // Altura na pauta: deslocamentos do topo e da base em relacao a pauta, em s. Com caixas da propria
  // pagina nesta faixa, os delas (mediana); senao +-0,5s. A tinta do glifo sempre cabe.
  const offs = staff && metrics ? anchorStaffOffsets(staff, metrics.s, anchorsWork) : null;
  if (staff && metrics) {
    const s = metrics.s;
    const span = staffSpanAt(staff, x0, x1);
    let top = span.top + (offs ? offs.top : -0.5) * s;
    let bottom = span.bottom + (offs ? offs.bottom : 0.5) * s;
    if (offs) {
      // sem o corte do texto, a altura vinda das ancoras para antes da pauta vizinha (acima e abaixo);
      // o fundo do raster de trabalho (area + margem) limita o resto
      for (const o of a.otherStaves) {
        const os = staffSpanAt(o, x0, x1);
        if (os.top > span.bottom) bottom = Math.min(bottom, os.top - 0.5 * s);
        else if (os.bottom < span.top) top = Math.max(top, os.bottom + 0.5 * s);
      }
    }
    y0 = Math.min(y0, top);
    y1 = Math.max(y1, bottom);
  }
  // corte na linha de texto, salvo quando a altura vem das caixas da pagina (que podem incluir o texto)
  if (tl && !offs) y1 = Math.min(y1, Math.max(y0 + 1, tl.top + 0.2 * tl.xHeight));
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(work.r.width, x1);
  y1 = Math.min(work.r.height, y1);
  for (const an of anchorsWork) {
    const overlapY = Math.min(y1, an.box.y + an.box.h) > Math.max(y0, an.box.y);
    if (!overlapY || Math.min(x1, an.box.x + an.box.w) <= Math.max(x0, an.box.x)) continue;
    if (an.box.x + an.box.w / 2 < (x0 + x1) / 2) x0 = Math.max(x0, an.box.x + an.box.w);
    else x1 = Math.min(x1, an.box.x);
  }
  if (x1 <= x0 || y1 <= y0) return null;
  const X0 = Math.max(0, floorPx(work.ox + x0 / work.sx));
  const Y0 = Math.max(0, floorPx(work.oy + y0 / work.sy));
  const X1 = Math.min(W, ceilPx(work.ox + x1 / work.sx));
  const Y1 = Math.min(H, ceilPx(work.oy + y1 / work.sy));
  return { x: X0 / W, y: Y0 / H, w: (X1 - X0) / W, h: (Y1 - Y0) / H };
}

/** Uma faixa analisada, em ordem de leitura, com as ancoras em px de trabalho dela. */
interface BandLine {
  a: BandAnalysis;
  /** Ancoras desta faixa: recuo e altura das caixas (placeBox) e posicao na fila. */
  anchorsLocal: { index: number; box: PxBox }[];
  /** Todas as ancoras da pagina neste raster de trabalho: glifos >= 50% dentro de uma delas saem. */
  allLocal: { index: number; box: PxBox }[];
}

const cxOf = (b: PxBox): number => b.x + b.w / 2;

/** Glifos e texto da porcao [L, R] de uma faixa (centro x dentro; os sob ancoras fora). */
function portionOf(l: BandLine, L: number, R: number): { glyphs: Glyph[]; text: PxBox[] } {
  const inside = (b: PxBox) => cxOf(b) >= L && cxOf(b) <= R;
  // glifos e texto >= 50% dentro de uma ancora pertencem a ela (as caixas do usuario cobrem o texto)
  const free = (b: PxBox) => inside(b) && !l.allLocal.some((an) => overlapFraction(b, an.box) >= 0.5);
  const glyphs = l.a.glyphs.filter(free).sort((p, q) => cxOf(p) - cxOf(q) || p.y - q.y);
  return { glyphs, text: l.a.text.filter(free) };
}

/**
 * Etapa 6 numa porcao [L, R] de uma faixa: prior desta porcao (palavras do texto dela), particao e
 * caixa por grupo. `open`: a contagem veio dos agrupamentos de glifos (fitCount sem texto), que se
 * fundem ou partem; a particao pode deixar a cauda de glifos e as ultimas silabas sem par. Com a
 * contagem medida pelo texto, ou na pauta (vaos entre notas de um neuma quadrado, normalizados pela
 * mediana ~0, viram cortes enormes e nao medem silabas), a particao usa todos os glifos. Devolve a borda direita do ultimo grupo usado (L se
 * nenhum) e quantas silabas foram usadas.
 */
function assignPortion(
  l: BandLine,
  L: number,
  R: number,
  syllables: SuggestSyllable[],
  glyphs: Glyph[],
  text: PxBox[],
  out: Suggestion[],
  W: number,
  H: number,
  open: boolean,
  lastExtra = false,
): { end: number; used: number } {
  if (!syllables.length || !glyphs.length) return { end: L, used: 0 };
  const words = new Set(syllables.map((s) => s.wordIndex)).size;
  const spans = wordSpans(text, words);
  const wordGapXs = spans ? spans.slice(1).map((sp, i) => (spans[i].x1 + sp.x0) / 2) : [];
  // prior sobre a extensao da tinta da porcao (glifos e texto), nao sobre as bordas da faixa
  const ink = [...glyphs, ...text];
  const L1 = Math.max(L, Math.min(...ink.map((b) => b.x)));
  const R1 = Math.max(L1 + 1, Math.min(R, Math.max(...ink.map((b) => b.x + b.w))));
  const seg = { L: L1, R: R1, syllables, glyphs };
  const expected = expectedCenters(seg, spans);
  const cuts = cutScores(glyphs, l.a.bars.map(cxOf), wordGapXs);
  const part = partitionDP(glyphs, expected, L1, R1, cuts, { open, lastExtra });
  const conf = groupConfidence(part, cuts, glyphs.length);
  let end = L;
  part.groups.forEach((g, j) => {
    if (!g) return;
    const members = glyphs.slice(g[0], g[1]);
    end = Math.max(end, ...members.map((m) => m.x + m.w));
    const syl = syllables[j];
    if (syl.suggest === false || conf[j] < MIN_CONFIDENCE) return;
    const box = placeBox(members, l.a, l.anchorsLocal, W, H);
    if (box) out.push({ index: syl.index, box, confidence: conf[j] });
  });
  return { end, used: part.used };
}

/**
 * M2: atribuicao sequencial por area. A fila (ordem de leitura) e percorrida em corridas de silabas
 * livres entre ancoras, com um cursor (faixa, x) que nunca recua. Corrida presa (a ancora seguinte
 * esta adiante do cursor): as faixas antes da da ancora recebem o que cabe (fitCount) na porcao
 * [x, largura); a faixa da ancora, todo o resto em [x, borda esquerda da ancora]. Corrida solta: cada
 * faixa a partir do cursor recebe o que cabe; o que sobra fica sem sugestao. `queue` so contem
 * ancoradas que estao em `anchorsLocal` de alguma faixa.
 */
function assignSequential(lines: BandLine[], queue: SuggestSyllable[], W: number, H: number): Suggestion[] {
  const anchorAt = new Map<number, { line: number; box: PxBox }>();
  lines.forEach((l, k) => l.anchorsLocal.forEach((an) => anchorAt.set(an.index, { line: k, box: an.box })));
  const out: Suggestion[] = [];
  // Contagem por agrupamentos sem pauta: agrupamentos se fundem (neumas de silabas vizinhas quase
  // encostados), entao a particao aberta recebe uma silaba a mais (EXTRA_COST) e decide se parte um
  // vao fraco ou deixa a ultima sem grupo (BOUNDARY_COST, TAIL_COST).
  const fit = (l: BandLine, rest: SuggestSyllable[], glyphs: Glyph[], text: PxBox[]) => {
    const d = fitDetail(rest, glyphs, text, { u: l.a.u, xHeight: l.a.tl?.xHeight });
    const open = d.n > 0 && !d.byText && !l.a.staff;
    const n = open ? Math.min(rest.length, d.n + 1) : d.n;
    return { n, open, extra: open && n > d.n };
  };
  let li = 0;
  let x = 0;
  let p = 0;
  while (p < queue.length && li < lines.length) {
    const here = anchorAt.get(queue[p].index);
    if (here) {
      if (here.line > li) {
        li = here.line;
        x = here.box.x + here.box.w;
      } else if (here.line === li) x = Math.max(x, here.box.x + here.box.w);
      p++;
      continue;
    }
    let q = p;
    while (q < queue.length && !anchorAt.has(queue[q].index)) q++;
    let rest = queue.slice(p, q);
    const A = q < queue.length ? anchorAt.get(queue[q].index)! : null;
    const bound = A && (A.line > li || (A.line === li && A.box.x >= x)) ? A : null;
    if (bound) {
      for (; li < bound.line && rest.length; li++, x = 0) {
        const l = lines[li];
        const { glyphs, text } = portionOf(l, x, l.a.work.r.width);
        const { n, open, extra } = fit(l, rest, glyphs, text);
        if (n > 0) rest = rest.slice(assignPortion(l, x, l.a.work.r.width, rest.slice(0, n), glyphs, text, out, W, H, open, extra).used);
      }
      if (rest.length) {
        const l = lines[bound.line];
        const { glyphs, text } = portionOf(l, x, bound.box.x);
        assignPortion(l, x, bound.box.x, rest, glyphs, text, out, W, H, false);
      }
      // o cursor vai para a ancora, que e consumida na proxima volta
    } else {
      while (rest.length && li < lines.length) {
        const l = lines[li];
        const R = l.a.work.r.width;
        const { glyphs, text } = portionOf(l, x, R);
        const { n, open, extra } = fit(l, rest, glyphs, text);
        if (n > 0) {
          const r = assignPortion(l, x, R, rest.slice(0, n), glyphs, text, out, W, H, open, extra);
          x = r.end;
          rest = rest.slice(r.used);
        }
        if (rest.length) {
          li++;
          x = 0;
        }
      }
    }
    p = q;
  }
  out.sort((a, b) => a.index - b.index);
  return out;
}

function staffDebug(a: BandAnalysis, H: number): StaffDebug | undefined {
  const { staff, metrics, work } = a;
  if (!staff || !metrics) return undefined;
  return {
    lines: staff.lines.map((l) => (work.oy + l.mean / work.sy) / H),
    spacing: metrics.s,
    lineThickness: metrics.t,
    red: a.red,
  };
}

const area = (r: FracRect, b: FracRect): number =>
  Math.max(0, Math.min(r.x + r.w, b.x + b.w) - Math.max(r.x, b.x)) *
  Math.max(0, Math.min(r.y + r.h, b.y + b.h) - Math.max(r.y, b.y));

function unionFrac(rs: FracRect[]): FracRect | null {
  if (!rs.length) return null;
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Ancora -> faixa de maior intersecao (-1 = fora de todas). */
function anchorBands(bands: FracRect[], anchors: SuggestAnchor[]): number[] {
  return anchors.map((a) => {
    let best = -1;
    let bestA = 0;
    bands.forEach((b, k) => {
      const v = area(b, a.box);
      if (v > bestA) {
        bestA = v;
        best = k;
      }
    });
    return best;
  });
}

/**
 * Modo candidatos: todos os grupos de neumas das faixas (as do usuario ou a inferida), sem silaba.
 * Glifos >= 50% dentro de uma ancora sao descartados; os demais viram uma caixa cada (placeBox).
 * Ordem de leitura: faixa, depois centro x.
 */
function suggestCandidates(input: SuggestInput, debug: SuggestDebug, lap: Lap): Candidate[] {
  const W = input.image.width;
  const H = input.image.height;
  const anchors = input.anchors ?? [];
  let selected: { sel: SelectedBand; own: SuggestAnchor[]; frac: FracRect | null }[];
  if (input.bands?.length) {
    const anchorBand = anchorBands(input.bands, anchors);
    selected = input.bands.map((b, k) => ({
      sel: selectBand({ band: b, notation: input.notation }, W, H),
      own: anchors.filter((_, i) => anchorBand[i] === k),
      frac: b,
    }));
  } else {
    const sel = selectBand({ ...input, anchors }, W, H);
    if (sel.source === 'none') {
      debug.needsBand = true;
      return [];
    }
    selected = [{ sel, own: anchors, frac: null }];
  }
  const candidates: Candidate[] = [];
  const perBand: BandDebug[] = [];
  const debugs: SuggestDebug[] = [];
  selected.forEach(({ sel, own, frac }, k) => {
    if (frac && sel.source !== 'user') {
      perBand.push({ band: frac, mode: 'A', glyphs: 0 });
      return;
    }
    const d = frac ? emptyDebug() : debug;
    const a = analyzeBand(input, sel, own, 0, d, lap);
    if (!a || 'needsBand' in a) {
      if (a && 'needsBand' in a) debug.needsBand = true;
      perBand.push({ band: { x: sel.rect.x / W, y: sel.rect.y / H, w: sel.rect.w / W, h: sel.rect.h / H }, mode: 'A', glyphs: 0 });
      return;
    }
    debugs.push(d);
    perBand.push({ band: workFrac(a.work, W, H), mode: a.staff ? 'D' : 'A', glyphs: a.glyphs.length, channel: d.channel, sauvolaK: d.sauvolaK });
    if (!debug.staff) debug.staff = staffDebug(a, H);
    const toWork = (list: SuggestAnchor[]) => list.map((an) => ({ index: an.index, box: fracToWork(an.box, a.work, W, H) }));
    const allLocal = toWork(anchors);
    const ownLocal = toWork(own);
    const boxes: FracRect[] = [];
    for (const g of a.glyphs) {
      if (allLocal.some((an) => overlapFraction(g, an.box) >= 0.5)) continue;
      const box = placeBox([g], a, ownLocal, W, H);
      if (box) boxes.push(box);
    }
    boxes.sort((p, q) => p.x + p.w / 2 - (q.x + q.w / 2));
    for (const box of boxes) candidates.push({ box, band: k });
    if (!frac) debug.band = workFrac(a.work, W, H);
  });
  if (input.bands?.length) {
    debug.bandSource = 'user';
    debug.bands = perBand;
    debug.band = unionFrac(perBand.map((p) => p.band));
    debug.mode = debugs.some((d) => d.mode === 'D') ? 'D' : 'A';
    const first = debugs[0];
    if (first) {
      debug.scale = first.scale;
      debug.strokeWidth = first.strokeWidth;
      debug.channel = first.channel;
      debug.sauvolaK = first.sauvolaK;
    }
    debug.textLine = debugs.find((d) => d.textLine)?.textLine;
    for (const d of debugs)
      for (const key of Object.keys(debug.counts) as (keyof SuggestDebug['counts'])[]) debug.counts[key] += d.counts[key];
  }
  return candidates;
}

/** Varias faixas do usuario (ordem de leitura = ordem do array): analise de cada uma e debug. */
function analyzeBands(
  input: SuggestInput,
  bands: FracRect[],
  anchors: SuggestAnchor[],
  needed: number,
  debug: SuggestDebug,
  lap: Lap,
): BandLine[] {
  const W = input.image.width;
  const H = input.image.height;
  const anchorBand = anchorBands(bands, anchors);
  const lines: BandLine[] = [];
  const perBand: BandDebug[] = [];
  const debugs: SuggestDebug[] = [];
  // Alvos por faixa: a parte de `needed` proporcional a largura da faixa (a de pagina inteira faria
  // toda faixa recair na binarizacao mais ruidosa); analyzeBand ainda limita por ceil(largura / 10u).
  const selected = bands.map((b) => selectBand({ band: b, notation: input.notation }, W, H));
  const totalW = selected.reduce((sum, s) => sum + (s.source === 'user' ? s.rect.w : 0), 0);
  bands.forEach((b, k) => {
    const sel = selected[k];
    if (sel.source !== 'user') {
      perBand.push({ band: b, mode: 'A', glyphs: 0 });
      return;
    }
    const own = anchors.filter((_, i) => anchorBand[i] === k);
    const d = emptyDebug();
    const share = totalW > 0 ? Math.max(1, Math.round((needed * sel.rect.w) / totalW)) : needed;
    const a = analyzeBand(input, sel, own, share, d, lap);
    if (!a || 'needsBand' in a) {
      perBand.push({ band: { x: sel.rect.x / W, y: sel.rect.y / H, w: sel.rect.w / W, h: sel.rect.h / H }, mode: 'A', glyphs: 0 });
      return;
    }
    debugs.push(d);
    perBand.push({
      band: workFrac(a.work, W, H),
      mode: a.staff ? 'D' : 'A',
      glyphs: a.glyphs.length,
      channel: d.channel,
      sauvolaK: d.sauvolaK,
    });
    const toWork = (list: SuggestAnchor[]) => list.map((an) => ({ index: an.index, box: fracToWork(an.box, a.work, W, H) }));
    lines.push({ a, anchorsLocal: toWork(own), allLocal: toWork(anchors) });
  });

  debug.bandSource = 'user';
  debug.bands = perBand;
  debug.band = unionFrac(perBand.map((p) => p.band));
  debug.mode = lines.some((l) => l.a.staff) ? 'D' : 'A';
  const first = debugs[0];
  if (first) {
    debug.scale = first.scale;
    debug.strokeWidth = first.strokeWidth;
    debug.channel = first.channel;
    debug.sauvolaK = first.sauvolaK;
  }
  debug.textLine = debugs.find((d) => d.textLine)?.textLine;
  const withStaff = lines.find((l) => l.a.staff);
  if (withStaff) debug.staff = staffDebug(withStaff.a, H);
  for (const d of debugs)
    for (const key of Object.keys(debug.counts) as (keyof SuggestDebug['counts'])[]) debug.counts[key] += d.counts[key];
  return lines;
}

export function suggestBoxes(input: SuggestInput): SuggestResult {
  validate(input);
  const t0 = now();
  const ms: Record<string, number> = {};
  let tick = t0;
  const lap: Lap = (name) => {
    const t = now();
    ms[name] = (ms[name] ?? 0) + t - tick;
    tick = t;
  };
  const debug = emptyDebug();
  debug.ms = ms;
  const { image } = input;
  const W = image.width;
  const H = image.height;
  if (input.mode === 'candidates') {
    const candidates = suggestCandidates(input, debug, lap);
    lap('assign');
    ms.total = now() - t0;
    return { suggestions: [], candidates, debug };
  }
  const order = new Map(input.syllables.map((s, i) => [s.index, i]));
  const anchors = (input.anchors ?? []).filter((a) => order.has(a.index));
  const anchored = new Set(anchors.map((a) => a.index));
  const free = input.syllables.filter((s) => !anchored.has(s.index));
  if (!free.some((s) => s.suggest !== false)) return { suggestions: [], debug };
  const needed = free.filter((s) => s.suggest !== false).length;
  const ordered = [...input.syllables].sort((a, b) => order.get(a.index)! - order.get(b.index)!);

  let lines: BandLine[];
  if (input.bands?.length) {
    lines = analyzeBands(input, input.bands, anchors, needed, debug, lap);
  } else {
    // Etapa 2 (faixa), etapas 0 a 5 (analise da faixa)
    const band = selectBand({ ...input, anchors }, W, H);
    if (band.source === 'none') {
      debug.needsBand = true;
      return { suggestions: [], debug };
    }
    const a = analyzeBand(input, band, anchors, needed, debug, lap);
    if (!a || 'needsBand' in a) return { suggestions: [], debug };
    // todas as ancoras ficam nesta faixa, mesmo fora dela
    const anchorsWork = anchors.map((an) => ({ index: an.index, box: fracToWork(an.box, a.work, W, H) }));
    lines = [{ a, anchorsLocal: anchorsWork, allLocal: anchorsWork }];
    debug.band = workFrac(a.work, W, H);
    const sd = staffDebug(a, H);
    if (sd) debug.staff = sd;
  }

  // Etapa 6: atribuicao sequencial; ancoras fora de todas as faixas saem da fila
  const placed = new Set(lines.flatMap((l) => l.anchorsLocal.map((an) => an.index)));
  const queue = ordered.filter((s) => !anchored.has(s.index) || placed.has(s.index));
  const suggestions = assignSequential(lines, queue, W, H);
  lap('assign');
  ms.total = now() - t0;
  return { suggestions, debug };
}
