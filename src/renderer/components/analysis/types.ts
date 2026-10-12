// src/renderer/components/analysis/types.ts
import type { AnalysisFilters, OccurrenceQuery } from "@shared/analysis";
import type { NeumeVocabulary } from "@shared/annotation/types";
import type { MocquereauProject } from "../../lib/models";

/** What a number of the view drills into; "compared" = every syllable compared between two sources. */
export type DrillQuery = OccurrenceQuery | { kind: "compared"; a: string; b: string };

export interface BlockProps {
  project: MocquereauProject;
  filters: AnalysisFilters;
  vocabulary: NeumeVocabulary;
  onDrill: (q: DrillQuery) => void;
  className?: string;
}

/** Table classes shared by the blocks. */
export const TABLE = "w-full border-collapse font-sans text-sm text-ink";
export const TH_COL = "px-2 py-1.5 text-right font-serif text-sm font-normal text-ink-soft";
export const TH_ROW = "px-2 py-1 text-left font-normal";
export const TD = "px-2 py-1 text-right";
export const GROUP_ROW = "bg-parchment text-caption text-ink-muted";
