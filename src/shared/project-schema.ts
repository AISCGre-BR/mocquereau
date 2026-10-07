// src/shared/project-schema.ts
//
// Project model shared by main and renderer. No Electron, no DOM, no Node.
// ProjectFileV2 is what lives in project.json inside a .mocquereau package
// (images referenced by imageId). SessionProject is the in-memory shape the
// renderer still uses in wave A2 (images inline as data URLs + optional imageId).

export const CURRENT_SCHEMA_VERSION = 2;
export const PACKAGE_MIMETYPE = "application/vnd.mocquereau.project+zip";

export type HyphenationMode =
  | "sung"
  | "liturgical-typographic"
  | "classical"
  | "modern"
  | "manual";

export type Notation = "adiastematic" | "diastematic" | "square" | "modern" | "other";

export interface SyllableBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  invert: boolean;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

/** Reference frame the syllable boxes of a line are expressed in (R1). */
export interface BoxFrame {
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

/** Image as referenced from project.json. */
export interface ImageRef {
  imageId: string;
  width: number;
  height: number;
  mimeType: string;
  /** True when the bytes are not available (placeholder in the UI). */
  missing?: boolean;
}

/** Image as the renderer holds it in wave A2. */
export interface InlineImage {
  dataUrl: string;
  imageId?: string;
  width: number;
  height: number;
  mimeType: string;
}

/** Bytes of one session image crossing the IPC boundary. */
export interface ImageBytesPayload {
  imageId: string;
  mimeType: string;
  bytes: ArrayBuffer;
}

export interface SyllabifiedWordData {
  original: string;
  syllables: string[];
}

export interface SectionData {
  id: string;
  name: string;
  wordRange: [number, number];
}

export interface ProjectMeta {
  title: string;
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface SourceMetadata {
  siglum: string;
  library: string;
  city: string;
  century: string;
  folio: string;
  cantusId?: string;
  sourceUrl?: string;
  iiifManifest?: string;
  notation: Notation;
}

export interface LineOf<I> {
  id: string;
  image: I;
  syllableRange: { start: number; end: number };
  dividers: number[];
  gaps: number[];
  syllableBoxes?: Record<number, SyllableBox | null>;
  folio?: string;
  label?: string;
  imageAdjustments?: ImageAdjustments;
  boxFrame?: BoxFrame;
  confirmed: boolean;
}

export interface SourceOf<I> {
  id: string;
  order: number;
  metadata: SourceMetadata;
  lines: LineOf<I>[];
  syllableCuts: Record<number, I | null>;
}

export interface ProjectBody<I> {
  meta: ProjectMeta;
  text: { raw: string; words: SyllabifiedWordData[]; hyphenationMode: HyphenationMode };
  sections: SectionData[];
  sources: SourceOf<I>[];
}

export interface PackagedImageMeta {
  path: string;
  mimeType: string;
  byteLength: number;
}

export interface ProjectFileV2 extends ProjectBody<ImageRef> {
  schemaVersion: 2;
  app: { name: "mocquereau"; version: string };
  images: Record<string, PackagedImageMeta>;
}

export type SessionProject = ProjectBody<InlineImage>;

export interface LineRef {
  sourceId: string;
  lineId: string;
}
