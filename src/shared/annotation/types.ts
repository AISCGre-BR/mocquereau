// src/shared/annotation/types.ts
//
// Syllable annotation model (neume kind, notes, liquescence, significant letters, tags).
// Pure types: no Electron, no DOM, no Node.

export type Liquescence = "none" | "augmentative" | "diminutive";
export type Certainty = "secure" | "probable" | "illegible";

export interface NeumeItem {
  kind: string;
  notes?: number;
  liquescence?: Liquescence;
  episema?: boolean;
  /** 1-based positions of lengthened notes, sorted and unique; absent = not informed. */
  lengthened?: number[];
  letters?: string[];
  tags?: string[];
  comment?: string;
}

export interface SyllableAnnotation {
  neumes: NeumeItem[];
  notes?: number;
  certainty?: Certainty;
  tags: string[];
  comment?: string;
}

/** `name` absent on a default category (see DEFAULT_CATEGORY_KEYS): the label follows the app language. */
export interface NeumeCategory { id: string; name?: string; hidden?: boolean }
export interface NeumeKind {
  id: string;
  /** Absent: the kind has no category. */
  categoryId?: string;
  name: string;
  /** Absent: no default; an item without its own notes leaves the total undefined. */
  defaultNotes?: number;
  hidden?: boolean;
  /** Direct, non-transitive equivalences (kind ids); absent = none. */
  equivalentTo?: string[];
}
export interface SignificantLetter { id: string; abbr: string; meaning: string; hidden?: boolean }
export interface NeumeVocabulary {
  categories: NeumeCategory[];
  kinds: NeumeKind[];
  letters: SignificantLetter[];
}
export interface Tag { id: string; name: string; group?: string; description?: string }
export interface ExportPrefs { includeIndicators?: boolean }
export type Annotations = Record<number, SyllableAnnotation>;
