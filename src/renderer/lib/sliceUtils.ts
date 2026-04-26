// src/renderer/lib/sliceUtils.ts

import type { SyllabifiedWord, StoredImage, SyllableBox, ImageAdjustments } from './models';
import { buildImageFilter } from './image-adjustments';

// ── flattenSyllables ─────────────────────────────────────────────────────────

/**
 * Returns a flat array of all syllable strings in text order.
 */
export function flattenSyllables(words: SyllabifiedWord[]): string[] {
  return words.flatMap(w => w.syllables);
}

// ── getActiveSyllables ───────────────────────────────────────────────────────

/**
 * Returns sorted array of global syllable indices within range that are NOT gaps.
 */
export function getActiveSyllables(
  range: { start: number; end: number },
  gaps: number[],
): number[] {
  const gapSet = new Set(gaps);
  const result: number[] = [];
  for (let i = range.start; i <= range.end; i++) {
    if (!gapSet.has(i)) result.push(i);
  }
  return result;
}

// ── computeSyllableCuts ──────────────────────────────────────────────────────

/**
 * Crops each syllable's bounding box from the source image using an offscreen canvas.
 * Returns a record mapping global syllable indices → cropped StoredImage or null (gap/absent).
 *
 * When `adjustments` is provided, the canvas bakes the visual adjustments into the
 * PNG output (so DOCX export reflects what the user sees in SliceEditor/TablePreview):
 *   - Color filter (brightness/contrast/saturation/grayscale/invert) via `ctx.filter`.
 *   - Geometric transform (rotation any angle + flipH + flipV) via `ctx` transforms;
 *     output canvas dimensions = AABB of the rotated source rectangle (Phase 12 / DOCX-08).
 * The stored `SyllableBox` coords stay canonical (Phase 10 D-04); adjustments are
 * purely applied at render/crop time, never mutating the source `image.dataUrl`.
 *
 * @param image        Full source image
 * @param syllableBoxes Record keyed by global syllable index; null value = explicit gap
 * @param syllableRange Range of indices to process [start, end] inclusive
 * @param adjustments  Optional per-line image adjustments (Phase 10 / IMG-06)
 */
export async function computeSyllableCuts(
  image: StoredImage,
  syllableBoxes: Record<number, SyllableBox | null>,
  syllableRange: { start: number; end: number },
  adjustments?: ImageAdjustments,
): Promise<Record<number, StoredImage | null>> {
  const cuts: Record<number, StoredImage | null> = {};

  // Collect indices in range that have a box entry (including null = gap)
  const indicesToProcess: number[] = [];
  for (let i = syllableRange.start; i <= syllableRange.end; i++) {
    indicesToProcess.push(i);
  }

  // Identify indices that need actual canvas crops (have a non-null box)
  const cropIndices = indicesToProcess.filter(
    i => i in syllableBoxes && syllableBoxes[i] !== null,
  );

  // Mark all null/absent entries as null (gap) upfront
  for (const i of indicesToProcess) {
    if (!(i in syllableBoxes) || syllableBoxes[i] === null) {
      cuts[i] = null;
    }
  }

  if (cropIndices.length === 0) return cuts;

  // Pre-load image element once (same pattern as before)
  const imgEl = new Image();
  await new Promise<void>((resolve, reject) => {
    imgEl.onload = () => resolve();
    imgEl.onerror = reject;
    imgEl.src = image.dataUrl;
  });

  // Pre-compute adjustment flags
  const hasAdj = adjustments !== undefined;
  const rot = hasAdj ? adjustments!.rotation : 0;
  const flipH = hasAdj ? adjustments!.flipH : false;
  const flipV = hasAdj ? adjustments!.flipV : false;
  const needsGeometric = rot !== 0 || flipH || flipV;
  const filterStr = hasAdj ? buildImageFilter(adjustments) : undefined;

  // Pré-renderiza a imagem inteira aplicada (filter + flip + rotation) num
  // canvas do tamanho do AABB do retângulo rotacionado. As boxes vivem em
  // fração desse AABB (axis-aligned com a tela), então o crop se resume a um
  // drawImage do canvas pré-renderizado.
  const θ = (rot * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(θ));
  const absSin = Math.abs(Math.sin(θ));
  const aabbW = needsGeometric
    ? Math.max(1, Math.ceil(image.width * absCos + image.height * absSin))
    : image.width;
  const aabbH = needsGeometric
    ? Math.max(1, Math.ceil(image.width * absSin + image.height * absCos))
    : image.height;

  let sourceCanvas: HTMLCanvasElement | HTMLImageElement = imgEl;
  let sourceW = image.width;
  let sourceH = image.height;

  if (needsGeometric || filterStr) {
    const pre = document.createElement('canvas');
    pre.width = aabbW;
    pre.height = aabbH;
    const pctx = pre.getContext('2d');
    if (pctx) {
      if (filterStr) pctx.filter = filterStr;
      pctx.translate(aabbW / 2, aabbH / 2);
      if (rot !== 0) pctx.rotate(θ);
      pctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      pctx.drawImage(imgEl, -image.width / 2, -image.height / 2);
      sourceCanvas = pre;
      sourceW = aabbW;
      sourceH = aabbH;
    }
  }

  for (const globalIdx of cropIndices) {
    const box = syllableBoxes[globalIdx] as SyllableBox;  // non-null guaranteed above

    // Box em fração do AABB (espaço axis-aligned com a tela)
    const sx = Math.round(box.x * sourceW);
    const sy = Math.round(box.y * sourceH);
    const sw = Math.max(1, Math.round(box.w * sourceW));
    const sh = Math.max(1, Math.round(box.h * sourceH));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      cuts[globalIdx] = null;
      continue;
    }

    ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    cuts[globalIdx] = {
      dataUrl: canvas.toDataURL(image.mimeType ?? 'image/png', 0.92),
      width: sw,
      height: sh,
      mimeType: image.mimeType ?? 'image/png',
    };
  }

  return cuts;
}
