// src/renderer/lib/docx-collect.ts

import { boxesInView } from '@shared/box-frame';
import type { MocquereauProject, DocxExportPayload, DocxCellData, StoredImage } from './models';
import { flattenSyllables, computeSyllableCuts } from './sliceUtils';
import { tableRows } from './sources';
import { firstFolio, isWordBoundary, resolveCellLine } from './tableUtils';

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
 * @param options.untitled  Title used when the piece has none, the same the Tabela shows (t('file.untitled'))
 */
export async function collectDocxCrops(
  project: MocquereauProject,
  onProgress?: (done: number, total: number) => void,
  options: { untitled?: string } = {},
): Promise<DocxExportPayload> {
  const syllables = flattenSyllables(project.text.words);
  const totalSyllables = syllables.length;

  // Pre-compute word boundary flags for all syllable indices
  const wordBoundaries: boolean[] = syllables.map((_, idx) =>
    isWordBoundary(project.text.words, idx),
  );

  const grouped = tableRows(project);
  const flat = grouped.flatMap((g) => g.sources.map((source) => ({ source, groupId: g.group.id })));
  const totalCells = flat.length * totalSyllables;
  let processedCells = 0;

  const rows = await Promise.all(
    flat.map(async ({ source, groupId }) => {
      // Crops of every page with boxes, in the frame the user sees (spec R1).
      // Per-line imageAdjustments are baked in (Phase 10 / IMG-06), so the
      // DOCX export reflects what the user sees in Recortes and the Tabela.
      const cutsByLine = new Map<string, Record<number, StoredImage | null>>();
      for (const line of source.lines) {
        if (!line.syllableBoxes) continue; // Phase 4/5 compat — lines without boxes have no crops
        cutsByLine.set(
          line.id,
          await computeSyllableCuts(line.image, boxesInView(line), line.syllableRange, line.imageAdjustments),
        );
      }

      // Each syllable resolves exactly like a Tabela cell (resolveCellLine):
      // the first covering page with a box or gap for it decides; else the
      // Phase 4/5 syllableCuts; else unfilled.
      const mergedCuts: Record<number, StoredImage | null> = {};
      for (let idx = 0; idx < totalSyllables; idx++) {
        const hit = resolveCellLine(source, idx);
        if (hit?.kind === 'gap') mergedCuts[idx] = null;
        else if (hit?.kind === 'filled') {
          const cut = cutsByLine.get(hit.line.id)?.[idx];
          if (cut) mergedCuts[idx] = cut;
        } else if (idx in source.syllableCuts) mergedCuts[idx] = source.syllableCuts[idx];
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
          folio: firstFolio(source),
          folios: perImageFolios,
        },
        groupId,
        cells,
      };
    }),
  );

  return {
    title: project.meta.title.trim() || options.untitled || project.meta.title,
    author: project.meta.author,
    rawText: project.text.raw,
    syllables,
    rows,
    groups: grouped.map((g) => g.group),
    wordBoundaries,
  };
}
