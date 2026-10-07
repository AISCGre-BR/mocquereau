import type { ManuscriptSource, MocquereauProject } from "./models";
import type { RecentMeta } from "../../shared/recent";
import { flattenSyllables } from "./sliceUtils";

/** Fração (0..1) das sílabas com caixa não nula em alguma página da fonte. */
export function sourceProgress(source: ManuscriptSource, totalSyllables: number): number {
  if (totalSyllables <= 0) return 0;
  const done = new Set<number>();
  for (const l of source.lines) {
    for (const [k, b] of Object.entries(l.syllableBoxes ?? {})) if (b) done.add(Number(k));
  }
  return Math.min(1, done.size / totalSyllables);
}

/** Imagem da primeira página que tenha imagem, percorrendo as fontes na ordem. */
export function firstPageImage(project: MocquereauProject): string {
  for (const s of project.sources) for (const l of s.lines) if (l.image?.dataUrl) return l.image.dataUrl;
  return "";
}

export function buildRecentMeta(project: MocquereauProject, thumb?: string): RecentMeta {
  const total = flattenSyllables(project.text.words).length;
  const meta: RecentMeta = {
    title: project.meta.title,
    author: project.meta.author,
    updatedAt: project.meta.updatedAt,
    sources: project.sources.map((s) => ({ siglum: s.metadata.siglum, progress: sourceProgress(s, total) })),
  };
  if (thumb) meta.thumb = thumb;
  return meta;
}
