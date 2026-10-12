// src/shared/analysis/tag-counts.ts
import type { ProjectBody } from "../project-schema";
import type { AnalysisFilters, TagCountRow } from "./types";
import { annotationTags, selectCells } from "./cells";

/**
 * One row per project tag (project order), then ids used in annotations but missing
 * from the project (unknown, sorted). A syllable counts once per tag.
 */
export function tagCounts(p: ProjectBody<unknown>, f: AnalysisFilters): TagCountRow[] {
  const { sources, cells } = selectCells(p, f);
  const counts = new Map<string, Map<string, number>>();
  for (const c of cells) {
    if (!c.annotation) continue;
    for (const tagId of annotationTags(c.annotation)) {
      const m = counts.get(tagId) ?? new Map<string, number>();
      m.set(c.sourceId, (m.get(c.sourceId) ?? 0) + 1);
      counts.set(tagId, m);
    }
  }
  const projectTags = p.tags ?? [];
  const known = new Set(projectTags.map((t) => t.id));
  const bySource = (tagId: string) =>
    Object.fromEntries(sources.map((s) => [s.id, counts.get(tagId)?.get(s.id) ?? 0]));

  return [
    ...projectTags.map((t) => ({ tagId: t.id, name: t.name, group: t.group ?? null, bySource: bySource(t.id) })),
    ...[...counts.keys()]
      .filter((id) => !known.has(id))
      .sort()
      .map((id) => ({ tagId: id, name: id, group: null, bySource: bySource(id), unknown: true })),
  ];
}
