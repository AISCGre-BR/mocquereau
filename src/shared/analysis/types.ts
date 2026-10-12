// src/shared/analysis/types.ts
//
// Analysis model: project + filters -> indicators. Pure types.
// Percentages are fractions in [0, 1]; null when the denominator is 0.
import type { Certainty, SyllableAnnotation } from "../annotation/types";

export type Unset = "unset";

export interface AnalysisFilters {
  /** Empty/absent = all sources. */
  sourceIds?: string[];
  /** A source passes if it has any of these values at any classification level. */
  classValueIds?: string[];
  /** Section ids; "none" selects syllables outside every section. */
  sectionIds?: string[];
  /** A syllable passes if it (or one of its neumes) has any of these tags. */
  tagIds?: string[];
  /** Missing certainty (and unannotated syllables) count as "unset". */
  certainty?: Array<Certainty | Unset>;
}

export interface Cell {
  sourceId: string;
  syllable: number;
  sectionId: string | null;
  hasBox: boolean;
  annotation?: SyllableAnnotation;
}

export interface ProgressRow {
  key: string;
  label: string;
  total: number;
  withBox: number;
  annotated: number;
  illegible: number;
  missing: number;
}

/** percent = count / annotated syllables of the source. */
export interface CountCell { count: number; percent: number | null }

export interface KindRow {
  kindId: string;
  name: string;
  categoryId: string | null;
  /** Names of the kinds it is directly equivalent to (in its own list order). */
  equivalentNames?: string[];
  unknown?: boolean;
  bySource: Record<string, CountCell>;
  total: number;
}

export interface MarkRow { key: string; bySource: Record<string, number> }

export interface Agreement { compared: number; agree: number; percent: number | null }

export interface AgreementMatrix {
  ids: string[];
  matrix: Record<string, Record<string, Agreement>>;
}

export interface DivergentSyllable { syllable: number; readings: number; sources: number }

export interface TagCountRow {
  tagId: string;
  name: string;
  group: string | null;
  bySource: Record<string, number>;
  unknown?: boolean;
}

export type OccurrenceQuery =
  | { kind: "progress"; status: "annotated" | "illegible" | "missing" | "withBox"; sourceId?: string; sectionId?: string }
  | { kind: "neume"; kindId: string; sourceId?: string }
  | { kind: "mark"; key: string; sourceId?: string }
  | { kind: "pair"; a: string; b: string; agree: boolean }
  | { kind: "syllable"; syllable: number }
  | { kind: "tag"; tagId: string; sourceId?: string };

export interface Occurrence { sourceId: string; syllable: number }
