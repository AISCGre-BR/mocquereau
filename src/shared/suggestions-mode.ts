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

/** The stored mode; else the old suggestionsEnabled: false = 'off' (silent read); else 'sequential'. */
export function readSuggestionsMode(stored: { suggestionsMode?: unknown; suggestionsEnabled?: unknown }): SuggestionsMode {
  if (isSuggestionsMode(stored.suggestionsMode)) return stored.suggestionsMode;
  return stored.suggestionsEnabled === false ? "off" : "sequential";
}
