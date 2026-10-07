// src/shared/legacy-frame.ts
//
// Spec R3: which frame are the boxes of a legacy (.mocquereau.json) line in?
// Up to v0.0.5 boxes were fractions of the ORIGINAL image; since v0.0.6 they
// are fractions of the rotated/flipped view AABB. Files carry no version.
import type { BoxFrame, SyllableBox } from "./project-schema";
import {
  IDENTITY_FRAME,
  frameOf,
  framesEqual,
  hasAnyBox,
  isQuarterTurn,
  remapBoxes,
  type Size,
} from "./box-frame";

export type LegacyFrameVerdict = "canonical" | "v006" | "ambiguous";

export interface LegacyLineLike {
  imageAdjustments?: Partial<BoxFrame> | null;
  syllableBoxes?: Record<number, SyllableBox | null> | null;
}

/** Until wave C scores ink coverage, ambiguous lines keep the v0.0.6+ reading. */
export const DEFAULT_AMBIGUOUS_POLICY = "v006" as const;

export function resolveLegacyFrame(line: LegacyLineLike): LegacyFrameVerdict {
  const frame = frameOf(line.imageAdjustments ?? undefined);
  if (!hasAnyBox(line.syllableBoxes) || framesEqual(frame, IDENTITY_FRAME)) return "canonical";
  if (!isQuarterTurn(frame.rotation)) return "v006";
  return "ambiguous";
}

/** boxFrame to store on a migrated line under the default policy. */
export function legacyBoxFrame(line: LegacyLineLike): BoxFrame | undefined {
  if (!hasAnyBox(line.syllableBoxes)) return undefined;
  return frameOf(line.imageAdjustments ?? undefined);
}

/** Boxes saved by v0.0.5 (original-image fractions) expressed in the view frame. */
export function reinterpretCanonicalBoxes(
  boxes: Record<number, SyllableBox | null>,
  img: Size,
  frame: BoxFrame,
): Record<number, SyllableBox | null> {
  return remapBoxes(boxes, img, IDENTITY_FRAME, frame);
}
