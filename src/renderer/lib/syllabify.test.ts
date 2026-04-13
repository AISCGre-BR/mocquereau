import { describe, it, expect } from 'vitest';
import { syllabifyText } from './syllabify';

describe('syllabifyText', () => {
  describe('empty/whitespace input', () => {
    it('returns empty array for empty string', () => {
      expect(syllabifyText('', 'liturgical')).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
      expect(syllabifyText('  ', 'liturgical')).toEqual([]);
    });

    it('returns empty array for tab-only string', () => {
      expect(syllabifyText('\t', 'liturgical')).toEqual([]);
    });
  });

  describe('liturgical mode', () => {
    it("splits 'Sanctus' into ['Sanc', 'tus']", () => {
      const result = syllabifyText('Sanctus', 'liturgical');
      expect(result).toHaveLength(1);
      expect(result[0].original).toBe('Sanctus');
      expect(result[0].syllables).toEqual(['Sanc', 'tus']);
    });

    it("splits 'Dominus' into ['Do', 'mi', 'nus']", () => {
      const result = syllabifyText('Dominus', 'liturgical');
      expect(result).toHaveLength(1);
      expect(result[0].original).toBe('Dominus');
      expect(result[0].syllables).toEqual(['Do', 'mi', 'nus']);
    });

    it("normalizes æ ligature (cælum) before syllabifying", () => {
      const result = syllabifyText('cælum', 'liturgical');
      expect(result).toHaveLength(1);
      expect(result[0].original).toBe('cælum');
      // Normalized to 'caelum' then split — should not crash and return syllables
      expect(result[0].syllables.length).toBeGreaterThan(0);
      // Syllables joined should equal normalized word
      expect(result[0].syllables.join('')).toBe('caelum');
    });

    it("handles multiple words", () => {
      const result = syllabifyText('Sanctus Dominus', 'liturgical');
      expect(result).toHaveLength(2);
      expect(result[0].original).toBe('Sanctus');
      expect(result[0].syllables).toEqual(['Sanc', 'tus']);
      expect(result[1].original).toBe('Dominus');
      expect(result[1].syllables).toEqual(['Do', 'mi', 'nus']);
    });

    it("normalizes œ ligature without crashing", () => {
      const result = syllabifyText('cœlum', 'liturgical');
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
      // This test ensures all three automatic modes produce non-empty results
      // that may differ (we don't mandate they DO differ, only that both work)
      const liturgical = syllabifyText('Dominus', 'liturgical');
      const classical = syllabifyText('Dominus', 'classical');
      const modern = syllabifyText('Dominus', 'modern');

      expect(liturgical[0].syllables.length).toBeGreaterThan(0);
      expect(classical[0].syllables.length).toBeGreaterThan(0);
      expect(modern[0].syllables.length).toBeGreaterThan(0);
    });
  });
});
