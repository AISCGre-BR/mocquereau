// src/renderer/lib/sliceUtils.ts

import type { SyllabifiedWord, StoredImage } from './models';

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
 * Crops slices from the source image using an offscreen canvas.
 * Returns a record mapping global syllable indices to cropped StoredImage or null (gap).
 */
export async function computeSyllableCuts(
  image: StoredImage,
  dividers: number[],
  syllableRange: { start: number; end: number },
  gaps: number[],
): Promise<Record<number, StoredImage | null>> {
  const cuts: Record<number, StoredImage | null> = {};

  // Mark gaps as null
  for (const gapIdx of gaps) {
    cuts[gapIdx] = null;
  }

  const activeSyllables = getActiveSyllables(syllableRange, gaps);
  if (activeSyllables.length === 0) return cuts;

  // Full boundaries: [0, div0, div1, ..., divN-1, 1]
  const boundaries = [0, ...dividers, 1];

  // Pre-load image element once
  const imgEl = new Image();
  await new Promise<void>((resolve, reject) => {
    imgEl.onload = () => resolve();
    imgEl.onerror = reject;
    imgEl.src = image.dataUrl;
  });

  for (let i = 0; i < activeSyllables.length; i++) {
    const globalIdx = activeSyllables[i];
    const leftFrac = boundaries[i] ?? 0;
    const rightFrac = boundaries[i + 1] ?? 1;
    const leftPx = Math.round(leftFrac * image.width);
    const sliceWidth = Math.max(1, Math.round((rightFrac - leftFrac) * image.width));

    const canvas = document.createElement('canvas');
    canvas.width = sliceWidth;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.drawImage(imgEl, leftPx, 0, sliceWidth, image.height, 0, 0, sliceWidth, image.height);

    cuts[globalIdx] = {
      dataUrl: canvas.toDataURL(image.mimeType ?? 'image/png', 0.92),
      width: sliceWidth,
      height: image.height,
      mimeType: image.mimeType ?? 'image/png',
    };
  }

  return cuts;
}
