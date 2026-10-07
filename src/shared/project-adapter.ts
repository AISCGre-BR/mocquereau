// src/shared/project-adapter.ts
//
// Wave A2 staging adapter. The renderer still holds images as data URLs
// (SessionProject); project.json references them by sha256 id (ProjectFileV2).
// hydrate: file -> renderer (on open). dehydrate: renderer -> file (on save).
import {
  CURRENT_SCHEMA_VERSION,
  type ImageRef,
  type InlineImage,
  type LineOf,
  type PackagedImageMeta,
  type ProjectFileV2,
  type SessionProject,
  type SourceClasses,
  type SourceOf,
} from "./project-schema";
import { IMAGE_ID_RE, MISSING_IMAGE_ID, imageEntryPath } from "./image-id";
import { cloneClassification } from "./classification";
import { frameOf, hasAnyBox } from "./box-frame";

export interface ResolvedImage {
  ref: ImageRef;
  byteLength: number;
}

function mapCuts<A, B>(cuts: Record<number, A | null>, fn: (a: A) => B): Record<number, B | null> {
  const out: Record<number, B | null> = {};
  for (const [key, value] of Object.entries(cuts) as [string, A | null][]) {
    out[Number(key)] = value === null ? null : fn(value);
  }
  return out;
}

function mapRefs(file: ProjectFileV2, fn: (ref: ImageRef) => ImageRef): ProjectFileV2["sources"] {
  return file.sources.map((s) => ({
    ...s,
    lines: s.lines.map((l) => ({ ...l, image: fn(l.image) })),
    syllableCuts: mapCuts(s.syllableCuts, fn),
  }));
}

export function hydrateProject(
  file: ProjectFileV2,
  dataUrlOf: (ref: ImageRef) => string,
): SessionProject {
  const inline = (ref: ImageRef): InlineImage => ({
    dataUrl: ref.missing ? "" : dataUrlOf(ref),
    imageId: ref.imageId,
    width: ref.width,
    height: ref.height,
    mimeType: ref.mimeType,
  });
  return {
    meta: { ...file.meta },
    text: {
      ...file.text,
      words: file.text.words.map((w) => ({ original: w.original, syllables: [...w.syllables] })),
    },
    sections: file.sections.map((s) => ({ ...s, wordRange: [s.wordRange[0], s.wordRange[1]] })),
    classification: cloneClassification(file.classification),
    sources: file.sources.map((s) => ({
      ...s,
      metadata: { ...s.metadata, classes: [...s.metadata.classes] as SourceClasses },
      lines: s.lines.map((l) => ({ ...l, image: inline(l.image) })),
      syllableCuts: mapCuts(s.syllableCuts, inline),
    })),
  };
}

export async function dehydrateProject(
  project: SessionProject,
  resolve: (img: InlineImage) => Promise<ResolvedImage | null>,
  appVersion: string,
): Promise<{ file: ProjectFileV2; unresolved: number }> {
  const images: Record<string, PackagedImageMeta> = {};
  let unresolved = 0;

  const toRef = async (img: InlineImage): Promise<ImageRef> => {
    const resolved = await resolve(img);
    if (!resolved) {
      unresolved++;
      return {
        imageId: img.imageId && IMAGE_ID_RE.test(img.imageId) ? img.imageId : MISSING_IMAGE_ID,
        width: img.width,
        height: img.height,
        mimeType: img.mimeType,
        missing: true,
      };
    }
    const { ref, byteLength } = resolved;
    if (!ref.missing) {
      images[ref.imageId] = { path: imageEntryPath(ref.imageId, ref.mimeType), mimeType: ref.mimeType, byteLength };
    }
    return ref;
  };

  const sources: SourceOf<ImageRef>[] = [];
  for (const s of project.sources) {
    const lines: LineOf<ImageRef>[] = [];
    for (const l of s.lines) {
      const line: LineOf<ImageRef> = { ...l, image: await toRef(l.image) };
      // Spec R1: a line with boxes always records the frame they are in.
      if (hasAnyBox(l.syllableBoxes) && !l.boxFrame) line.boxFrame = frameOf(l.imageAdjustments);
      lines.push(line);
    }
    const cuts: Record<number, ImageRef | null> = {};
    for (const [key, c] of Object.entries(s.syllableCuts) as [string, InlineImage | null][]) {
      cuts[Number(key)] = c === null ? null : await toRef(c);
    }
    sources.push({ ...s, lines, syllableCuts: cuts });
  }

  return {
    unresolved,
    file: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      app: { name: "mocquereau", version: appVersion },
      meta: { ...project.meta },
      text: project.text,
      sections: project.sections,
      classification: project.classification,
      images,
      sources,
    },
  };
}

export function markMissingImages(
  file: ProjectFileV2,
  available: ReadonlySet<string>,
): { file: ProjectFileV2; missing: string[] } {
  const missing = new Set<string>();
  const fix = (ref: ImageRef): ImageRef => {
    if (ref.missing || available.has(ref.imageId)) return ref;
    missing.add(ref.imageId);
    return { ...ref, missing: true };
  };
  const sources = mapRefs(file, fix);
  if (missing.size === 0 && Object.keys(file.images).every((id) => available.has(id))) {
    return { file, missing: [] };
  }
  const images = Object.fromEntries(Object.entries(file.images).filter(([id]) => available.has(id)));
  return { file: { ...file, images, sources }, missing: [...missing] };
}

export function rewriteImageIds(file: ProjectFileV2, rename: ReadonlyMap<string, string>): ProjectFileV2 {
  if (rename.size === 0) return file;
  const fix = (ref: ImageRef): ImageRef => {
    const to = rename.get(ref.imageId);
    return to ? { ...ref, imageId: to } : ref;
  };
  const images: Record<string, PackagedImageMeta> = {};
  for (const [id, meta] of Object.entries(file.images)) {
    const to = rename.get(id) ?? id;
    images[to] = { ...meta, path: imageEntryPath(to, meta.mimeType) };
  }
  return { ...file, images, sources: mapRefs(file, fix) };
}
