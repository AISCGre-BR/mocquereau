// SPDX-License-Identifier: GPL-3.0-or-later
// Contem codigo portado de Othmar neo (othmar/candidates.py, AGPL-3.0-or-later), de autoria
// exclusiva de Gabriel Honorato Teixeira Bernardo, relicenciado pelo autor sob GPL-3.0-or-later.
// Ver NOTICE.
// suggestBoxes: pipeline puro, sincrono e deterministico (spec, etapas 0 a 6).
// Fluxo base: find_candidates() de othmar/candidates.py.
import { groupConfidence, cutScores, expectedCenters, overlapFraction, partitionDP, segmentByAnchors, type Glyph } from './assign';
import { ceilPx, floorPx, fracToPxRect, lineOrNone, selectBand } from './band';
import { dropIsolatedSpecks, filterComponents, labelComponents, labelsTouching, type Component } from './components';
import {
  cropGray,
  cropMask,
  contrastScore,
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

/** Pauta achada so no mapa r - g precisa cobrir ao menos esta fracao da largura da faixa. */
const RED_MIN_EXTENT = 0.5;

/** Etapas 1 e 3: binarizacao, manchas, remocao da pauta, rotulagem, barras, filtros, pontos isolados. */
function inkStage(
  work: Work,
  p: Params,
  staff: Staff | null,
  channel: 'r' | 'auto',
  k: number,
  blobs: Mask = darkBlobs(work.gray, work.valid, p),
): InkStage {
  let img = work.r;
  let name: ChannelName = 'r';
  if (channel === 'auto' && contrastScore(work.gray, work.valid) > contrastScore(work.r, work.valid)) {
    img = work.gray;
    name = 'gray';
  }
  let ink = sauvola(img, p.window, k, 128, work.valid);
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
}

/** Resultado das etapas 0 a 5 numa faixa: tudo em px do raster de trabalho dessa faixa. */
interface BandAnalysis {
  band: SelectedBand;
  work: Work;
  staff: Staff | null;
  metrics: StaffMetrics | null;
  tl: TextLine | null;
  u: number;
  glyphs: Glyph[];
  text: Component[];
  bars: Component[];
  red: boolean;
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

/**
 * Espessura do traco medida fora da linha de texto: a caneta do texto costuma ser mais grossa que a
 * dos neumas e, com mais pixels, domina a moda (M4a). Sem linha de texto, ou se nada sobra fora dela,
 * fica a medida da faixa inteira; a medida de fora so e aceita se for menor.
 */
function measureU(grayInk: Mask): number {
  const u0 = estimateStrokeWidth(grayInk);
  if (u0 === 0) return 0;
  const comps = labelComponents(grayInk).components.filter((c) => c.area >= 4);
  const tl = findTextLine(comps, grayInk.width, { kind: 'lowest' });
  if (!tl) return u0;
  const u1 = strokeWidthOutside(grayInk, [{ y0: tl.top, y1: tl.bottom }]);
  // So para baixo: fora do texto pode sobrar uma mancha cheia (run ~ seu tamanho) que domina a moda.
  return u1 > 0 ? Math.min(u1, u0) : u0;
}

/**
 * Etapa 0: raster de trabalho (recorte, reducao a MAX_LONG_SIDE, ampliacao 2x se u < 2) e espessura
 * de traco. Unico ponto de preparacao do raster de trabalho de uma faixa.
 */
function buildWork(image: SuggestInput['image'], rect: PxBox): { work: Work; grayInk: Mask; u: number; up: number } {
  const scale = Math.min(1, MAX_LONG_SIDE / Math.max(rect.w, rect.h));
  let work: Work = { ...prepareWork(image, rect, scale), ox: rect.x, oy: rect.y, sx: 1, sy: 1 };
  work.sx = work.r.width / rect.w;
  work.sy = work.r.height / rect.h;
  let grayInk = binarizeOtsu(work.gray, work.valid);
  let u = measureU(grayInk);
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
    u = measureU(grayInk);
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
  const prep = buildWork(input.image, band.rect);
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
  if (input.notation === 'diastematic') {
    const anchorBoxes = () => anchors.map((a) => fracToWork(a.box, work, W, H));
    metrics = staffMetrics(grayInk);
    let staves = metrics ? findStavesRobust(grayInk, metrics) : [];
    if (!staves.length) {
      // pauta vermelha clara que some no cinza binarizado: terceira tentativa no mapa r - g
      const redInk = binarizeOtsu(rednessInk(work.r, work.g), work.valid);
      const m2 = staffMetrics(redInk);
      // so linhas longas: rubricas (letras vermelhas grandes) tambem tem tracos horizontais alinhados
      const s2 = (m2 ? findStavesRobust(redInk, m2) : []).filter((st) => st.x1 - st.x0 >= RED_MIN_EXTENT * redInk.width);
      if (s2.length) {
        metrics = m2;
        staves = s2;
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
    if (staff && metrics && band.source === 'staff') {
      const s = metrics.s;
      const y0 = Math.max(0, Math.floor(staffTop(staff) - 2.5 * s));
      const y1 = Math.min(work.r.height, Math.ceil(staffBottom(staff) + 2 * s));
      const box = { x: 0, y: y0, w: work.r.width, h: y1 - y0 };
      work = cropWork(work, box);
      staff = cropStaff(staff, 0, y0, work.r.width);
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
  // Notas quadradas cheias (~d) nao sao traco: sem linhas de pauta e texto na medida (pauta vermelha
  // invisivel no cinza, texto apagado por measureU), a moda vira o tamanho da nota.
  if (staff && metrics) u = Math.min(u, Math.max(metrics.t, metrics.s / 4));
  debug.strokeWidth = u;
  const p = deriveParams(u, staff ? metrics : null, prep.up);

  // Etapa 1: binarizacao comum (com repeticao k = 0,1 e canal auto se faltarem componentes)
  const blobs = darkBlobs(work.gray, work.valid, p); // independe de canal e de k: calculado uma vez
  let st = inkStage(work, p, staff, 'r', p.k, blobs);
  if (st.comps.length < needed) {
    const retry = inkStage(work, p, staff, 'auto', 0.1, blobs);
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
  if (staff) {
    // fragmentos de texto cortados pela borda inferior da faixa da pauta
    const bottom = staffBottom(staff);
    const h = work.r.height;
    neumes = neumes.filter((c) => !(c.y > bottom && c.y + c.h >= h - 1));
  }
  debug.counts.text = text.length;
  lap('text');

  // Etapa 5: glifos
  const merged = mergeBoxesIndexed(neumes, p.mergeGapX, p.mergeGapY, p.mergeMaxW, p.mergeMaxH);
  let glyphs: Glyph[] = merged.map((m) => ({ x: m.x, y: m.y, w: m.w, h: m.h, area: m.members.reduce((s, i) => s + neumes[i].area, 0) }));
  if (staff) {
    const tx = text.length
      ? { firstX: Math.min(...text.map((c) => c.x)), lastX: Math.max(...text.map((c) => c.x + c.w)) }
      : null;
    const special = classifySpecialGlyphs(glyphs, staff, tx);
    const drop = new Set([...special.clef, ...special.custos]);
    debug.counts.ignored = drop.size;
    glyphs = glyphs.filter((_, i) => !drop.has(i));
  }
  debug.counts.glyphs = glyphs.length;
  lap('glyphs');

  return { band, work, staff, metrics, tl, u, glyphs, text, bars: st.bars, red: st.red };
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
  if (staff && metrics) {
    const span = staffSpanAt(staff, x0, x1);
    y0 = Math.min(y0, span.top - 0.5 * metrics.s);
    y1 = Math.max(y1, span.bottom + 0.5 * metrics.s);
  }
  if (tl) y1 = Math.min(y1, Math.max(y0 + 1, tl.top + 0.2 * tl.xHeight));
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

/** Uma faixa analisada posta na linha virtual: x virtual = x de trabalho + offset. */
interface VirtualLine {
  a: BandAnalysis;
  offset: number;
  /** Ancoras desta faixa, em px de trabalho da faixa (sem deslocamento). */
  anchorsLocal: { index: number; box: PxBox }[];
}

type VGlyph = Glyph & { line: number };

/**
 * Etapa 6 sobre a linha virtual [0, x1]: segmentos entre ancoras, particao e caixa por grupo.
 * `forcedXs` sao fronteiras entre faixas: entram como barra e como espaco entre palavras.
 */
function assignVirtual(
  lines: VirtualLine[],
  ordered: SuggestSyllable[],
  anchorsVirtual: { index: number; box: PxBox }[],
  x1: number,
  forcedXs: number[],
  W: number,
  H: number,
): Suggestion[] {
  const glyphs: VGlyph[] = lines.flatMap((l, i) => l.a.glyphs.map((g) => ({ ...g, x: g.x + l.offset, line: i })));
  const text: PxBox[] = lines.flatMap((l) => l.a.text.map((c) => ({ x: c.x + l.offset, y: c.y, w: c.w, h: c.h })));
  const barXs = [...lines.flatMap((l) => l.a.bars.map((b) => b.x + l.offset + b.w / 2)), ...forcedXs];
  const segments = segmentByAnchors(ordered, anchorsVirtual, glyphs, 0, x1);
  const suggestions: Suggestion[] = [];
  for (const seg of segments) {
    if (seg.glyphs.length === 0) continue;
    const words = new Set(seg.syllables.map((s) => s.wordIndex)).size;
    const segText = text.filter((c) => c.x + c.w / 2 >= seg.L && c.x + c.w / 2 <= seg.R);
    const spans = wordSpans(segText, words);
    const wordGapXs = spans ? spans.slice(1).map((sp, i) => (spans[i].x1 + sp.x0) / 2) : [];
    const expected = expectedCenters(seg, spans);
    const cuts = cutScores(seg.glyphs, barXs, [...wordGapXs, ...forcedXs]);
    const part = partitionDP(seg.glyphs, expected, seg.L, seg.R, cuts);
    const conf = groupConfidence(part, cuts, seg.glyphs.length);
    part.groups.forEach((g, j) => {
      const syl = seg.syllables[j];
      if (!g || syl.suggest === false || conf[j] < MIN_CONFIDENCE) return;
      const all = seg.glyphs.slice(g[0], g[1]) as VGlyph[];
      // grupo que atravessa faixas: fica so a faixa majoritaria (empate: a primeira)
      const count = new Map<number, number>();
      for (const m of all) count.set(m.line, (count.get(m.line) ?? 0) + 1);
      let k = all[0].line;
      for (const [line, c] of count) if (c > count.get(k)! || (c === count.get(k)! && line < k)) k = line;
      const l = lines[k];
      const members = all.filter((m) => m.line === k).map((m) => ({ x: m.x - l.offset, y: m.y, w: m.w, h: m.h }));
      const box = placeBox(members, l.a, l.anchorsLocal, W, H);
      if (box) suggestions.push({ index: syl.index, box, confidence: conf[j] });
    });
  }
  suggestions.sort((p, q) => p.index - q.index);
  return suggestions;
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

/** Varias faixas do usuario (ordem de leitura = ordem do array) como uma unica linha virtual. */
function suggestOnBands(
  input: SuggestInput,
  bands: FracRect[],
  anchors: SuggestAnchor[],
  ordered: SuggestSyllable[],
  needed: number,
  debug: SuggestDebug,
  lap: Lap,
): Suggestion[] {
  const W = input.image.width;
  const H = input.image.height;
  const anchorBand = anchorBands(bands, anchors);
  const lines: VirtualLine[] = [];
  const lineOf = new Map<number, number>();
  const perBand: BandDebug[] = [];
  const debugs: SuggestDebug[] = [];
  // Componentes esperados por faixa: a parte de `needed` proporcional a largura da faixa
  // (a de pagina inteira faria toda faixa recair na binarizacao mais ruidosa).
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
    // faixa sem glifos nem ancoras nao ocupa espaco na linha virtual (nao rouba silabas)
    if (!a.glyphs.length && !own.length) return;
    lineOf.set(k, lines.length);
    lines.push({ a, offset: 0, anchorsLocal: own.map((an) => ({ index: an.index, box: fracToWork(an.box, a.work, W, H) })) });
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
  if (!lines.length) return [];

  const gap = 4 * Math.max(...lines.map((l) => l.a.u));
  let x = 0;
  for (const l of lines) {
    l.offset = x;
    x += l.a.work.r.width + gap;
  }
  const x1 = x - gap;
  const forcedXs = lines.slice(1).map((l) => l.offset - gap / 2);
  const anchorsVirtual: { index: number; box: PxBox }[] = [];
  const outside = new Set<number>();
  anchors.forEach((an, i) => {
    const li = anchorBand[i] >= 0 ? lineOf.get(anchorBand[i]) : undefined;
    if (li === undefined) {
      outside.add(an.index);
      return;
    }
    const l = lines[li];
    const box = l.anchorsLocal.find((o) => o.index === an.index)!.box;
    anchorsVirtual.push({ index: an.index, box: { ...box, x: box.x + l.offset } });
  });
  const inLine = ordered.filter((s) => !outside.has(s.index));
  return assignVirtual(lines, inLine, anchorsVirtual, x1, forcedXs, W, H);
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

  if (input.bands?.length) {
    const suggestions = suggestOnBands(input, input.bands, anchors, ordered, needed, debug, lap);
    lap('assign');
    ms.total = now() - t0;
    return { suggestions, debug };
  }

  // Etapa 2 (faixa), etapas 0 a 5 (analise da faixa)
  const band = selectBand({ ...input, anchors }, W, H);
  if (band.source === 'none') {
    debug.needsBand = true;
    return { suggestions: [], debug };
  }
  const a = analyzeBand(input, band, anchors, needed, debug, lap);
  if (!a || 'needsBand' in a) return { suggestions: [], debug };

  // Etapa 6: atribuicao (todas as ancoras ficam nesta faixa, mesmo fora dela)
  const anchorsWork = anchors.map((an) => ({ index: an.index, box: fracToWork(an.box, a.work, W, H) }));
  const line: VirtualLine = { a, offset: 0, anchorsLocal: anchorsWork };
  const suggestions = assignVirtual([line], ordered, anchorsWork, a.work.r.width, [], W, H);
  lap('assign');
  debug.band = workFrac(a.work, W, H);
  const sd = staffDebug(a, H);
  if (sd) debug.staff = sd;
  ms.total = now() - t0;
  return { suggestions, debug };
}
