// src/renderer/lib/syllabify-sung-rules.ts
// Post-processor for the "sung" syllabification mode.
//
// Applies a CLOSED set of rewrites over the Hypher+hyphen-la output to undo
// etymological/typographic splits that diverge from the sung convention
// (AISCGre Brasil / Clayton Júnior Dias / Solesmes in chant books).
//
// Each rule R<N> is a pure, testable function. Order of application matters
// (R1, R2, ..., R10). If no rule matches, the original output is preserved.
//
// Canonical reference: 08-SYLLABIFICATION-REFERENCE.md (Clayton Dias, Aula 7).
// External research: 08-SYLLABIFICATION-RESEARCH.md §Recommendations.

const VOWEL = /[aeiouáéíóúâêôãõAEIOUÁÉÍÓÚÂÊÔÃÕ]/;

function startsWith(s: string, prefix: string): boolean {
  return s.toLowerCase().startsWith(prefix.toLowerCase());
}

/** Lowercase + strip combining diacritics (case- and accent-insensitive prefix check). */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function startsWithAccentInsensitive(s: string, prefix: string): boolean {
  return stripAccents(s.toLowerCase()).startsWith(stripAccents(prefix.toLowerCase()));
}

/**
 * R1 — pot-ens rule (Clayton §1 + §3).
 * Hypher produces "...X-pot-ens" (etymological: stem pot- + suffix -ens).
 * Sung: "...X-po-tens" because 't' between vowels is one intervocalic
 * consonant and goes with the next vowel (§1).
 * Applies to any syllable exactly equal to "pot" followed by a syllable that
 * starts with a vowel. Preserves case/accent on the surrounding syllables.
 */
export function applyR1_potens(syls: string[]): string[] {
  const out = [...syls];
  for (let i = 0; i < out.length - 1; i++) {
    const cur = out[i];
    const next = out[i + 1];
    if (cur.toLowerCase() === 'pot' && next.length > 0 && VOWEL.test(next[0])) {
      // Move 't' from cur to next: "pot" + "ens" → "po" + "tens".
      out[i] = cur.slice(0, -1);
      out[i + 1] = 't' + next;
    }
  }
  return out;
}

/**
 * R2 — ad-V prefix merge (Clayton §1 over §4).
 * Applies only when the WORD starts with "ad" and the first syllable is
 * exactly "ad"/"Ad" followed by a syllable that is a single isolated vowel.
 * Merges: ["Ad","o","rá","mus"] → ["A","do","rá","mus"].
 *
 * Guard: second syllable must be length 1 (a bare vowel). This preserves
 * forms like "adest" → ["ad","est"], where 'est' is length 3.
 */
export function applyR2_adV(syls: string[], word: string): string[] {
  if (syls.length < 2) return syls;
  if (!startsWith(word, 'ad')) return syls;
  const first = syls[0];
  const second = syls[1];
  if (first.length !== 2 || !startsWith(first, 'ad')) return syls;
  if (second.length !== 1) return syls;
  if (!VOWEL.test(second[0])) return syls;
  const firstChar = first[0]; // preserves case ("A" / "a")
  return [firstChar, first[1] + second, ...syls.slice(2)];
}

/**
 * R3 — ab-V prefix merge.
 * Does NOT apply to words starting with "abs" (Clayton §6: abs- is preserved
 * as a prefix). Guard: second syllable must be a single isolated vowel.
 */
export function applyR3_abV(syls: string[], word: string): string[] {
  if (syls.length < 2) return syls;
  if (!startsWith(word, 'ab') || startsWith(word, 'abs')) return syls;
  const first = syls[0];
  const second = syls[1];
  if (first.length !== 2 || !startsWith(first, 'ab')) return syls;
  if (second.length !== 1) return syls;
  if (!VOWEL.test(second[0])) return syls;
  const firstChar = first[0];
  return [firstChar, first[1] + second, ...syls.slice(2)];
}

/** R4 — per-V prefix merge. Guard: second syllable must be a single vowel. */
export function applyR4_perV(syls: string[], word: string): string[] {
  if (syls.length < 2) return syls;
  if (!startsWith(word, 'per')) return syls;
  const first = syls[0];
  const second = syls[1];
  if (first.length !== 3 || !startsWith(first, 'per')) return syls;
  if (second.length !== 1) return syls;
  if (!VOWEL.test(second[0])) return syls;
  // "per" + "e..." → "pe" + "re...".
  return [first.slice(0, 2), first[2] + second, ...syls.slice(2)];
}

/** R5 — sub-V prefix merge. Guard: second syllable must be a single vowel. */
export function applyR5_subV(syls: string[], word: string): string[] {
  if (syls.length < 2) return syls;
  if (!startsWith(word, 'sub')) return syls;
  const first = syls[0];
  const second = syls[1];
  if (first.length !== 3 || !startsWith(first, 'sub')) return syls;
  if (second.length !== 1) return syls;
  if (!VOWEL.test(second[0])) return syls;
  return [first.slice(0, 2), first[2] + second, ...syls.slice(2)];
}

/** R6 — ob-V prefix merge. Guard: second syllable must be a single vowel. */
export function applyR6_obV(syls: string[], word: string): string[] {
  if (syls.length < 2) return syls;
  if (!startsWith(word, 'ob')) return syls;
  const first = syls[0];
  const second = syls[1];
  if (first.length !== 2 || !startsWith(first, 'ob')) return syls;
  if (second.length !== 1) return syls;
  if (!VOWEL.test(second[0])) return syls;
  const firstChar = first[0];
  return [firstChar, first[1] + second, ...syls.slice(2)];
}

/** R7 — trans-V prefix merge. Guard: second syllable must be a single vowel. */
export function applyR7_transV(syls: string[], word: string): string[] {
  if (syls.length < 2) return syls;
  if (!startsWith(word, 'trans')) return syls;
  const first = syls[0];
  const second = syls[1];
  if (first.length !== 5 || !startsWith(first, 'trans')) return syls;
  if (second.length !== 1) return syls;
  if (!VOWEL.test(second[0])) return syls;
  // "trans" + "i..." → "tran" + "si...".
  return [first.slice(0, 4), first[4] + second, ...syls.slice(2)];
}

/** R8 — red- / prod- prefix merge. Guard: second syllable must be a single vowel. */
export function applyR8_redProdV(syls: string[], word: string): string[] {
  if (syls.length < 2) return syls;
  const pref = startsWith(word, 'red') ? 'red' : startsWith(word, 'prod') ? 'prod' : null;
  if (!pref) return syls;
  const first = syls[0];
  const second = syls[1];
  if (first.length !== pref.length || !startsWith(first, pref)) return syls;
  if (second.length !== 1) return syls;
  if (!VOWEL.test(second[0])) return syls;
  // "red"+"i..." → "re"+"di..."; "prod"+"i..." → "pro"+"di...".
  const keep = first.slice(0, pref.length - 1);
  const moved = first.slice(pref.length - 1);
  return [keep, moved + second, ...syls.slice(2)];
}

/**
 * R9 — quon-i-am / quon-iam → quo-ni-am (Clayton §1).
 * Hypher for "quoniam" yields either ["quon","i","am"] or ["quon","iam"].
 * The sung form is ["quo","ni","am"]: 'n' is one intervocalic consonant and
 * goes with the next vowel.
 */
export function applyR9_quoniam(syls: string[], word: string): string[] {
  if (syls.length < 2) return syls;
  // Accent-insensitive: 'quon' must match even when Hypher emits "Quón" with accent.
  if (!startsWithAccentInsensitive(word, 'quon')) return syls;
  const first = syls[0];
  if (!startsWithAccentInsensitive(first, 'quon')) return syls;
  const rest = syls.slice(1);

  // Case A: ["Quón","i","am"] (3+ syllables).
  if (
    syls.length >= 3 &&
    rest[0].toLowerCase() === 'i' &&
    rest[1].toLowerCase().startsWith('am')
  ) {
    // "Quón"+"i"+"am" → "Quó"+"ni"+"am".
    return [first.slice(0, -1), first[first.length - 1] + rest[0], ...syls.slice(2)];
  }

  // Case B: ["quon","iam"].
  if (rest[0].length >= 2 && VOWEL.test(rest[0][0])) {
    const newFirst = first.slice(0, -1); // "Quo"
    const newSecond = first[first.length - 1] + rest[0]; // "n" + "iam" = "niam"
    if (newSecond.length >= 3 && newSecond.toLowerCase().endsWith('iam')) {
      // Break "niam" into "ni" + "am" (4 chars: n-i-a-m → "ni","am").
      return [newFirst, newSecond.slice(0, 2), newSecond.slice(2), ...syls.slice(2)];
    }
    return [newFirst, newSecond, ...syls.slice(2)];
  }
  return syls;
}

/**
 * R10 — muta cum liquida pt (Clayton §3).
 * Hypher yields "prop-ter"; sung yields "pro-pter" because 'pt' is muta cum
 * liquida (both consonants go with the next vowel).
 * Applies whenever a syllable ends in 'p' and is followed by a syllable that
 * begins with 't' + a vowel.
 */
export function applyR10_mutaPT(syls: string[]): string[] {
  const out = [...syls];
  for (let i = 0; i < out.length - 1; i++) {
    const cur = out[i];
    const next = out[i + 1];
    if (
      cur.toLowerCase().endsWith('p') &&
      next.length >= 2 &&
      next[0].toLowerCase() === 't' &&
      VOWEL.test(next[1])
    ) {
      out[i] = cur.slice(0, -1); // drop trailing 'p'
      out[i + 1] = 'p' + next; // prepend 'p' to next
    }
  }
  return out;
}

/**
 * R11 — ae/oe digraph merge (Clayton §7 Dígrafos).
 *
 * Latin `ae` and `oe` are single-syllable digraphs pronounced [ɛ]
 * (bo-nae, cæ-li, cœ-lum). Hypher sometimes splits them as two vowels
 * (`bo-na-e`). Merge adjacent syllables that end in `a`/`o` and start
 * with `e` WHEN the original word has literal `ae`/`oe` at that boundary.
 *
 * The word-position check naturally excludes trema cases (poëma,
 * Michaël) because `ë` is a different character than `e` in the string.
 *
 * Applies only to 'sung' mode; typographic convention legitimately
 * allows splitting for line-breaking.
 */
export function applyR11_aeOeDigraph(syls: string[], word: string): string[] {
  const out: string[] = [];
  let i = 0;
  const lowerWord = word.toLowerCase();
  while (i < syls.length) {
    const cur = syls[i];
    const next = syls[i + 1];
    if (next !== undefined) {
      const lastOfCur = cur.slice(-1).toLowerCase();
      // Conservative: only merge when the next syllable is an isolated 'e' (length 1).
      // This catches the Hypher split artifact 'bo|na|e' / 'ca|e|li' while leaving
      // proper-noun compounds like 'Is-ra-el' (next='el', length 2) untouched.
      const isIsolatedE = next.length === 1 && next.toLowerCase() === 'e';
      const isDigraph = isIsolatedE && (lastOfCur === 'a' || lastOfCur === 'o');
      if (isDigraph) {
        // Verify against original word — position of the 'e' at the join.
        const posAtNext = out.reduce((acc, s) => acc + s.length, 0) + cur.length;
        if (lowerWord[posAtNext] === 'e') {
          out.push(cur + next);
          i += 2;
          continue;
        }
      }
    }
    out.push(cur);
    i += 1;
  }
  return out;
}

/**
 * Pipeline: applies all rules in order.
 * If a rule transforms the input, subsequent rules operate on the output.
 * If nothing matches, the input is returned unchanged.
 */
export function applySungRules(syllables: string[], originalWord: string): string[] {
  let s = syllables;
  s = applyR1_potens(s);
  s = applyR2_adV(s, originalWord);
  s = applyR3_abV(s, originalWord);
  s = applyR4_perV(s, originalWord);
  s = applyR5_subV(s, originalWord);
  s = applyR6_obV(s, originalWord);
  s = applyR7_transV(s, originalWord);
  s = applyR8_redProdV(s, originalWord);
  s = applyR9_quoniam(s, originalWord);
  s = applyR10_mutaPT(s);
  s = applyR11_aeOeDigraph(s, originalWord);
  return s;
}
