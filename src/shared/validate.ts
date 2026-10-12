// src/shared/validate.ts
//
// Hand-written validator for schemaVersion 3 project.json (no new dependency).
// Structural problems are errors (the file is refused); recoverable problems
// in optional fields become defaults plus a warning. Never mutates its input.
import { isAnnotationEmpty } from "./annotation/annotation";
import { DEFAULT_CATEGORY_NAMES } from "./annotation/default-vocabulary";
import type {
  Annotations, Certainty, ExportPrefs, Liquescence, NeumeCategory, NeumeItem, NeumeKind,
  NeumeVocabulary, SignificantLetter, SyllableAnnotation, Tag,
} from "./annotation/types";
import { orderNeumeBands } from "./band-order";
import {
  CURRENT_SCHEMA_VERSION,
  type BoxFrame,
  type HyphenationMode,
  type ImageAdjustments,
  type ImageRef,
  type LineOf,
  type Classification,
  type ClassLevel,
  type PackagedImageMeta,
  type ProjectFileV2,
  type SectionData,
  type SourceClasses,
  type SourceMetadata,
  type SourceOf,
  type SyllabifiedWordData,
  type SyllableBox,
} from "./project-schema";
import { IMAGE_ENTRY_RE, IMAGE_ID_RE } from "./image-id";
import { frameOf, hasAnyBox } from "./box-frame";
import { SUGGESTED_CLASSIFICATION, cloneClassification } from "./classification";

export type ValidationResult =
  | { ok: true; project: ProjectFileV2; warnings: string[] }
  | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

const HYPHENATION_MODES: readonly string[] = ["sung", "liturgical-typographic", "classical", "modern", "manual"];
const NUMERIC_KEY = /^\d+$/;

interface Ctx {
  errors: string[];
  warnings: string[];
}

function text(v: unknown, path: string, ctx: Ctx): string {
  if (isStr(v)) return v;
  ctx.warnings.push(`${path}: expected string, using ""`);
  return "";
}

function optText(v: unknown, path: string, ctx: Ctx): string | undefined {
  if (v === undefined) return undefined;
  if (isStr(v)) return v;
  ctx.warnings.push(`${path}: expected string, dropped`);
  return undefined;
}

function numberArray(v: unknown, path: string, ctx: Ctx): number[] {
  if (v === undefined) return [];
  if (Array.isArray(v) && v.every(isNum)) return v.slice();
  ctx.warnings.push(`${path}: expected number[], using []`);
  return [];
}

function isBox(v: unknown): v is SyllableBox {
  return isObj(v) && isNum(v.x) && isNum(v.y) && isNum(v.w) && isNum(v.h) && v.w >= 0 && v.h >= 0;
}

function isAdjustments(v: unknown): v is ImageAdjustments {
  return (
    isObj(v) && isNum(v.brightness) && isNum(v.contrast) && isNum(v.saturation) &&
    isNum(v.grayscale) && typeof v.invert === "boolean" && isNum(v.rotation) &&
    typeof v.flipH === "boolean" && typeof v.flipV === "boolean"
  );
}

function isFrame(v: unknown): v is BoxFrame {
  return isObj(v) && isNum(v.rotation) && typeof v.flipH === "boolean" && typeof v.flipV === "boolean";
}

function imageRef(v: unknown, path: string, onInvalid: (msg: string) => void): ImageRef | null {
  if (
    !isObj(v) || !isStr(v.imageId) || !IMAGE_ID_RE.test(v.imageId) ||
    !isNum(v.width) || !isNum(v.height) || v.width < 0 || v.height < 0 || !isStr(v.mimeType)
  ) {
    onInvalid(`${path}: invalid image reference`);
    return null;
  }
  const ref: ImageRef = { imageId: v.imageId, width: v.width, height: v.height, mimeType: v.mimeType };
  if (v.missing === true) ref.missing = true;
  return ref;
}

function boxes(v: unknown, path: string, ctx: Ctx): Record<number, SyllableBox | null> | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) {
    ctx.warnings.push(`${path}: expected object, dropped`);
    return undefined;
  }
  const out: Record<number, SyllableBox | null> = {};
  for (const [key, b] of Object.entries(v)) {
    if (!NUMERIC_KEY.test(key)) {
      ctx.warnings.push(`${path}.${key}: non-numeric key dropped`);
    } else if (b === null) {
      out[Number(key)] = null;
    } else if (isBox(b)) {
      out[Number(key)] = { x: b.x, y: b.y, w: b.w, h: b.h };
    } else {
      ctx.warnings.push(`${path}.${key}: invalid box dropped`);
    }
  }
  return out;
}

function readBands(v: unknown, path: string, ctx: Ctx): SyllableBox[] {
  if (!Array.isArray(v)) {
    ctx.warnings.push(`${path}: invalid, dropped`);
    return [];
  }
  const out: SyllableBox[] = [];
  v.forEach((b, i) => {
    if (!isObj(b) || !isNum(b.x) || !isNum(b.y) || !isNum(b.w) || !isNum(b.h)) {
      ctx.warnings.push(`${path}[${i}]: invalid, dropped`);
      return;
    }
    const x0 = Math.max(0, Math.min(1, b.x)), y0 = Math.max(0, Math.min(1, b.y));
    const x1 = Math.max(0, Math.min(1, b.x + b.w)), y1 = Math.max(0, Math.min(1, b.y + b.h));
    if (x1 - x0 <= 0 || y1 - y0 <= 0) {
      ctx.warnings.push(`${path}[${i}]: empty, dropped`);
      return;
    }
    // Inside [0,1]: keep w/h untouched (no float noise on round trips).
    const w = x0 === b.x && x1 === b.x + b.w ? b.w : x1 - x0;
    const h = y0 === b.y && y1 === b.y + b.h ? b.h : y1 - y0;
    out.push({ x: x0, y: y0, w, h });
  });
  return orderNeumeBands(out);
}

function line(v: unknown, path: string, ctx: Ctx): LineOf<ImageRef> | null {
  if (!isObj(v) || !isStr(v.id)) {
    ctx.errors.push(`${path}: line without id`);
    return null;
  }
  const image = imageRef(v.image, `${path}.image`, (m) => ctx.errors.push(m));
  const range = v.syllableRange;
  if (!isObj(range) || !isNum(range.start) || !isNum(range.end)) {
    ctx.errors.push(`${path}.syllableRange: invalid`);
    return null;
  }
  if (!image) return null;

  const out: LineOf<ImageRef> = {
    id: v.id,
    image,
    syllableRange: { start: range.start, end: range.end },
    dividers: numberArray(v.dividers, `${path}.dividers`, ctx),
    gaps: numberArray(v.gaps, `${path}.gaps`, ctx),
    confirmed: false,
  };
  const sb = boxes(v.syllableBoxes, `${path}.syllableBoxes`, ctx);
  if (sb) out.syllableBoxes = sb;
  const folio = optText(v.folio, `${path}.folio`, ctx);
  if (folio !== undefined) out.folio = folio;
  const label = optText(v.label, `${path}.label`, ctx);
  if (label !== undefined) out.label = label;
  if (v.notationOverride !== undefined) {
    if (v.notationOverride === "adiastematic" || v.notationOverride === "diastematic") out.notationOverride = v.notationOverride;
    else ctx.warnings.push(`${path}.notationOverride: invalid, dropped`);
  }
  if (v.neumeBands !== undefined) {
    const bands = readBands(v.neumeBands, `${path}.neumeBands`, ctx);
    if (bands.length) out.neumeBands = bands;
  }

  if (v.imageAdjustments !== undefined) {
    const a = v.imageAdjustments;
    if (isAdjustments(a)) {
      out.imageAdjustments = {
        brightness: a.brightness, contrast: a.contrast, saturation: a.saturation,
        grayscale: a.grayscale, invert: a.invert, rotation: a.rotation, flipH: a.flipH, flipV: a.flipV,
      };
    } else {
      ctx.warnings.push(`${path}.imageAdjustments: invalid, dropped`);
    }
  }

  if (v.boxFrame !== undefined) {
    if (isFrame(v.boxFrame)) {
      out.boxFrame = frameOf(v.boxFrame);
    } else {
      ctx.warnings.push(`${path}.boxFrame: invalid, derived from imageAdjustments`);
      if (hasAnyBox(sb)) out.boxFrame = frameOf(out.imageAdjustments);
    }
  } else if (hasAnyBox(sb)) {
    // Spec R1: boxes without a frame are in the current adjustments' frame.
    out.boxFrame = frameOf(out.imageAdjustments);
  }

  if (typeof v.confirmed === "boolean") {
    out.confirmed = v.confirmed;
  } else {
    out.confirmed = hasAnyBox(sb);
    ctx.warnings.push(`${path}.confirmed: missing, derived from boxes`);
  }
  return out;
}

function readLevel(v: unknown): ClassLevel | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.name) || !Array.isArray(v.values)) return null;
  const values: ClassLevel["values"] = [];
  for (const x of v.values) {
    if (!isObj(x) || !isStr(x.id) || !isStr(x.name)) return null;
    values.push({ id: x.id, name: x.name });
  }
  return { id: v.id, name: v.name, values };
}

/** Strict reader for a Classification (three levels); null when invalid. */
export function readClassification(v: unknown): Classification | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const levels = v.map(readLevel);
  if (levels.some((l) => l === null)) return null;
  return levels as Classification;
}

function classes(v: unknown, known: Set<string>[], path: string, ctx: Ctx): SourceClasses {
  const out: SourceClasses = [null, null, null];
  if (!Array.isArray(v)) {
    ctx.warnings.push(`${path}: missing, using none`);
    return out;
  }
  for (let i = 0; i < 3; i++) {
    const id = v[i];
    if (id === null || id === undefined) continue;
    if (isStr(id) && known[i].has(id)) out[i] = id;
    else ctx.warnings.push(`${path}[${i}]: unknown class ${String(id)}, cleared`);
  }
  return out;
}

const LIQ = new Set(["none", "augmentative", "diminutive"]);
const CERT = new Set(["secure", "probable", "illegible"]);

function strArray(v: unknown, path: string, ctx: Ctx): string[] | undefined {
  if (v === undefined) return undefined;
  if (Array.isArray(v) && v.every(isStr)) return [...v];
  ctx.warnings.push(`${path}: invalid, dropped`);
  return undefined;
}

function optPositiveInt(v: unknown, path: string, ctx: Ctx): number | undefined {
  if (v === undefined) return undefined;
  if (isNum(v) && Number.isInteger(v) && v >= 0) return v;
  ctx.warnings.push(`${path}: invalid, dropped`);
  return undefined;
}

function neumeItem(v: unknown, path: string, ctx: Ctx): NeumeItem | null {
  if (!isObj(v) || !isStr(v.kind) || v.kind === "") {
    ctx.warnings.push(`${path}: neume without kind, dropped`);
    return null;
  }
  const out: NeumeItem = { kind: v.kind };
  const notes = optPositiveInt(v.notes, `${path}.notes`, ctx);
  if (notes !== undefined) out.notes = notes;
  if (v.liquescence !== undefined) {
    if (isStr(v.liquescence) && LIQ.has(v.liquescence)) out.liquescence = v.liquescence as Liquescence;
    else ctx.warnings.push(`${path}.liquescence: invalid, dropped`);
  }
  if (v.episema !== undefined) {
    if (typeof v.episema === "boolean") out.episema = v.episema;
    else ctx.warnings.push(`${path}.episema: invalid, dropped`);
  }
  const letters = strArray(v.letters, `${path}.letters`, ctx);
  if (letters?.length) out.letters = letters;
  const tags = strArray(v.tags, `${path}.tags`, ctx);
  if (tags?.length) out.tags = tags;
  if (isStr(v.comment) && v.comment !== "") out.comment = v.comment;
  return out;
}

function annotation(v: unknown, path: string, ctx: Ctx): SyllableAnnotation | null {
  if (!isObj(v)) { ctx.warnings.push(`${path}: invalid, dropped`); return null; }
  const neumes: NeumeItem[] = [];
  if (Array.isArray(v.neumes)) v.neumes.forEach((n, i) => { const p = neumeItem(n, `${path}.neumes[${i}]`, ctx); if (p) neumes.push(p); });
  const out: SyllableAnnotation = { neumes, tags: strArray(v.tags, `${path}.tags`, ctx) ?? [] };
  const notes = optPositiveInt(v.notes, `${path}.notes`, ctx);
  if (notes !== undefined) out.notes = notes;
  if (v.certainty !== undefined) {
    if (isStr(v.certainty) && CERT.has(v.certainty)) out.certainty = v.certainty as Certainty;
    else ctx.warnings.push(`${path}.certainty: invalid, dropped`);
  }
  if (isStr(v.comment) && v.comment !== "") out.comment = v.comment;
  return isAnnotationEmpty(out) ? null : out;
}

export function readAnnotations(v: unknown, path: string, ctx: Ctx): Annotations | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) { ctx.warnings.push(`${path}: expected object, dropped`); return undefined; }
  const out: Annotations = {};
  for (const [key, a] of Object.entries(v)) {
    if (!NUMERIC_KEY.test(key)) { ctx.warnings.push(`${path}.${key}: non-numeric key dropped`); continue; }
    const parsed = annotation(a, `${path}.${key}`, ctx);
    if (parsed) out[Number(key)] = parsed;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Reads an array of entries; each is parsed by `parse` (null = invalid); first of duplicate ids wins. */
function readEntries<T extends { id: string }>(
  v: unknown, path: string, ctx: Ctx, parse: (e: Obj) => T | null,
): T[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) { ctx.warnings.push(`${path}: expected array, dropped`); return []; }
  const seen = new Set<string>();
  const out: T[] = [];
  v.forEach((e, i) => {
    const parsed = isObj(e) && isStr(e.id) ? parse(e) : null;
    if (!parsed) { ctx.warnings.push(`${path}[${i}]: invalid entry dropped`); return; }
    if (seen.has(parsed.id)) { ctx.warnings.push(`${path}[${i}]: duplicate id ${parsed.id} dropped`); return; }
    seen.add(parsed.id);
    out.push(parsed);
  });
  return out;
}

const withHidden = <T extends object>(e: Obj, base: T): T =>
  (typeof e.hidden === "boolean" ? { ...base, hidden: e.hidden } : base);

/** A default category carrying a default name of any locale (baked by older versions) is language-following. */
const isBakedDefaultName = (id: string, name: string): boolean =>
  (DEFAULT_CATEGORY_NAMES[id] ?? []).includes(name);

export function readVocabulary(v: unknown, ctx: Ctx): NeumeVocabulary | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v) || !Array.isArray(v.categories) || !Array.isArray(v.kinds) || !Array.isArray(v.letters)) {
    ctx.warnings.push("neumeVocabulary: invalid, dropped");
    return undefined;
  }
  const categories = readEntries<NeumeCategory>(v.categories, "neumeVocabulary.categories", ctx, (e) =>
    isStr(e.name) || e.name === undefined
      ? withHidden(e, isStr(e.name) && !isBakedDefaultName(e.id as string, e.name)
        ? { id: e.id as string, name: e.name }
        : { id: e.id as string })
      : null);
  // categoryId and defaultNotes are optional (absent stays absent), but validated when present.
  const kinds = readEntries<NeumeKind>(v.kinds, "neumeVocabulary.kinds", ctx, (e) => {
    if (!isStr(e.name)) return null;
    if (e.categoryId !== undefined && !isStr(e.categoryId)) return null;
    if (e.defaultNotes !== undefined && (!isNum(e.defaultNotes) || !Number.isInteger(e.defaultNotes) || e.defaultNotes < 0)) {
      return null;
    }
    const k: NeumeKind = withHidden(e, { id: e.id as string, name: e.name });
    if (isStr(e.categoryId)) k.categoryId = e.categoryId;
    if (isNum(e.defaultNotes)) k.defaultNotes = e.defaultNotes;
    if (isStr(e.equivalentTo)) k.equivalentTo = e.equivalentTo;
    return k;
  });
  const letters = readEntries<SignificantLetter>(v.letters, "neumeVocabulary.letters", ctx, (e) =>
    isStr(e.abbr) && isStr(e.meaning) ? withHidden(e, { id: e.id as string, abbr: e.abbr, meaning: e.meaning }) : null);

  const categoryIds = new Set(categories.map((c) => c.id));
  for (const k of kinds) {
    if (k.categoryId !== undefined && !categoryIds.has(k.categoryId)) {
      ctx.warnings.push(`neumeVocabulary.kinds.${k.id}.categoryId: unknown category, dropped`);
      delete k.categoryId;
    }
  }

  const ids = new Set(kinds.map((k) => k.id));
  for (const k of kinds) {
    if (k.equivalentTo !== undefined && (k.equivalentTo === k.id || !ids.has(k.equivalentTo))) {
      ctx.warnings.push(`neumeVocabulary.kinds.${k.id}.equivalentTo: invalid target, dropped`);
      delete k.equivalentTo;
    }
  }
  const byId = new Map(kinds.map((k) => [k.id, k]));
  for (const k of kinds) {
    if (k.equivalentTo === undefined) continue;
    const visited = new Set<string>([k.id]);
    let cur = byId.get(k.equivalentTo);
    while (cur) {
      if (cur.id === k.id) {
        ctx.warnings.push(`neumeVocabulary.kinds.${k.id}.equivalentTo: cycle, dropped`);
        delete k.equivalentTo;
        break;
      }
      if (visited.has(cur.id)) break; // joins a cycle that does not include k; handled from its own start
      visited.add(cur.id);
      cur = cur.equivalentTo === undefined ? undefined : byId.get(cur.equivalentTo);
    }
  }
  return { categories, kinds, letters };
}

export function readTags(v: unknown, ctx: Ctx): Tag[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) { ctx.warnings.push("tags: expected array, dropped"); return undefined; }
  return readEntries<Tag>(v, "tags", ctx, (e) => {
    if (!isStr(e.name)) return null;
    const t: Tag = { id: e.id as string, name: e.name };
    if (isStr(e.group)) t.group = e.group;
    if (isStr(e.description)) t.description = e.description;
    return t;
  });
}

function readExportPrefs(v: unknown, ctx: Ctx): ExportPrefs | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v) || (v.includeIndicators !== undefined && typeof v.includeIndicators !== "boolean")) {
    ctx.warnings.push("exportPrefs: invalid, dropped");
    return undefined;
  }
  return typeof v.includeIndicators === "boolean" ? { includeIndicators: v.includeIndicators } : {};
}

function source(v: unknown, index: number, known: Set<string>[], ctx: Ctx): SourceOf<ImageRef> | null {
  const path = `sources[${index}]`;
  if (!isObj(v) || !isStr(v.id)) {
    ctx.errors.push(`${path}: source without id`);
    return null;
  }
  let m: Obj = {};
  if (isObj(v.metadata)) m = v.metadata;
  else ctx.warnings.push(`${path}.metadata: missing`);
  const metadata: SourceMetadata = {
    siglum: text(m.siglum, `${path}.metadata.siglum`, ctx),
    library: text(m.library, `${path}.metadata.library`, ctx),
    city: text(m.city, `${path}.metadata.city`, ctx),
    century: text(m.century, `${path}.metadata.century`, ctx),
    classes: classes(m.classes, known, `${path}.metadata.classes`, ctx),
  };
  for (const key of ["cantusId", "sourceUrl", "iiifManifest", "folioHint"] as const) {
    const value = optText(m[key], `${path}.metadata.${key}`, ctx);
    if (value !== undefined) metadata[key] = value;
  }

  const lines: LineOf<ImageRef>[] = [];
  if (Array.isArray(v.lines)) {
    v.lines.forEach((l, i) => {
      const parsed = line(l, `${path}.lines[${i}]`, ctx);
      if (parsed) lines.push(parsed);
    });
  } else {
    ctx.warnings.push(`${path}.lines: missing, using []`);
  }

  const cuts: Record<number, ImageRef | null> = {};
  if (isObj(v.syllableCuts)) {
    for (const [key, c] of Object.entries(v.syllableCuts)) {
      if (!NUMERIC_KEY.test(key)) {
        ctx.warnings.push(`${path}.syllableCuts.${key}: non-numeric key dropped`);
      } else if (c === null) {
        cuts[Number(key)] = null;
      } else {
        const ref = imageRef(c, `${path}.syllableCuts.${key}`, (msg) => ctx.warnings.push(`${msg}, dropped`));
        if (ref) cuts[Number(key)] = ref;
      }
    }
  } else if (v.syllableCuts !== undefined) {
    ctx.warnings.push(`${path}.syllableCuts: expected object, using {}`);
  }

  const annotations = readAnnotations(v.annotations, `${path}.annotations`, ctx);
  return {
    id: v.id,
    order: isNum(v.order) ? v.order : index + 1,
    metadata,
    lines,
    syllableCuts: cuts,
    ...(annotations ? { annotations } : {}),
  };
}

export function validateProject(json: unknown): ValidationResult {
  const ctx: Ctx = { errors: [], warnings: [] };
  if (!isObj(json)) return { ok: false, errors: ["project is not an object"] };
  if (json.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return { ok: false, errors: [`unsupported schemaVersion ${String(json.schemaVersion)}`] };
  }
  const appVersion = isObj(json.app) && isStr(json.app.version) ? json.app.version : "unknown";

  let metaIn: Obj = {};
  if (isObj(json.meta)) metaIn = json.meta;
  else ctx.warnings.push("meta: missing");
  const meta = {
    title: text(metaIn.title, "meta.title", ctx),
    author: text(metaIn.author, "meta.author", ctx),
    createdAt: text(metaIn.createdAt, "meta.createdAt", ctx),
    updatedAt: text(metaIn.updatedAt, "meta.updatedAt", ctx),
  };

  const words: SyllabifiedWordData[] = [];
  let raw = "";
  let hyphenationMode: HyphenationMode = "manual";
  const t = json.text;
  if (!isObj(t) || !Array.isArray(t.words)) {
    ctx.errors.push("text.words: missing");
  } else {
    raw = text(t.raw, "text.raw", ctx);
    t.words.forEach((w, i) => {
      if (isObj(w) && isStr(w.original) && Array.isArray(w.syllables) && w.syllables.every(isStr)) {
        words.push({ original: w.original, syllables: (w.syllables as string[]).slice() });
      } else {
        ctx.errors.push(`text.words[${i}]: invalid word`);
      }
    });
    if (isStr(t.hyphenationMode) && HYPHENATION_MODES.includes(t.hyphenationMode)) {
      hyphenationMode = t.hyphenationMode as HyphenationMode;
    } else {
      ctx.warnings.push(`text.hyphenationMode: invalid (${String(t.hyphenationMode)}), using "manual"`);
    }
  }

  const sections: SectionData[] = [];
  if (Array.isArray(json.sections)) {
    json.sections.forEach((s, i) => {
      if (
        isObj(s) && isStr(s.id) && isStr(s.name) && Array.isArray(s.wordRange) &&
        s.wordRange.length === 2 && s.wordRange.every(isNum)
      ) {
        sections.push({ id: s.id, name: s.name, wordRange: [s.wordRange[0], s.wordRange[1]] });
      } else {
        ctx.warnings.push(`sections[${i}]: invalid section dropped`);
      }
    });
  } else {
    ctx.warnings.push("sections: missing, using []");
  }

  const images: Record<string, PackagedImageMeta> = {};
  if (isObj(json.images)) {
    for (const [id, m] of Object.entries(json.images)) {
      const match = isObj(m) && isStr(m.path) ? IMAGE_ENTRY_RE.exec(m.path) : null;
      if (IMAGE_ID_RE.test(id) && match && match[1] === id && isObj(m) && isStr(m.mimeType) && isNum(m.byteLength)) {
        images[id] = { path: m.path as string, mimeType: m.mimeType, byteLength: m.byteLength };
      } else {
        ctx.warnings.push(`images.${id}: invalid entry dropped`);
      }
    }
  } else if (json.images !== undefined) {
    ctx.warnings.push("images: expected object, using {}");
  }

  let classification: Classification;
  if (json.classification === undefined) {
    ctx.warnings.push("classification: missing, using suggested");
    classification = cloneClassification(SUGGESTED_CLASSIFICATION);
  } else {
    const read = readClassification(json.classification);
    if (read) {
      classification = read;
    } else {
      ctx.warnings.push("classification: invalid, using suggested");
      classification = cloneClassification(SUGGESTED_CLASSIFICATION);
    }
  }
  const known = classification.map((l) => new Set(l.values.map((x) => x.id)));

  const sources: SourceOf<ImageRef>[] = [];
  if (!Array.isArray(json.sources)) {
    ctx.errors.push("sources: missing");
  } else {
    json.sources.forEach((s, i) => {
      const parsed = source(s, i, known, ctx);
      if (parsed) sources.push(parsed);
    });
  }

  const neumeVocabulary = readVocabulary(json.neumeVocabulary, ctx);
  const tags = readTags(json.tags, ctx);
  const exportPrefs = readExportPrefs(json.exportPrefs, ctx);

  if (ctx.errors.length > 0) return { ok: false, errors: ctx.errors };
  return {
    ok: true,
    warnings: ctx.warnings,
    project: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      app: { name: "mocquereau", version: appVersion },
      meta,
      text: { raw, words, hyphenationMode },
      sections,
      classification,
      images,
      sources,
      ...(neumeVocabulary ? { neumeVocabulary } : {}),
      ...(tags ? { tags } : {}),
      ...(exportPrefs ? { exportPrefs } : {}),
    },
  };
}
