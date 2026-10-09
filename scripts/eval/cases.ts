// scripts/eval/cases.ts
//
// Evaluation cases from a legacy .mocquereau.json: one case per page with boxes.
// Ground truth = the user's boxes (in the current view); areas = rows of those
// boxes with a margin; the page as the user would have it when starting: saved
// areas, only the "no neume" marks, no boxes.

import { migrateLegacyProject } from "@shared/migrations";
import { hydrateProject } from "@shared/project-adapter";
import { boxesInView } from "@shared/box-frame";
import { orderNeumeBands } from "@shared/band-order";
import { MISSING_IMAGE_ID } from "@shared/image-id";
import { resolveNotation } from "../../src/renderer/lib/suggest/request";
import type { ManuscriptLine, ManuscriptSource, SyllabifiedWord } from "../../src/renderer/lib/models";
import { median, zoneOf, type Rect } from "./metrics";

export const AREA_MARGIN_X = 0.003;
export const AREA_MARGIN_Y = 0.1;

export interface GtBox {
  index: number;
  box: Rect;
}

export interface EvalCase {
  /** "<sigla ou fonte N> p<página>" */
  name: string;
  source: string;
  notation: "adiastematic" | "diastematic";
  gt: { index: number; box: Rect; zone: Rect }[];
  areas: Rect[];
  /** Página como o usuário a teria ao começar: áreas salvas, só os "sem neuma" marcados, nenhuma caixa. */
  line: ManuscriptLine;
  sourceModel: ManuscriptSource;
  words: SyllabifiedWord[];
  /** Primeira sílaba com caixa no gabarito: a sílaba ativa de quem trabalha em sequência. */
  firstGt: number;
}

const cy = (r: Rect) => r.y + r.h / 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Rows of ground-truth boxes, split at wide gaps, as neume areas in the app's reading order. */
export function gtAreas(gt: GtBox[]): Rect[] {
  const rows: Rect[][] = [];
  for (const { box } of [...gt].sort((a, b) => cy(a.box) - cy(b.box))) {
    const row = rows[rows.length - 1];
    if (row) {
      const meanCy = row.reduce((s, r) => s + cy(r), 0) / row.length;
      const medH = median(row.map((r) => r.h));
      if (Math.abs(cy(box) - meanCy) <= 0.5 * medH) {
        row.push(box);
        continue;
      }
    }
    rows.push([box]);
  }
  const areas: Rect[] = [];
  for (const row of rows) {
    const byX = [...row].sort((a, b) => a.x - b.x);
    const medW = median(byX.map((r) => r.w));
    const segments: Rect[][] = [[byX[0]]];
    for (let i = 1; i < byX.length; i++) {
      const prev = byX[i - 1];
      if (byX[i].x - (prev.x + prev.w) > 2 * medW) segments.push([byX[i]]);
      else segments[segments.length - 1].push(byX[i]);
    }
    for (const seg of segments) {
      const my = AREA_MARGIN_Y * median(seg.map((r) => r.h));
      const x0 = clamp01(Math.min(...seg.map((r) => r.x)) - AREA_MARGIN_X);
      const y0 = clamp01(Math.min(...seg.map((r) => r.y)) - my);
      const x1 = clamp01(Math.max(...seg.map((r) => r.x + r.w)) + AREA_MARGIN_X);
      const y1 = clamp01(Math.max(...seg.map((r) => r.y + r.h)) + my);
      areas.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  return orderNeumeBands(areas);
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

export async function loadCases(json: unknown, label: string): Promise<{ cases: EvalCase[]; skipped: string[] }> {
  if (typeof json !== "object" || json === null || Array.isArray(json) || "schemaVersion" in json) {
    throw new Error("formato não suportado pelo eval (esperado .mocquereau.json legado)");
  }
  const migrated = await migrateLegacyProject(json);
  const urls = new Map<string, string>();
  for (const [id, img] of migrated.images) urls.set(id, `data:${img.mimeType};base64,${toBase64(img.bytes)}`);
  const project = hydrateProject(migrated.project, (ref) => urls.get(ref.imageId) ?? "");
  const ambiguous = new Set(migrated.ambiguousLines.map((r) => `${r.sourceId}/${r.lineId}`));
  const words = project.text.words as SyllabifiedWord[];

  const cases: EvalCase[] = [];
  const skipped: string[] = [];
  (project.sources as unknown as ManuscriptSource[]).forEach((source, si) => {
    const siglum = source.metadata.siglum?.trim() || `fonte ${si + 1}`;
    source.lines.forEach((line, li) => {
      const name = `${siglum} p${li + 1}`;
      const view = boxesInView(line, line.image);
      const gtBoxes: GtBox[] = Object.entries(view)
        .filter((e): e is [string, Rect] => e[1] !== null)
        .map(([k, box]) => ({ index: Number(k), box: { x: box.x, y: box.y, w: box.w, h: box.h } }))
        .sort((a, b) => a.index - b.index);
      if (gtBoxes.length === 0) return;
      if (ambiguous.has(`${source.id}/${line.id}`)) {
        skipped.push(`${label}: ${name}: página ambígua na migração (moldura das caixas incerta)`);
        return;
      }
      if (!line.image.dataUrl || line.image.imageId === MISSING_IMAGE_ID) {
        skipped.push(`${label}: ${name}: imagem ausente`);
        return;
      }
      const notation = resolveNotation(source, line);
      const areas = gtAreas(gtBoxes);
      const nulls: Record<number, null> = {};
      for (const [k, v] of Object.entries(line.syllableBoxes ?? {})) if (v === null) nulls[Number(k)] = null;
      const caseLine: ManuscriptLine = { ...line, syllableBoxes: nulls, neumeBands: areas, confirmed: false };
      cases.push({
        name,
        source: siglum,
        notation,
        gt: gtBoxes.map((g) => ({ ...g, zone: zoneOf(g.box, notation) })),
        areas,
        line: caseLine,
        sourceModel: { ...source, lines: source.lines.map((l) => (l.id === line.id ? caseLine : l)) },
        words,
        firstGt: gtBoxes[0].index,
      });
    });
  });
  return { cases, skipped };
}
