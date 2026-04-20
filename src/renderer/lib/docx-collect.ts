// src/renderer/lib/docx-collect.ts

import type { MocquereauProject, DocxExportPayload, DocxCellData } from './models';
import { flattenSyllables, computeSyllableCuts } from './sliceUtils';
import { isWordBoundary } from './tableUtils';

/**
 * Converts a data URL (base64 PNG/JPEG) to an ArrayBuffer.
 * Strips the `data:image/...;base64,` prefix and decodes.
 */
function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Collects all per-cell PNG crops for every source × syllable and assembles
 * the DocxExportPayload to be sent to the main process via IPC.
 *
 * Canvas crops are performed here in the renderer (D-14) using computeSyllableCuts
 * from sliceUtils — the same function used by the slice editor preview.
 *
 * @param project  Complete project state
 * @param onProgress  Optional callback(processedCells, totalCells) for UI feedback
 */
export async function collectDocxCrops(
  project: MocquereauProject,
  onProgress?: (done: number, total: number) => void,
): Promise<DocxExportPayload> {
  const syllables = flattenSyllables(project.text.words);
  const totalSyllables = syllables.length;

  // Pre-compute word boundary flags for all syllable indices
  const wordBoundaries: boolean[] = syllables.map((_, idx) =>
    isWordBoundary(project.text.words, idx),
  );

  const totalCells = project.sources.length * totalSyllables;
  let processedCells = 0;

  const rows = await Promise.all(
    project.sources.map(async source => {
      // Merge all line crops into a flat map: syllableIdx → StoredImage | null
      const mergedCuts: Record<number, import('./models').StoredImage | null> = {};

      for (const line of source.lines) {
        if (!line.syllableBoxes) continue; // Phase 4/5 compat — skip lines without boxes
        const lineCuts = await computeSyllableCuts(
          line.image,
          line.syllableBoxes,
          line.syllableRange,
        );
        // Merge: only include syllables that actually have a box or are explicit gaps.
        // Syllables in range without a box entry should stay "unfilled", not be treated as gap.
        for (const [idxStr, cut] of Object.entries(lineCuts)) {
          const idx = Number(idxStr);
          const hasBoxEntry = idx in line.syllableBoxes;
          // Only merge if the entry is defined (box or explicit null=gap). Skip undefined
          // entries that computeSyllableCuts auto-added as null for the whole range.
          if (hasBoxEntry) {
            mergedCuts[idx] = cut;
          }
        }
      }

      // Also fold in syllableCuts (Phase 4/5 backward-compat) for indices not in mergedCuts
      for (const [idxStr, cut] of Object.entries(source.syllableCuts)) {
        const idx = Number(idxStr);
        if (!(idx in mergedCuts)) {
          mergedCuts[idx] = cut;
        }
      }

      // Build cells array (one entry per global syllable index)
      const cells: DocxCellData[] = [];
      for (let idx = 0; idx < totalSyllables; idx++) {
        const isWB = wordBoundaries[idx];

        if (idx in mergedCuts) {
          const cut = mergedCuts[idx];
          if (cut === null) {
            // Explicit gap
            cells.push({ pngBuffer: null, cropWidth: 0, cropHeight: 0, isGap: true, isWordBoundary: isWB });
          } else {
            // Filled cell — convert data URL to ArrayBuffer
            const pngBuffer = dataUrlToArrayBuffer(cut.dataUrl);
            cells.push({ pngBuffer, cropWidth: cut.width, cropHeight: cut.height, isGap: false, isWordBoundary: isWB });
          }
        } else {
          // Unfilled (no line covers this syllable)
          cells.push({ pngBuffer: null, cropWidth: 0, cropHeight: 0, isGap: false, isWordBoundary: isWB });
        }

        processedCells++;
        onProgress?.(processedCells, totalCells);
      }

      const perImageFolios = (source.lines ?? [])
        .map((l) => l.folio)
        .filter((f): f is string => typeof f === 'string' && f.trim().length > 0);

      return {
        meta: {
          siglum: source.metadata.siglum,
          city: source.metadata.city,
          century: source.metadata.century,
          folio: source.metadata.folio,
          folios: perImageFolios,
        },
        cells,
      };
    }),
  );

  // DEBUG: summarize what's being sent
  let filled = 0, gap = 0, unfilled = 0;
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.pngBuffer !== null && !cell.isGap) filled++;
      else if (cell.isGap) gap++;
      else unfilled++;
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[docx-collect] sources=${rows.length}, syllables=${syllables.length}, filled=${filled}, gap=${gap}, unfilled=${unfilled}`);

  return {
    title: project.meta.title,
    author: project.meta.author,
    rawText: project.text.raw,
    syllables,
    rows,
    wordBoundaries,
  };
}
