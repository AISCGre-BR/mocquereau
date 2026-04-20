// src/renderer/lib/syllabify-overrides.ts
// Override dictionary applied AFTER applySungRules, for words that escape the
// general rules (Greek transliterations, archaic forms, one-off idioms).
//
// Key: result of normalizeOverrideKey (lowercase, ligatures expanded, accents
//      stripped). Value: final syllable array (accents and case preserved).
//
// Initial state: EMPTY. Populate on demand only when a real test case fails.
// Every new entry MUST carry a comment citing the applicable Clayton Dias rule
// (08-SYLLABIFICATION-REFERENCE.md).

/** Normalize a word into the override dictionary's lookup key. */
export function normalizeOverrideKey(word: string): string {
  return word
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // remove combining diacritics
}

export const liturgicalOverrides: Record<string, string[]> = {
  // Entradas iniciais: NENHUMA.
  // Exemplo de entrada futura (mantida como comentário para referência):
  // Clayton §1 (1 consonante intervocálica): 't' entre 'o' e 'e' vai com vogal seguinte
  // 'iesus': ['Je', 'sus'],  // forma litúrgica "Je-", clássica "Ie-"
};
