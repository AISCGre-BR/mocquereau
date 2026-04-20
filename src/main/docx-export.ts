import {
  Document,
  Packer,
  Table,
  TableRow,
  TableCell,
  Paragraph,
  TextRun,
  ImageRun,
  PageOrientation,
  WidthType,
  BorderStyle,
  AlignmentType,
  VerticalAlign,
  TableLayoutType,
  HeightRule,
} from 'docx';
import { dialog, ipcMain } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DocxExportPayload, DocxCellData } from '../renderer/lib/models';

// ── Debug logging ─────────────────────────────────────────────────────────────
let debugFirstCellWritten = false;
function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log('[docx-export]', ...args);
}

// ── Unique ID generator for images ───────────────────────────────────────────
// docx v9.6.1 emits wp:docPr id="1" for EVERY image which makes OOXML invalid
// and prevents Word/LibreOffice from rendering the images. Workaround: pass
// explicit altText.id on each ImageRun.
let imageIdCounter = 1000;
function nextImageId(): string {
  return String(imageIdCounter++);
}

// ── Page dimensions ────────────────────────────────────────────────────────────
// A4 landscape: 297mm × 210mm in twentieths-of-a-point (TWIPs)
// 1 inch = 1440 TWIPs; 1 mm ≈ 56.7 TWIPs
const PAGE_WIDTH_TWIPS  = 16838; // 297mm
const PAGE_HEIGHT_TWIPS = 11906; // 210mm
const MARGIN_TWIPS      = 720;   // 12.7mm (~0.5 inch) all sides

// ── Column & row dimensions ───────────────────────────────────────────────────
const META_COL_WIDTH_TWIPS = 1800; // ~32mm — siglum + city + century + folio
const DATA_COL_WIDTH_TWIPS = 680;  // ~12mm per syllable — fits ~20 syllables in landscape A4
const ROW_HEIGHT_TWIPS     = 1008; // ~18mm — uniform for all data rows (D-05)
const HEADER_ROW_HEIGHT    = 360;  // ~6mm for syllable text + accent rows

// ── Chunking (DOCX-07 fix — D-01) ────────────────────────────────────────────
// Quebra da tabela em múltiplas tabelas empilhadas verticalmente quando a peça
// tem mais de SYLLABLES_PER_CHUNK sílabas. Cada chunk repete cabeçalhos e a
// primeira coluna (metadados do manuscrito).
//
// 20 sílabas × 680 TWIPs = 13 600 + 1 800 (meta) = 15 400 TWIPs ≈ 15 398 útil
// em A4 paisagem com margens de 720 TWIPs. Cabe por pouco — se limites de
// palavra empurrarem para 22 sílabas (14 960 + 1 800 = 16 760 TWIPs) o layout
// FIXED ainda é válido porque o docx escala por percentagem; só excederia a
// página útil em 9% no pior caso, e o Word permite overflow sem corromper.
const SYLLABLES_PER_CHUNK = 20;

// Hard cap para palavras muito longas: aceitar até 25 sílabas num chunk antes
// de forçar corte no meio da palavra (fallback raro — ver 08-CONTEXT.md
// §specifics). Um chunk com 25 sílabas = 17 000 + 1 800 = 18 800 TWIPs, o que
// excede levemente a página útil; aceitável como exceção para não partir a
// palavra ao meio, já que o caso é raro (palavras latinas raramente passam de
// 5-6 sílabas).
const MAX_SYLLABLES_PER_CHUNK = 25;

// ── Chunk boundary computation (DOCX-07 — D-01) ──────────────────────────────

/**
 * Compute chunk boundaries for the DOCX table, splitting at word boundaries
 * when possible. Returns an array of [startIdx, endIdx] inclusive pairs that
 * together cover [0, totalSyllables - 1] with no gaps or overlap.
 *
 * Strategy (D-01):
 *  - Target: SYLLABLES_PER_CHUNK=20 syllables per chunk.
 *  - If the chunk boundary at target (idx = start + SYLLABLES_PER_CHUNK - 1)
 *    is NOT a word boundary, walk forward (up to MAX_SYLLABLES_PER_CHUNK - 1
 *    syllables from start) looking for one.
 *  - If no word boundary is found within the MAX window, force the cut at
 *    start + MAX_SYLLABLES_PER_CHUNK - 1 (mid-word fallback; warning logged).
 *  - The last chunk always extends to totalSyllables - 1 regardless of
 *    word boundary, because it is the end of the text.
 *  - Short pieces (totalSyllables ≤ SYLLABLES_PER_CHUNK) return a single chunk
 *    [0, totalSyllables - 1] to preserve v1.0 behavior.
 *
 * @param totalSyllables length of the syllables array (≥ 0)
 * @param wordBoundaries boolean[] where true = "this is the last syllable of a word"
 * @returns inclusive [start, end] pairs; empty array if totalSyllables ≤ 0
 */
export function computeChunkBoundaries(
  totalSyllables: number,
  wordBoundaries: boolean[],
): Array<[number, number]> {
  if (totalSyllables <= 0) return [];
  if (totalSyllables <= SYLLABLES_PER_CHUNK) return [[0, totalSyllables - 1]];

  const chunks: Array<[number, number]> = [];
  let start = 0;
  while (start < totalSyllables) {
    const remaining = totalSyllables - start;
    if (remaining <= SYLLABLES_PER_CHUNK) {
      // Final short tail — one chunk to the end
      chunks.push([start, totalSyllables - 1]);
      break;
    }
    // Target end (inclusive): start + SYLLABLES_PER_CHUNK - 1
    const target = start + SYLLABLES_PER_CHUNK - 1;
    const hardLimit = Math.min(start + MAX_SYLLABLES_PER_CHUNK - 1, totalSyllables - 1);
    let end = target;
    // Walk forward from target up to hardLimit, looking for a word boundary
    while (end <= hardLimit && !wordBoundaries[end]) end++;
    if (end > hardLimit) {
      // No boundary in [target, hardLimit] — force cut mid-word at hardLimit
      end = hardLimit;
      log(
        `WARN: forced chunk cut at idx ${end} without word boundary ` +
          `(very long word starting near ${start})`,
      );
    }
    chunks.push([start, end]);
    start = end + 1;
  }
  return chunks;
}

// ── Pixel targets for image scaling ──────────────────────────────────────────
// docx's ImageRun.transformation.width/height are in PIXELS (at 96 DPI).
// 1 inch = 1440 TWIPs = 96 pixels → pixels = TWIPs / 15
// Reserve ~80% of cell for the image (leaves margin).
const TARGET_W_PX = Math.round((DATA_COL_WIDTH_TWIPS / 15) * 0.85);
const TARGET_H_PX = Math.round((ROW_HEIGHT_TWIPS / 15) * 0.85);

// ── Border helpers ────────────────────────────────────────────────────────────
function wordBorder(): { style: typeof BorderStyle[keyof typeof BorderStyle]; size: number; color: string } {
  return { style: BorderStyle.SINGLE, size: 12, color: '000000' }; // ~1.5pt
}

function innerBorder(): { style: typeof BorderStyle[keyof typeof BorderStyle]; size: number; color: string } {
  return { style: BorderStyle.SINGLE, size: 4, color: '999999' }; // ~0.5pt
}

function cellBorders(isWordBoundary: boolean) {
  const right = isWordBoundary ? wordBorder() : innerBorder();
  const thin = innerBorder();
  return { top: thin, bottom: thin, left: thin, right };
}

// ── Image scaling (object-fit contain) ───────────────────────────────────────
function scaleToFit(cropW: number, cropH: number): { width: number; height: number } {
  if (cropW === 0 || cropH === 0) return { width: TARGET_W_PX, height: TARGET_H_PX };
  const scaleW = TARGET_W_PX / cropW;
  const scaleH = TARGET_H_PX / cropH;
  const scale  = Math.min(scaleW, scaleH);
  return {
    width:  Math.max(1, Math.round(cropW * scale)),
    height: Math.max(1, Math.round(cropH * scale)),
  };
}

// ── Meta cell (first column) ──────────────────────────────────────────────────
function buildMetaCell(meta: { siglum: string; city: string; century: string; folio: string }): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: meta.siglum, bold: true, size: 16 }),
          new TextRun({ text: '\n' + meta.city, size: 14, break: 1 }),
          new TextRun({ text: meta.century, size: 14, break: 1 }),
          new TextRun({ text: meta.folio, size: 14, break: 1 }),
        ],
      }),
    ],
    width: { size: META_COL_WIDTH_TWIPS, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    borders: cellBorders(false),
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
}

// ── Data cell (syllable column) ───────────────────────────────────────────────
function buildDataCell(cell: DocxCellData): TableCell {
  const isWordBoundary = cell.isWordBoundary;
  let children: Paragraph[];

  if (cell.pngBuffer !== null && !cell.isGap) {
    // Image cell — convert ArrayBuffer (may arrive as Uint8Array via IPC
    // structured clone) to Node Buffer for docx's ImageRun.
    const buf = cell.pngBuffer as ArrayBuffer | Uint8Array | Buffer;
    const nodeBuffer = Buffer.isBuffer(buf)
      ? buf
      : buf instanceof Uint8Array
      ? Buffer.from(buf)
      : Buffer.from(new Uint8Array(buf));
    const dims = scaleToFit(cell.cropWidth, cell.cropHeight);

    // DEBUG: inspect the buffer
    const firstBytes = Array.from(nodeBuffer.slice(0, 8))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    const isValidPng =
      nodeBuffer[0] === 0x89 &&
      nodeBuffer[1] === 0x50 &&
      nodeBuffer[2] === 0x4e &&
      nodeBuffer[3] === 0x47;
    log(`cell buffer: size=${nodeBuffer.length} bytes, first=${firstBytes}, validPng=${isValidPng}, dims=${dims.width}x${dims.height}, cropSrc=${cell.cropWidth}x${cell.cropHeight}`);

    // Write first valid buffer to tmp for manual inspection
    if (!debugFirstCellWritten && isValidPng) {
      debugFirstCellWritten = true;
      const debugPath = join(tmpdir(), 'mocquereau-debug-cell.png');
      writeFile(debugPath, nodeBuffer).then(
        () => log(`first cell PNG written to ${debugPath} for inspection`),
        (err) => log('failed to write debug PNG:', err),
      );
    }

    const imgId = nextImageId();
    children = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: 'png',
            data: nodeBuffer,
            transformation: {
              width: dims.width,
              height: dims.height,
            },
            altText: {
              id: imgId,
              name: `Image_${imgId}`,
              description: '',
              title: '',
            },
          }),
        ],
      }),
    ];
  } else if (cell.isGap) {
    // Gap cell — em dash, centered, gray
    children = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: '—', color: 'AAAAAA', size: 18 }),
        ],
      }),
    ];
  } else {
    // Unfilled cell — empty
    children = [new Paragraph({ children: [] })];
  }

  return new TableCell({
    children,
    width: { size: DATA_COL_WIDTH_TWIPS, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    borders: cellBorders(isWordBoundary),
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
  });
}

// ── Header rows ───────────────────────────────────────────────────────────────

/** Determine which syllable indices are accented (penultimate syllable of each word ≥2 syllables). */
function buildAccentSet(syllables: string[], wordBoundaries: boolean[]): Set<number> {
  const accentSet = new Set<number>();
  const n = syllables.length;

  // Walk through syllables, collecting words by looking at wordBoundaries.
  // A word ends where wordBoundaries[i] === true (last syllable of word i).
  let wordStart = 0;
  for (let i = 0; i < n; i++) {
    const isEnd = wordBoundaries[i];
    if (isEnd) {
      const wordLen = i - wordStart + 1;
      if (wordLen >= 2) {
        // penultimate syllable = i - 1
        accentSet.add(i - 1);
      }
      wordStart = i + 1;
    }
  }
  // Handle last word if not terminated by a boundary
  if (wordStart < n) {
    const wordLen = n - wordStart;
    if (wordLen >= 2) {
      accentSet.add(n - 2);
    }
  }

  return accentSet;
}

function buildHeaderAccentRow(syllables: string[], wordBoundaries: boolean[]): TableRow {
  const accentSet = buildAccentSet(syllables, wordBoundaries);

  // First cell: empty meta cell
  const metaCell = new TableCell({
    children: [new Paragraph({ children: [] })],
    width: { size: META_COL_WIDTH_TWIPS, type: WidthType.DXA },
    borders: cellBorders(false),
  });

  const syllableCells = syllables.map((_syl, idx) => {
    const isAccent = accentSet.has(idx);
    return new TableCell({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: isAccent ? [new TextRun({ text: '•', size: 14 })] : [],
        }),
      ],
      width: { size: DATA_COL_WIDTH_TWIPS, type: WidthType.DXA },
      borders: cellBorders(wordBoundaries[idx] ?? false),
    });
  });

  return new TableRow({
    children: [metaCell, ...syllableCells],
    height: { value: HEADER_ROW_HEIGHT, rule: HeightRule.ATLEAST },
    tableHeader: true,
  });
}

function buildHeaderTextRow(syllables: string[], wordBoundaries: boolean[]): TableRow {
  const metaCell = new TableCell({
    children: [new Paragraph({ children: [] })],
    width: { size: META_COL_WIDTH_TWIPS, type: WidthType.DXA },
    borders: cellBorders(false),
  });

  const syllableCells = syllables.map((syl, idx) => {
    return new TableCell({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: syl, size: 14 })],
        }),
      ],
      width: { size: DATA_COL_WIDTH_TWIPS, type: WidthType.DXA },
      borders: cellBorders(wordBoundaries[idx] ?? false),
    });
  });

  return new TableRow({
    children: [metaCell, ...syllableCells],
    height: { value: HEADER_ROW_HEIGHT, rule: HeightRule.ATLEAST },
    tableHeader: true,
  });
}

// ── Document builder ──────────────────────────────────────────────────────────
function buildDocument(payload: DocxExportPayload): Document {
  const { title, author, rawText, syllables, rows, wordBoundaries } = payload;

  // Header paragraphs (D-02, D-03)
  const titlePara = new Paragraph({
    children: [
      new TextRun({ text: `${title} — ${author}`, bold: true, size: 28 }),
    ],
    spacing: { after: 120 },
  });

  const rawTextPara = new Paragraph({
    children: [
      new TextRun({ text: rawText, italics: true, size: 22 }),
    ],
    spacing: { after: 240 },
  });

  // Chunking (DOCX-07 — D-01): split long pieces into multiple stacked tables,
  // each covering ~SYLLABLES_PER_CHUNK syllables, aligned to word boundaries.
  // Short pieces (≤ SYLLABLES_PER_CHUNK) produce a single chunk (v1.0 behavior).
  const chunks = computeChunkBoundaries(syllables.length, wordBoundaries);
  log(
    `chunking: ${syllables.length} syllables → ${chunks.length} chunk(s) ` +
      `[${chunks.map((c) => c[1] - c[0] + 1).join(', ')}]`,
  );

  // Build one Table per chunk; headers and meta column repeat in each.
  const tables: Table[] = chunks.map(([chunkStart, chunkEnd]) => {
    const chunkSyllables = syllables.slice(chunkStart, chunkEnd + 1);
    const chunkWordBoundaries = wordBoundaries.slice(chunkStart, chunkEnd + 1);

    const headerAccentRow = buildHeaderAccentRow(chunkSyllables, chunkWordBoundaries);
    const headerTextRow = buildHeaderTextRow(chunkSyllables, chunkWordBoundaries);

    const dataRows = rows.map((row) => {
      const metaCell = buildMetaCell(row.meta);
      const chunkCells = row.cells.slice(chunkStart, chunkEnd + 1);
      const dataCells = chunkCells.map((cell) => buildDataCell(cell));
      return new TableRow({
        children: [metaCell, ...dataCells],
        height: { value: ROW_HEIGHT_TWIPS, rule: HeightRule.ATLEAST },
      });
    });

    const columnWidths = [
      META_COL_WIDTH_TWIPS,
      ...Array(chunkSyllables.length).fill(DATA_COL_WIDTH_TWIPS),
    ];

    return new Table({
      rows: [headerAccentRow, headerTextRow, ...dataRows],
      layout: TableLayoutType.FIXED,
      columnWidths,
      width: { size: 100, type: WidthType.PERCENTAGE },
    });
  });

  // Insert a blank paragraph between consecutive tables so Word/LibreOffice
  // respects vertical spacing and can page-break naturally between chunks.
  const tablesWithSpacing: Array<Table | Paragraph> = [];
  tables.forEach((t, i) => {
    if (i > 0) {
      tablesWithSpacing.push(
        new Paragraph({ children: [], spacing: { before: 240, after: 120 } }),
      );
    }
    tablesWithSpacing.push(t);
  });

  // Document: pass portrait dimensions + orientation flag (docx library swaps internally)
  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: PAGE_HEIGHT_TWIPS,  // note: swapped — docx requires portrait w/h + orientation
              height: PAGE_WIDTH_TWIPS,
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: {
              top: MARGIN_TWIPS,
              bottom: MARGIN_TWIPS,
              left: MARGIN_TWIPS,
              right: MARGIN_TWIPS,
            },
          },
        },
        children: [titlePara, rawTextPara, ...tablesWithSpacing],
      },
    ],
  });
}

// ── IPC handler ───────────────────────────────────────────────────────────────
export function registerDocxExportHandler(): void {
  ipcMain.handle('export:docx', async (_event, payload: DocxExportPayload) => {
    debugFirstCellWritten = false; // reset for each export
    imageIdCounter = 1000;          // reset unique image ID counter
    try {
      log(`payload received: title="${payload.title}", rows=${payload.rows.length}, syllables=${payload.syllables.length}`);
      let totalCells = 0, filledCells = 0, gapCells = 0, unfilledCells = 0;
      for (const row of payload.rows) {
        for (const cell of row.cells) {
          totalCells++;
          if (cell.pngBuffer !== null && !cell.isGap) filledCells++;
          else if (cell.isGap) gapCells++;
          else unfilledCells++;
        }
      }
      log(`cells: total=${totalCells}, filled=${filledCells}, gap=${gapCells}, unfilled=${unfilledCells}`);

      const doc = buildDocument(payload);
      const buffer = await Packer.toBuffer(doc);
      log(`docx built: ${buffer.length} bytes`);

      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Exportar tabela neumática',
        defaultPath: `${payload.title || 'tabela'}.docx`,
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
      });

      if (canceled || !filePath) return null;

      await writeFile(filePath, buffer);
      log(`docx written to ${filePath}`);
      return { filePath };
    } catch (err) {
      log('ERROR:', err);
      return null;
    }
  });
}
