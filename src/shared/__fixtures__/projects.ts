// Test-only fixtures shared by shared/ and main/ tests. Not imported by app code.
import type { ProjectFileV2 } from "../project-schema";
import { MISSING_IMAGE_ID } from "../image-id";
import { SUGGESTED_CLASSIFICATION } from "../classification";

export const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4,
]);
export const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

export const ADJ_DEFAULT = {
  brightness: 100, contrast: 100, saturation: 100, grayscale: 0,
  invert: false, rotation: 0, flipH: false, flipV: false,
};

export function toDataUrl(mimeType: string, bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:${mimeType};base64,${btoa(bin)}`;
}

const METADATA = {
  siglum: "SG 339", library: "Stiftsbibliothek", city: "St. Gallen", century: "X",
};
/** Legacy (pre-v3) source metadata: folio and notation lived here. */
const LEGACY_METADATA = { ...METADATA, folio: "1r", notation: "adiastematic" };

/** A v0.0.7-era .mocquereau.json: shared image, mislabelled JPEG cut, -90 rotation. */
export function makeLegacyProject(): Record<string, unknown> {
  const png = toDataUrl("image/png", PNG_BYTES);
  return {
    meta: { title: "Puer natus", author: "G", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
    text: {
      raw: "Puer natus",
      words: [
        { original: "Puer", syllables: ["Pu", "er"] },
        { original: "natus", syllables: ["na", "tus"] },
      ],
      hyphenationMode: "liturgical",
    },
    sections: [],
    sources: [
      {
        id: "src-1",
        order: 1,
        metadata: { ...LEGACY_METADATA },
        lines: [
          {
            id: "line-a",
            image: { dataUrl: png, width: 200, height: 100, mimeType: "image/png" },
            syllableRange: { start: 0, end: 1 },
            dividers: [],
            gaps: [],
            syllableBoxes: { 0: { x: 0, y: 0, w: 0.25, h: 0.5 }, 1: null },
            imageAdjustments: { ...ADJ_DEFAULT, rotation: -90 },
            confirmed: true,
          },
          {
            id: "line-b",
            image: { dataUrl: png, width: 200, height: 100, mimeType: "image/png" },
            syllableRange: { start: 2, end: 3 },
            dividers: [],
            gaps: [],
            syllableBoxes: { 2: { x: 0.5, y: 0.1, w: 0.2, h: 0.3 } },
            imageAdjustments: { ...ADJ_DEFAULT, rotation: 17.5 },
            confirmed: true,
          },
        ],
        syllableCuts: {
          0: { dataUrl: toDataUrl("image/png", JPEG_BYTES), width: 10, height: 20, mimeType: "image/png" },
          1: null,
        },
      },
    ],
  };
}

export const IMG_A = "a".repeat(64);

/** A valid schemaVersion 3 project.json referencing one PNG image. */
export function makeV2Project(): ProjectFileV2 {
  return {
    schemaVersion: 3,
    app: { name: "mocquereau", version: "0.0.8-alpha" },
    meta: { title: "Puer natus", author: "G", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
    text: { raw: "Puer", words: [{ original: "Puer", syllables: ["Pu", "er"] }], hyphenationMode: "sung" },
    sections: [],
    classification: SUGGESTED_CLASSIFICATION,
    images: { [IMG_A]: { path: `images/${IMG_A}.png`, mimeType: "image/png", byteLength: 16 } },
    sources: [
      {
        id: "src-1",
        order: 1,
        metadata: { ...METADATA, classes: ["tipo.adiastematica", null, null] },
        lines: [
          {
            id: "line-a",
            image: { imageId: IMG_A, width: 200, height: 100, mimeType: "image/png" },
            syllableRange: { start: 0, end: 1 },
            dividers: [],
            gaps: [],
            syllableBoxes: { 0: { x: 0.5, y: 0, w: 0.5, h: 0.25 }, 1: null },
            imageAdjustments: { ...ADJ_DEFAULT, rotation: 90 },
            boxFrame: { rotation: 90, flipH: false, flipV: false },
            confirmed: true,
          },
        ],
        syllableCuts: {},
      },
    ],
  };
}

export const makeV3Project = makeV2Project;

/** A packaged v2 project.json (pre-classification), for the 2 -> 3 step. */
export function makeV2ProjectJson(): Record<string, unknown> {
  return {
    schemaVersion: 2,
    app: { name: "mocquereau", version: "0.0.7-alpha" },
    meta: { title: "T", author: "", createdAt: "", updatedAt: "" },
    text: { raw: "Pu er", words: [{ original: "Puer", syllables: ["Pu", "er"] }], hyphenationMode: "sung" },
    sections: [],
    images: {},
    sources: [
      {
        id: "s1", order: 1,
        metadata: { siglum: "A", library: "", city: "", century: "", folio: "12r", notation: "square" },
        lines: [
          { id: "l-big", image: { imageId: MISSING_IMAGE_ID, width: 2000, height: 1333, mimeType: "image/jpeg", missing: true },
            syllableRange: { start: 0, end: 1 }, dividers: [], gaps: [], confirmed: false },
          { id: "l-tiny-empty", image: { imageId: MISSING_IMAGE_ID, width: 442, height: 27, mimeType: "image/png", missing: true },
            syllableRange: { start: 0, end: 0 }, dividers: [], gaps: [], confirmed: false },
          { id: "l-tiny-boxed", image: { imageId: MISSING_IMAGE_ID, width: 400, height: 40, mimeType: "image/png", missing: true },
            syllableRange: { start: 0, end: 0 }, dividers: [], gaps: [],
            syllableBoxes: { 0: { x: 0, y: 0, w: 0.5, h: 1 } }, confirmed: true },
        ],
        syllableCuts: {},
      },
      {
        id: "s2", order: 2,
        metadata: { siglum: "B", library: "", city: "", century: "", folio: "3v", notation: "bogus" },
        lines: [
          { id: "l-own-folio", folio: "4r", image: { imageId: MISSING_IMAGE_ID, width: 800, height: 600, mimeType: "image/png", missing: true },
            syllableRange: { start: 0, end: 1 }, dividers: [], gaps: [], confirmed: false },
        ],
        syllableCuts: {},
      },
      {
        id: "s3", order: 3,
        metadata: { siglum: "C", library: "", city: "", century: "", folio: "9r", notation: "adiastematic" },
        lines: [],
        syllableCuts: {},
      },
    ],
  };
}
