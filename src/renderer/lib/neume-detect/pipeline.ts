// SPDX-License-Identifier: GPL-3.0-or-later
// Contem codigo portado de Othmar neo (othmar/candidates.py, AGPL-3.0-or-later), de autoria
// exclusiva de Gabriel Honorato Teixeira Bernardo, relicenciado pelo autor sob GPL-3.0-or-later.
// Ver NOTICE.
// suggestBoxes: pipeline puro, sincrono e deterministico (spec, etapas 0 a 6).
// Fluxo base: find_candidates() de othmar/candidates.py.
import { groupConfidence, cutScores, expectedCenters, partitionDP, segmentByAnchors, type Glyph } from './assign';
import { ceilPx, floorPx, fracToPxRect, lineOrNone, selectBand } from './band';
import { filterComponents, labelComponents, labelsTouching, type Component } from './components';
import {
  alphaMask,
  cropGray,
  cropMask,
  contrastScore,
  cropRaster,
  downscaleGray,
  downscaleMask,
  extractChannel,
  upscale2xGray,
  upscale2xMask,
} from './image';
import { darkBlobs } from './mask';
import { mergeBoxesIndexed } from './merge';
import { deriveParams, estimateStrokeWidth, staffMetrics, type Params, type StaffMetrics } from './scale';
import {
  classifySpecialGlyphs,
  cropStaff,
  findStaves,
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
import type { ChannelName, GrayImage, Mask, PxBox, SuggestDebug, SuggestInput, SuggestResult, Suggestion } from './types';

export const MAX_LONG_SIDE = 2400;
export const MIN_CONFIDENCE = 0.2;
const RED_COVERAGE = 0.3;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

interface Work {
  r: GrayImage;
  gray: GrayImage;
  valid: Mask;
  /** px do raster = ox + x / scale */
  ox: number;
  oy: number;
  scale: number;
}

function cropWork(w: Work, box: PxBox): Work {
  return {
    r: cropGray(w.r, box),
    gray: cropGray(w.gray, box),
    valid: cropMask(w.valid, box),
    ox: w.ox + box.x / w.scale,
    oy: w.oy + box.y / w.scale,
    scale: w.scale,
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

/** Etapas 1 e 3: binarizacao, manchas, remocao da pauta, rotulagem, barras, filtros. */
function inkStage(work: Work, p: Params, staff: Staff | null, channel: 'r' | 'auto', k: number): InkStage {
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
  const blobs = darkBlobs(work.gray, work.valid, p);
  const lab = labelComponents(ink);
  const reject = labelsTouching(lab, blobs);
  const bars: Component[] = [];
  if (staff)
    for (const c of lab.components) if (!reject.has(c.label) && isBarLine(c, staff, p.u)) {
      bars.push(c);
      reject.add(c.label);
    }
  return { comps: filterComponents(lab, p, reject), bars, channel: name, k, red };
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

export function suggestBoxes(input: SuggestInput): SuggestResult {
  validate(input);
  const t0 = now();
  const ms: Record<string, number> = {};
  let tick = t0;
  const lap = (name: string) => {
    const t = now();
    ms[name] = t - tick;
    tick = t;
  };
  const debug = emptyDebug();
  debug.ms = ms;
  const { image } = input;
  const W = image.width;
  const H = image.height;
  const order = new Map(input.syllables.map((s, i) => [s.index, i]));
  const anchors = (input.anchors ?? []).filter((a) => order.has(a.index));
  const anchored = new Set(anchors.map((a) => a.index));
  const free = input.syllables.filter((s) => !anchored.has(s.index));
  if (!free.some((s) => s.suggest !== false)) return { suggestions: [], debug };

  // Etapa 2 (faixa) e etapa 0 (raster de trabalho e escala)
  let band = selectBand({ ...input, anchors }, W, H);
  if (band.source === 'none') {
    debug.needsBand = true;
    return { suggestions: [], debug };
  }
  const crop = cropRaster(image, band.rect);
  let scale = Math.min(1, MAX_LONG_SIDE / Math.max(crop.width, crop.height));
  let work: Work = {
    r: downscaleGray(extractChannel(crop, 'r'), scale),
    gray: downscaleGray(extractChannel(crop, 'gray'), scale),
    valid: downscaleMask(alphaMask(crop), scale),
    ox: band.rect.x,
    oy: band.rect.y,
    scale,
  };
  work.scale = work.r.width / crop.width;
  let grayInk = binarizeOtsu(work.gray, work.valid);
  let u = estimateStrokeWidth(grayInk);
  if (u > 0 && u < 2) {
    work = {
      r: upscale2xGray(work.r),
      gray: upscale2xGray(work.gray),
      valid: upscale2xMask(work.valid),
      ox: work.ox,
      oy: work.oy,
      scale: work.scale * 2,
    };
    grayInk = binarizeOtsu(work.gray, work.valid);
    u = estimateStrokeWidth(grayInk);
  }
  debug.scale = work.scale;
  lap('prepare');
  if (u === 0) {
    debug.bandSource = band.source;
    return { suggestions: [], debug };
  }

  const toWork = (b: PxBox): PxBox => {
    const px = fracToPxRect(b, W, H);
    return {
      x: (px.x - work.ox) * work.scale,
      y: (px.y - work.oy) * work.scale,
      w: px.w * work.scale,
      h: px.h * work.scale,
    };
  };
  // Etapa 3: pauta
  let staff: Staff | null = null;
  let metrics: StaffMetrics | null = null;
  if (input.notation === 'diastematic') {
    metrics = staffMetrics(grayInk);
    const staves = metrics ? findStaves(grayInk, metrics) : [];
    if (staves.length > 1 && band.source === 'staff') {
      // varias pautas e nada indica qual: pedir a faixa em vez de chutar a primeira
      const picked = anchors.length ? pickStaffByAnchors(staves, anchors.map((a) => toWork(a.box))) : null;
      if (!picked) {
        debug.needsBand = true;
        debug.bandSource = band.source;
        return { suggestions: [], debug };
      }
      staff = picked;
    } else if (staves.length > 1 && anchors.length) {
      staff = pickStaffByAnchors(staves, anchors.map((a) => toWork(a.box))) ?? staves[0];
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
        debug.ms = ms;
        return { suggestions: [], debug };
      }
    }
  }
  lap('staff');
  const mode: 'A' | 'D' = staff ? 'D' : 'A';
  debug.mode = mode;
  debug.bandSource = band.source;
  debug.strokeWidth = u;
  const p = deriveParams(u, staff ? metrics : null);

  // Etapa 1: binarizacao comum (com repeticao k = 0,1 e canal auto se faltarem componentes)
  const needed = free.length;
  let st = inkStage(work, p, staff, 'r', p.k);
  if (st.comps.length < needed) {
    const retry = inkStage(work, p, staff, 'auto', 0.1);
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
    debug.textLine = { baseline: work.oy + tl.baseline / work.scale, xHeight: tl.xHeight / work.scale };
  }
  if (staff) {
    // fragmentos de texto cortados pela borda inferior da faixa da pauta
    const bottom = staffBottom(staff);
    neumes = neumes.filter((c) => !(c.y > bottom && c.y + c.h >= work.r.height - 1));
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

  // Etapa 6: atribuicao
  const anchorsWork = anchors.map((a) => ({ index: a.index, box: toWork(a.box) }));
  const ordered = [...input.syllables].sort((a, b) => order.get(a.index)! - order.get(b.index)!);
  const segments = segmentByAnchors(ordered, anchorsWork, glyphs, 0, work.r.width);
  const barXs = st.bars.map((b) => b.x + b.w / 2);
  const pad = Math.max(2, u);
  const suggestions: Suggestion[] = [];
  for (const seg of segments) {
    if (seg.glyphs.length === 0) continue;
    const words = new Set(seg.syllables.map((s) => s.wordIndex)).size;
    const segText = text.filter((c) => c.x + c.w / 2 >= seg.L && c.x + c.w / 2 <= seg.R);
    const spans = wordSpans(segText, words);
    const wordGapXs = spans ? spans.slice(1).map((sp, i) => (spans[i].x1 + sp.x0) / 2) : [];
    const expected = expectedCenters(seg, spans);
    const cuts = cutScores(seg.glyphs, barXs, wordGapXs);
    const part = partitionDP(seg.glyphs, expected, seg.L, seg.R, cuts);
    const conf = groupConfidence(part, cuts, seg.glyphs.length);
    part.groups.forEach((g, j) => {
      const syl = seg.syllables[j];
      if (!g || syl.suggest === false || conf[j] < MIN_CONFIDENCE) return;
      const members = seg.glyphs.slice(g[0], g[1]);
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
      for (const a of anchorsWork) {
        const overlapY = Math.min(y1, a.box.y + a.box.h) > Math.max(y0, a.box.y);
        if (!overlapY || Math.min(x1, a.box.x + a.box.w) <= Math.max(x0, a.box.x)) continue;
        if (a.box.x + a.box.w / 2 < (x0 + x1) / 2) x0 = Math.max(x0, a.box.x + a.box.w);
        else x1 = Math.min(x1, a.box.x);
      }
      if (x1 <= x0 || y1 <= y0) return;
      // trabalho -> raster (arredondando para fora) -> fracoes
      const X0 = Math.max(0, floorPx(work.ox + x0 / work.scale));
      const Y0 = Math.max(0, floorPx(work.oy + y0 / work.scale));
      const X1 = Math.min(W, ceilPx(work.ox + x1 / work.scale));
      const Y1 = Math.min(H, ceilPx(work.oy + y1 / work.scale));
      suggestions.push({
        index: syl.index,
        box: { x: X0 / W, y: Y0 / H, w: (X1 - X0) / W, h: (Y1 - Y0) / H },
        confidence: conf[j],
      });
    });
  }
  suggestions.sort((a, b) => a.index - b.index);
  lap('assign');
  debug.band = {
    x: work.ox / W,
    y: work.oy / H,
    w: work.r.width / work.scale / W,
    h: work.r.height / work.scale / H,
  };
  if (staff && metrics)
    debug.staff = {
      lines: staff.lines.map((l) => (work.oy + l.mean / work.scale) / H),
      spacing: metrics.s,
      lineThickness: metrics.t,
      red: st.red,
    };
  ms.total = now() - t0;
  return { suggestions, debug };
}
