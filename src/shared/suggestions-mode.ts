// src/shared/suggestions-mode.ts
//
// M1: how the Recortes view suggests neumes. 'sequential' = one box per
// syllable in reading order; 'candidates' = every neume group of the areas,
// without a syllable (the user assigns them); 'off' = no worker, nothing shown.

export type SuggestionsMode = "sequential" | "candidates" | "off";

export const SUGGESTIONS_MODES: readonly SuggestionsMode[] = ["sequential", "candidates", "off"];

export function isSuggestionsMode(v: unknown): v is SuggestionsMode {
  return typeof v === "string" && (SUGGESTIONS_MODES as readonly string[]).includes(v);
}
