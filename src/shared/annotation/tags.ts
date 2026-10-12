// src/shared/annotation/tags.ts
import type { Annotations, SyllableAnnotation, Tag } from "./types";
import { normalizeAnnotation } from "./annotation";
import { fold as foldName } from "./vocabulary";

const fold = (s: string) => foldName(s).trim();

export interface ProjectLike {
  tags?: Tag[];
  sources: Array<{ annotations?: Annotations }>;
}

export function findTagByName(tags: Tag[], name: string): Tag | undefined {
  const f = fold(name);
  return tags.find((t) => fold(t.name) === f);
}

export function newTag(name: string, group?: string): Tag {
  return { id: crypto.randomUUID(), name, ...(group ? { group } : {}) };
}

/** Maps names to tag ids, creating the missing tags. Empty and duplicate names are skipped. */
export function resolveTagNames(tags: Tag[], names: string[]): { tags: Tag[]; ids: string[] } {
  const out = [...tags];
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (name === "") continue;
    let tag = findTagByName(out, name);
    if (!tag) {
      tag = newTag(name);
      out.push(tag);
    }
    if (!ids.includes(tag.id)) ids.push(tag.id);
  }
  return { tags: out, ids };
}

export function parseHashTags(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_-]+)/gu)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** Applies fn to every tag id list in the project's annotations, normalizing the result. */
function mapTagIds<P extends ProjectLike>(project: P, fn: (ids: string[]) => string[]): P["sources"] {
  const dedupe = (ids: string[]) => [...new Set(fn(ids))];
  return project.sources.map((source) => {
    if (!source.annotations) return source;
    const annotations: Annotations = {};
    for (const [key, ann] of Object.entries(source.annotations)) {
      const next: SyllableAnnotation = {
        ...ann,
        tags: dedupe(ann.tags),
        neumes: ann.neumes.map((n) => (n.tags ? { ...n, tags: dedupe(n.tags) } : n)),
      };
      const norm = normalizeAnnotation(next);
      if (norm) annotations[Number(key)] = norm;
    }
    const { annotations: _old, ...rest } = source;
    return Object.keys(annotations).length === 0 ? rest : { ...rest, annotations };
  });
}

export function removeTagEverywhere<P extends ProjectLike>(project: P, tagId: string): P {
  return {
    ...project,
    tags: (project.tags ?? []).filter((t) => t.id !== tagId),
    sources: mapTagIds(project, (ids) => ids.filter((i) => i !== tagId)),
  };
}

export function mergeTags<P extends ProjectLike>(project: P, fromId: string, intoId: string): P {
  return {
    ...project,
    tags: (project.tags ?? []).filter((t) => t.id !== fromId),
    sources: mapTagIds(project, (ids) => ids.map((i) => (i === fromId ? intoId : i))),
  };
}
