import { describe, it, expect } from 'vitest';
import { syllabifyText } from './syllabify';

describe('syllabifyText', () => {
  describe('empty/whitespace input', () => {
    it('returns empty array for empty string', () => {
      expect(syllabifyText('', 'sung')).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
      expect(syllabifyText('  ', 'sung')).toEqual([]);
    });

    it('returns empty array for tab-only string', () => {
      expect(syllabifyText('\t', 'sung')).toEqual([]);
    });
  });

  describe('sung mode — Clayton Dias rules (Aula 7)', () => {
    // R1 (Clayton §1): 't' intervocalic goes with next vowel — "pot" + V → "po" + "tV".
    it("splits 'omnípotens' as ['om','ní','po','tens'] per R1", () => {
      const result = syllabifyText('omnípotens', 'sung');
      expect(result[0].syllables).toEqual(['om', 'ní', 'po', 'tens']);
    });

    // R2 (Clayton §1 over §4): ad + isolated vowel merges into one phonetic syllable.
    it("splits 'Adorámus' as ['A','do','rá','mus'] per R2", () => {
      const result = syllabifyText('Adorámus', 'sung');
      expect(result[0].syllables).toEqual(['A', 'do', 'rá', 'mus']);
    });

    // R9 (Clayton §1): 'n' intervocalic goes with next vowel; 'quon-i-am' → 'quo-ni-am'.
    it("splits 'Quóniam' as ['Quó','ni','am'] per R9", () => {
      const result = syllabifyText('Quóniam', 'sung');
      expect(result[0].syllables).toEqual(['Quó', 'ni', 'am']);
    });

    // R10 (Clayton §3): 'pt' is muta cum liquida → both consonants go with next vowel.
    it("splits 'propter' as ['pro','pter'] per R10", () => {
      const result = syllabifyText('propter', 'sung');
      expect(result[0].syllables).toEqual(['pro', 'pter']);
    });

    // R3 (Clayton §1 over §4): ab + isolated vowel merges.
    it("splits 'abire' as ['a','bi','re'] per R3", () => {
      const result = syllabifyText('abire', 'sung');
      expect(result[0].syllables).toEqual(['a', 'bi', 're']);
    });

    // R4: per + isolated vowel merges.
    it("splits 'pereo' as ['pe','re','o'] per R4", () => {
      const result = syllabifyText('pereo', 'sung');
      expect(result[0].syllables).toEqual(['pe', 're', 'o']);
    });

    // R5: sub + isolated vowel merges.
    it("splits 'subigo' as ['su','bi','go'] per R5", () => {
      const result = syllabifyText('subigo', 'sung');
      expect(result[0].syllables).toEqual(['su', 'bi', 'go']);
    });

    // R6: ob + isolated vowel merges.
    it("splits 'oboriri' as ['o','bo','ri','ri'] per R6", () => {
      const result = syllabifyText('oboriri', 'sung');
      expect(result[0].syllables).toEqual(['o', 'bo', 'ri', 'ri']);
    });

    // R7: trans + isolated vowel merges → 'tran-si-re'.
    it("splits 'transire' as ['tran','si','re'] per R7", () => {
      const result = syllabifyText('transire', 'sung');
      expect(result[0].syllables).toEqual(['tran', 'si', 're']);
    });

    // R8: red + isolated vowel merges.
    it("splits 'redire' as ['re','di','re'] per R8", () => {
      const result = syllabifyText('redire', 'sung');
      expect(result[0].syllables).toEqual(['re', 'di', 're']);
    });

    // No-op: Hypher output already matches the sung convention — leave alone.
    it("leaves 'Sanctus' as ['Sanc','tus'] (Clayton §5: 3 consonants = 1 + 2)", () => {
      const result = syllabifyText('Sanctus', 'sung');
      expect(result[0].syllables).toEqual(['Sanc', 'tus']);
    });

    it("leaves 'Dominus' as ['Do','mi','nus'] (Clayton §1, no rule triggers)", () => {
      const result = syllabifyText('Dominus', 'sung');
      expect(result[0].syllables).toEqual(['Do', 'mi', 'nus']);
    });

    it("leaves 'Glória' as ['Gló','ri','a'] (Clayton §1)", () => {
      const result = syllabifyText('Glória', 'sung');
      expect(result[0].syllables).toEqual(['Gló', 'ri', 'a']);
    });

    it("leaves 'excélsis' unchanged (Clayton §2 'x' with prior vowel)", () => {
      const result = syllabifyText('excélsis', 'sung');
      expect(result[0].syllables).toEqual(['ex', 'cél', 'sis']);
    });

    it("leaves 'Benedícimus' unchanged (Clayton §1 chain)", () => {
      const result = syllabifyText('Benedícimus', 'sung');
      expect(result[0].syllables).toEqual(['Be', 'ne', 'dí', 'ci', 'mus']);
    });

    it("leaves 'peccáta' unchanged (Clayton §3 geminate splits)", () => {
      const result = syllabifyText('peccáta', 'sung');
      expect(result[0].syllables).toEqual(['pec', 'cá', 'ta']);
    });

    it("leaves 'Deo' unchanged (Clayton §7 hiatus)", () => {
      const result = syllabifyText('Deo', 'sung');
      expect(result[0].syllables).toEqual(['De', 'o']);
    });

    it("leaves 'filium' unchanged (Clayton §1 chain)", () => {
      const result = syllabifyText('filium', 'sung');
      expect(result[0].syllables).toEqual(['fi', 'li', 'um']);
    });

    it("syllabifies 'alleluia' without crashing (Clayton §7 semivowel i)", () => {
      const result = syllabifyText('alleluia', 'sung');
      expect(result[0].syllables.length).toBeGreaterThan(0);
      expect(result[0].syllables.join('')).toBe('alleluia');
    });

    it("syllabifies 'cælum' without crashing (Clayton §7 digraph æ)", () => {
      const result = syllabifyText('cælum', 'sung');
      expect(result[0].syllables.length).toBeGreaterThan(0);
    });

    it("handles multiple words in 'Sanctus Dominus'", () => {
      const result = syllabifyText('Sanctus Dominus', 'sung');
      expect(result).toHaveLength(2);
      expect(result[0].syllables).toEqual(['Sanc', 'tus']);
      expect(result[1].syllables).toEqual(['Do', 'mi', 'nus']);
    });

    it("applies sung rules across multiple words", () => {
      const result = syllabifyText('omnípotens Adorámus', 'sung');
      expect(result[0].syllables).toEqual(['om', 'ní', 'po', 'tens']);
      expect(result[1].syllables).toEqual(['A', 'do', 'rá', 'mus']);
    });
  });

  describe('liturgical-typographic mode — regression (preserves Hypher+hyphen-la output)', () => {
    // These snapshots confirm we did not regress the pre-SYLL-06 behavior.
    it("leaves 'omnípotens' as Hypher's etymological ['om','ní','pot','ens']", () => {
      const result = syllabifyText('omnípotens', 'liturgical-typographic');
      expect(result[0].syllables).toEqual(['om', 'ní', 'pot', 'ens']);
    });

    it("leaves 'Adorámus' as Hypher's ['Ad','o','rá','mus']", () => {
      const result = syllabifyText('Adorámus', 'liturgical-typographic');
      expect(result[0].syllables).toEqual(['Ad', 'o', 'rá', 'mus']);
    });

    it("leaves 'Quóniam' as Hypher's ['Quón','i','am']", () => {
      const result = syllabifyText('Quóniam', 'liturgical-typographic');
      expect(result[0].syllables).toEqual(['Quón', 'i', 'am']);
    });

    it("leaves 'propter' as Hypher's ['prop','ter']", () => {
      const result = syllabifyText('propter', 'liturgical-typographic');
      expect(result[0].syllables).toEqual(['prop', 'ter']);
    });

    it("leaves 'Sanctus' as ['Sanc','tus'] (both modes agree)", () => {
      const result = syllabifyText('Sanctus', 'liturgical-typographic');
      expect(result[0].syllables).toEqual(['Sanc', 'tus']);
    });

    it("splits 'Dominus' into ['Do','mi','nus']", () => {
      const result = syllabifyText('Dominus', 'liturgical-typographic');
      expect(result).toHaveLength(1);
      expect(result[0].original).toBe('Dominus');
      expect(result[0].syllables).toEqual(['Do', 'mi', 'nus']);
    });

    it("normalizes æ ligature (cælum) before syllabifying", () => {
      const result = syllabifyText('cælum', 'liturgical-typographic');
      expect(result).toHaveLength(1);
      expect(result[0].original).toBe('cælum');
      expect(result[0].syllables.length).toBeGreaterThan(0);
      expect(result[0].syllables.join('')).toBe('caelum');
    });

    it("handles multiple words", () => {
      const result = syllabifyText('Sanctus Dominus', 'liturgical-typographic');
      expect(result).toHaveLength(2);
      expect(result[0].syllables).toEqual(['Sanc', 'tus']);
      expect(result[1].syllables).toEqual(['Do', 'mi', 'nus']);
    });

    it("normalizes œ ligature without crashing", () => {
      const result = syllabifyText('cœlum', 'liturgical-typographic');
      expect(result).toHaveLength(1);
      expect(result[0].syllables.length).toBeGreaterThan(0);
    });
  });

  describe('manual mode', () => {
    it("parses hyphenated input 'Sanc-tus Do-mi-nus'", () => {
      const result = syllabifyText('Sanc-tus Do-mi-nus', 'manual');
      expect(result).toHaveLength(2);
      expect(result[0].original).toBe('Sanctus');
      expect(result[0].syllables).toEqual(['Sanc', 'tus']);
      expect(result[1].original).toBe('Dominus');
      expect(result[1].syllables).toEqual(['Do', 'mi', 'nus']);
    });

    it("handles word with no hyphens in manual mode", () => {
      const result = syllabifyText('Sanctus', 'manual');
      expect(result).toHaveLength(1);
      expect(result[0].original).toBe('Sanctus');
      expect(result[0].syllables).toEqual(['Sanctus']);
    });

    it("does not call Hypher in manual mode (hyphens are the split points)", () => {
      // Test that manually hyphenated input is parsed as typed
      const result = syllabifyText('A-men', 'manual');
      expect(result[0].syllables).toEqual(['A', 'men']);
    });
  });

  describe('classical mode', () => {
    it("returns syllables for 'gloria' without crashing", () => {
      const result = syllabifyText('gloria', 'classical');
      expect(result).toHaveLength(1);
      expect(result[0].syllables.length).toBeGreaterThan(0);
    });

    it("has valid syllabification for 'Sanctus' in classical mode", () => {
      const result = syllabifyText('Sanctus', 'classical');
      expect(result).toHaveLength(1);
      expect(result[0].syllables.length).toBeGreaterThan(0);
    });
  });

  describe('modern mode', () => {
    it("returns syllables for 'gloria' without crashing", () => {
      const result = syllabifyText('gloria', 'modern');
      expect(result).toHaveLength(1);
      expect(result[0].syllables.length).toBeGreaterThan(0);
    });

    it("has valid syllabification for 'Sanctus' in modern mode", () => {
      const result = syllabifyText('Sanctus', 'modern');
      expect(result).toHaveLength(1);
      expect(result[0].syllables.length).toBeGreaterThan(0);
    });
  });

  describe('mode differences', () => {
    it("modes may produce different splits for the same word", () => {
      const sung = syllabifyText('Dominus', 'sung');
      const typographic = syllabifyText('Dominus', 'liturgical-typographic');
      const classical = syllabifyText('Dominus', 'classical');
      const modern = syllabifyText('Dominus', 'modern');

      expect(sung[0].syllables.length).toBeGreaterThan(0);
      expect(typographic[0].syllables.length).toBeGreaterThan(0);
      expect(classical[0].syllables.length).toBeGreaterThan(0);
      expect(modern[0].syllables.length).toBeGreaterThan(0);
    });

    it("sung and typographic diverge on 'omnípotens'", () => {
      const sung = syllabifyText('omnípotens', 'sung');
      const typographic = syllabifyText('omnípotens', 'liturgical-typographic');
      expect(sung[0].syllables).not.toEqual(typographic[0].syllables);
    });
  });
});
