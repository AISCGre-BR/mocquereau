// scripts/eval/metrics.ts
//
// Pure metrics of the suggestion evaluation: IoU against the user's boxes
// (ground truth), the neume zone of each box, and per-source summaries.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Diastematic boxes include the text below the staff: the neumes are the top 65%. */
export const SQUARE_TOP = 0.65;

export function iou(a: Rect, b: Rect): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const i = ix * iy;
  const u = a.w * a.h + b.w * b.h - i;
  return u > 0 ? i / u : 0;
}

export function unionRect(rs: Rect[]): Rect | null {
  if (!rs.length) return null;
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Zona dos neumas: a caixa (A) ou os 65% superiores dela (D: a caixa quadrada inclui o texto). */
export const zoneOf = (box: Rect, notation: "adiastematic" | "diastematic"): Rect =>
  notation === "diastematic" ? { ...box, h: box.h * SQUARE_TOP } : { ...box };

const centerIn = (c: Rect, z: Rect): boolean => {
  const x = c.x + c.w / 2;
  const y = c.y + c.h / 2;
  return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
};

/** Por zona: IoU da união dos candidatos com centro na zona (-1 = nenhum candidato). */
export function candidateIous(cands: Rect[], zones: Rect[]): number[] {
  return zones.map((z) => {
    const u = unionRect(cands.filter((c) => centerIn(c, z)));
    return u ? iou(u, z) : -1;
  });
}

/** Por sílaba do gabarito: IoU da sugestão com a zona (-1 = sem sugestão). */
export function sequentialIous(sugs: ReadonlyMap<number, Rect>, gt: { index: number; zone: Rect }[]): number[] {
  return gt.map((g) => {
    const s = sugs.get(g.index);
    return s ? iou(s, g.zone) : -1;
  });
}

/** Sugestões com IoU < 0,3 na própria zona (caixas erradas que o usuário teria de rejeitar). */
export function wrongCount(sugs: ReadonlyMap<number, Rect>, gt: { index: number; zone: Rect }[]): number {
  return gt.filter((g) => {
    const s = sugs.get(g.index);
    return s !== undefined && iou(s, g.zone) < 0.3;
  }).length;
}

export function median(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function p95(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(0.95 * s.length) - 1)];
}

export interface Summary {
  n: number;
  found: number;
  p50: number;
  p70: number;
  median: number;
}

/** -1 conta como não achado e IoU 0. */
export function summarize(ious: number[]): Summary {
  const n = ious.length;
  const v = ious.map((x) => Math.max(0, x));
  return {
    n,
    found: n ? ious.filter((x) => x >= 0).length / n : 0,
    p50: n ? v.filter((x) => x >= 0.5).length / n : 0,
    p70: n ? v.filter((x) => x >= 0.7).length / n : 0,
    median: median(v),
  };
}
