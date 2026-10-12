// src/shared/annotation/annotation.ts
import type { SyllableAnnotation } from "./types";

/** An annotation with nothing filled in carries no information and is not stored. */
export function isAnnotationEmpty(a: SyllableAnnotation): boolean {
  return a.neumes.length === 0 && a.notes === undefined && a.certainty === undefined
    && a.tags.length === 0 && (a.comment ?? "") === "";
}
