// src/shared/migrations.ts
//
// Opening chain: legacy .mocquereau.json (no schemaVersion) -> v3, packaged
// v2 -> v3, and schema checks for packaged project.json. Pure: no fs, no Electron; image
// bytes are returned to the caller, which stores them in the session.
import {
  CURRENT_SCHEMA_VERSION,
  type BoxFrame,
  type LineRef,
  type ProjectFileV2,
  type SyllableBox,
} from "./project-schema";
import {
  MISSING_IMAGE_ID,
  decodeDataUrl,
  imageEntryPath,
  resolveImageMime,
  sha256Hex,
} from "./image-id";
import { normalizeRotation } from "./box-frame";
import { legacyBoxFrame, resolveLegacyFrame } from "./legacy-frame";
import { validateProject } from "./validate";
import { SUGGESTED_CLASSIFICATION, cloneClassification, notationToClassId } from "./classification";

export type MigrationErrorCode = "invalid" | "newer" | "not-legacy";

export class MigrationError extends Error {
  constructor(
    readonly code: MigrationErrorCode,
    message: string,
    readonly details: string[] = [],
    readonly version?: string,
  ) {
    super(message);
    this.name = "MigrationError";
  }
}

export interface MigratedImage {
  bytes: Uint8Array;
  mimeType: string;
}

export interface LegacyMigrationResult {
  project: ProjectFileV2;
  images: Map<string, MigratedImage>;
  ambiguousLines: LineRef[];
  warnings: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Pages this short with no box are accidental pastes (spec R24). */
export const TINY_PAGE_MAX_HEIGHT = 64;

function lineHasBox(line: Obj): boolean {
  return isObj(line.syllableBoxes) && Object.values(line.syllableBoxes).some((b) => b !== null);
}

/** Schema 2 (or legacy, already rewritten) -> 3. Mutates the raw JSON. Silent (spec R25). */
export function upgradeRawToV3(raw: Obj, warnings: string[]): void {
  if (!Array.isArray(raw.classification)) raw.classification = cloneClassification(SUGGESTED_CLASSIFICATION);
  const sources = Array.isArray(raw.sources) ? raw.sources : [];
  for (const src of sources) {
    if (!isObj(src)) continue;
    if (!isObj(src.metadata)) src.metadata = {};
    const m = src.metadata as Obj;
    if (!Array.isArray(m.classes)) m.classes = [notationToClassId(m.notation), null, null];
    delete m.notation;

    if (Array.isArray(src.lines)) {
      const before = src.lines.length;
      const kept = src.lines.filter((l: unknown) => {
        if (!isObj(l)) return true;
        const h = isObj(l.image) && typeof l.image.height === "number" ? l.image.height : Infinity;
        return !(h < TINY_PAGE_MAX_HEIGHT && !lineHasBox(l));
      });
      src.lines = kept;
      if (kept.length !== before) {
        warnings.push(`source ${String(src.id)}: removed ${before - kept.length} tiny empty page(s)`);
      }
    }

    const folio = typeof m.folio === "string" ? m.folio.trim() : "";
    delete m.folio;
    if (folio) {
      const lines: Obj[] = Array.isArray(src.lines) ? (src.lines as unknown[]).filter(isObj) : [];
      const target = lines.find((l) => typeof l.folio !== "string" || l.folio.trim() === "");
      if (target) target.folio = folio;
      else if (lines.length === 0) m.folioHint = folio;
    }
  }
  raw.schemaVersion = 3;
}

export function assertSupportedSchema(json: unknown): void {
  if (!isObj(json)) throw new MigrationError("invalid", "project.json is not an object");
  const v = json.schemaVersion;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
    throw new MigrationError("invalid", "schemaVersion missing or invalid");
  }
  if (v > CURRENT_SCHEMA_VERSION) {
    const version = isObj(json.app) && typeof json.app.version === "string" ? json.app.version : `schema ${v}`;
    throw new MigrationError("newer", `project was created by a newer version (${version})`, [], version);
  }
}

export function migrateToCurrent(json: unknown): { project: ProjectFileV2; warnings: string[] } {
  assertSupportedSchema(json);
  const raw = structuredClone(json) as Obj;
  const warnings: string[] = [];
  if (raw.schemaVersion === 2) upgradeRawToV3(raw, warnings);
  const result = validateProject(raw);
  if (!result.ok) throw new MigrationError("invalid", "invalid project.json", result.errors);
  return { project: result.project, warnings: [...warnings, ...result.warnings] };
}

export async function migrateLegacyProject(json: unknown): Promise<LegacyMigrationResult> {
  if (!isObj(json)) throw new MigrationError("invalid", "legacy file is not a JSON object");
  if ("schemaVersion" in json) throw new MigrationError("not-legacy", "file already has schemaVersion");

  const raw = structuredClone(json) as Obj;
  const warnings: string[] = [];
  const images = new Map<string, MigratedImage>();
  const ambiguousLines: LineRef[] = [];

  if (isObj(raw.text) && raw.text.hyphenationMode === "liturgical") {
    // SYLL-06: v1.0 "liturgical" is the same behaviour later renamed.
    raw.text.hyphenationMode = "liturgical-typographic";
  }

  async function toRef(img: unknown, path: string): Promise<unknown> {
    if (!isObj(img)) return img; // validateProject reports it
    const width = typeof img.width === "number" ? img.width : 0;
    const height = typeof img.height === "number" ? img.height : 0;
    const declared = typeof img.mimeType === "string" ? img.mimeType : undefined;
    const decoded = typeof img.dataUrl === "string" ? decodeDataUrl(img.dataUrl) : null;
    const mimeType =
      decoded && decoded.bytes.byteLength > 0 ? resolveImageMime(decoded.bytes, decoded.mimeType) : null;
    if (!decoded || !mimeType) {
      warnings.push(`${path}: image could not be decoded, kept as missing`);
      return { imageId: MISSING_IMAGE_ID, width, height, mimeType: declared ?? "image/png", missing: true };
    }
    const imageId = await sha256Hex(decoded.bytes);
    if (!images.has(imageId)) images.set(imageId, { bytes: decoded.bytes, mimeType });
    return { imageId, width, height, mimeType };
  }

  const sources = Array.isArray(raw.sources) ? raw.sources : [];
  for (const [si, src] of sources.entries()) {
    if (!isObj(src)) continue;
    const lines = Array.isArray(src.lines) ? src.lines : [];
    for (const [li, line] of lines.entries()) {
      if (!isObj(line)) continue;
      line.image = await toRef(line.image, `sources[${si}].lines[${li}].image`);
      const adj = isObj(line.imageAdjustments) ? line.imageAdjustments : undefined;
      if (adj && typeof adj.rotation === "number") adj.rotation = normalizeRotation(adj.rotation);
      const frameInput = {
        imageAdjustments: adj as Partial<BoxFrame> | undefined,
        syllableBoxes: isObj(line.syllableBoxes)
          ? (line.syllableBoxes as Record<number, SyllableBox | null>)
          : undefined,
      };
      const frame = legacyBoxFrame(frameInput);
      if (frame) line.boxFrame = frame;
      if (
        resolveLegacyFrame(frameInput) === "ambiguous" &&
        typeof src.id === "string" &&
        typeof line.id === "string"
      ) {
        ambiguousLines.push({ sourceId: src.id, lineId: line.id });
      }
    }
    if (isObj(src.syllableCuts)) {
      for (const key of Object.keys(src.syllableCuts)) {
        const cut = src.syllableCuts[key];
        if (cut !== null) src.syllableCuts[key] = await toRef(cut, `sources[${si}].syllableCuts.${key}`);
      }
    }
  }

  raw.images = Object.fromEntries(
    [...images].map(([id, img]) => [
      id,
      { path: imageEntryPath(id, img.mimeType), mimeType: img.mimeType, byteLength: img.bytes.byteLength },
    ]),
  );
  upgradeRawToV3(raw, warnings);
  raw.app = { name: "mocquereau", version: "legacy" };

  const result = validateProject(raw);
  if (!result.ok) throw new MigrationError("invalid", "legacy project is invalid", result.errors);
  return { project: result.project, images, ambiguousLines, warnings: [...warnings, ...result.warnings] };
}
