// Tests for the sung-mode post-processor rules.
// Reference: 08-SYLLABIFICATION-REFERENCE.md (Prof. Dr. Clayton Júnior Dias, Aula 7).
// Each rule undoes an etymological/typographic split produced by Hypher+hyphen-la
// in favor of the sung convention (AISCGre Brasil / Clayton Dias / Solesmes in
// chant books).

import { describe, it, expect } from 'vitest';
import {
  applyR1_potens,
  applyR2_adV,
  applyR3_abV,
  applyR4_perV,
  applyR5_subV,
  applyR6_obV,
  applyR7_transV,
  applyR8_redProdV,
  applyR9_quoniam,
  applyR10_mutaPT,
  applyR11_aeOeDigraph,
  applySungRules,
} from './syllabify-sung-rules';
import { normalizeOverrideKey, liturgicalOverrides } from './syllabify-overrides';

describe('R1 — pot-ens rule (Clayton §1: one intervocalic consonant + §3 muta cum liquida exclusions)', () => {
  it("transforms ['om','ní','pot','ens'] → ['om','ní','po','tens']", () => {
    // Clayton §1: 't' between 'o' and 'e' is one consonant intervocalic → goes with next vowel.
    expect(applyR1_potens(['om', 'ní', 'pot', 'ens'])).toEqual(['om', 'ní', 'po', 'tens']);
  });

  it("transforms ['pot','ens'] → ['po','tens'] (no accent)", () => {
    expect(applyR1_potens(['pot', 'ens'])).toEqual(['po', 'tens']);
  });

  it("transforms ['om','ni','pot','ens'] → ['om','ni','po','tens']", () => {
    expect(applyR1_potens(['om', 'ni', 'pot', 'ens'])).toEqual(['om', 'ni', 'po', 'tens']);
  });

  it("leaves ['Sanc','tus'] unchanged", () => {
    expect(applyR1_potens(['Sanc', 'tus'])).toEqual(['Sanc', 'tus']);
  });
});

describe('R2 — ad-V prefix merge (Clayton §1 applied over §4 composite prefix)', () => {
  it("transforms ['Ad','o','rá','mus'] → ['A','do','rá','mus'] (preserves initial case)", () => {
    // Clayton §1 prevails in sung convention: the composite is treated as one phonetic word.
    expect(applyR2_adV(['Ad', 'o', 'rá', 'mus'], 'Adorámus')).toEqual(['A', 'do', 'rá', 'mus']);
  });

  it("leaves ['ad','est'] unchanged (second syllable is 'est', length > 1)", () => {
    // Guard: merge only when second syllable is exactly one vowel.
    expect(applyR2_adV(['ad', 'est'], 'adest')).toEqual(['ad', 'est']);
  });

  it("leaves words not starting with 'ad' alone", () => {
    expect(applyR2_adV(['Sanc', 'tus'], 'Sanctus')).toEqual(['Sanc', 'tus']);
  });

  it("leaves single-syllable input unchanged", () => {
    expect(applyR2_adV(['ad'], 'ad')).toEqual(['ad']);
  });
});

describe('R3 — ab-V prefix merge, with abs- exception (Clayton §6)', () => {
  it("transforms ['ab','i','re'] → ['a','bi','re']", () => {
    expect(applyR3_abV(['ab', 'i', 're'], 'abire')).toEqual(['a', 'bi', 're']);
  });

  it("leaves 'abstineo' unchanged because of abs- prefix exception (Clayton §6)", () => {
    expect(applyR3_abV(['abs', 'ti', 'ne', 'o'], 'abstineo')).toEqual([
      'abs',
      'ti',
      'ne',
      'o',
    ]);
  });

  it("leaves words not starting with 'ab' alone", () => {
    expect(applyR3_abV(['Sanc', 'tus'], 'Sanctus')).toEqual(['Sanc', 'tus']);
  });
});

describe('R4 — per-V prefix merge', () => {
  it("transforms ['per','e','o'] → ['pe','re','o']", () => {
    expect(applyR4_perV(['per', 'e', 'o'], 'pereo')).toEqual(['pe', 're', 'o']);
  });

  it("leaves words not starting with 'per' alone", () => {
    expect(applyR4_perV(['Sanc', 'tus'], 'Sanctus')).toEqual(['Sanc', 'tus']);
  });
});

describe('R5 — sub-V prefix merge', () => {
  it("transforms ['sub','i','go'] → ['su','bi','go']", () => {
    expect(applyR5_subV(['sub', 'i', 'go'], 'subigo')).toEqual(['su', 'bi', 'go']);
  });

  it("leaves words not starting with 'sub' alone", () => {
    expect(applyR5_subV(['Sanc', 'tus'], 'Sanctus')).toEqual(['Sanc', 'tus']);
  });
});

describe('R6 — ob-V prefix merge', () => {
  it("transforms ['ob','o','ri','ri'] → ['o','bo','ri','ri']", () => {
    expect(applyR6_obV(['ob', 'o', 'ri', 'ri'], 'oboriri')).toEqual(['o', 'bo', 'ri', 'ri']);
  });

  it("leaves words not starting with 'ob' alone", () => {
    expect(applyR6_obV(['Sanc', 'tus'], 'Sanctus')).toEqual(['Sanc', 'tus']);
  });
});

describe('R7 — trans-V prefix merge', () => {
  it("transforms ['trans','i','re'] → ['tran','si','re']", () => {
    expect(applyR7_transV(['trans', 'i', 're'], 'transire')).toEqual(['tran', 'si', 're']);
  });

  it("leaves words not starting with 'trans' alone", () => {
    expect(applyR7_transV(['Sanc', 'tus'], 'Sanctus')).toEqual(['Sanc', 'tus']);
  });
});

describe('R8 — red- / prod- prefix merge', () => {
  it("transforms ['red','i','re'] → ['re','di','re']", () => {
    expect(applyR8_redProdV(['red', 'i', 're'], 'redire')).toEqual(['re', 'di', 're']);
  });

  it("transforms ['prod','i','re'] → ['pro','di','re']", () => {
    expect(applyR8_redProdV(['prod', 'i', 're'], 'prodire')).toEqual(['pro', 'di', 're']);
  });

  it("leaves words with other prefixes alone", () => {
    expect(applyR8_redProdV(['Sanc', 'tus'], 'Sanctus')).toEqual(['Sanc', 'tus']);
  });
});

describe('R9 — quon-iam / quon-i-am → quo-ni-am (Clayton §1)', () => {
  it("transforms ['Quón','i','am'] → ['Quó','ni','am'] (preserves accent and case)", () => {
    expect(applyR9_quoniam(['Quón', 'i', 'am'], 'Quóniam')).toEqual(['Quó', 'ni', 'am']);
  });

  it("transforms ['quon','iam'] → ['quo','ni','am']", () => {
    expect(applyR9_quoniam(['quon', 'iam'], 'quoniam')).toEqual(['quo', 'ni', 'am']);
  });

  it("leaves words not starting with 'quon' alone", () => {
    expect(applyR9_quoniam(['Sanc', 'tus'], 'Sanctus')).toEqual(['Sanc', 'tus']);
  });
});

describe('R10 — muta cum liquida pt (Clayton §3)', () => {
  it("transforms ['prop','ter'] → ['pro','pter']", () => {
    // Clayton §3: 'pt' is muta cum liquida → both consonants go with the next vowel.
    expect(applyR10_mutaPT(['prop', 'ter'])).toEqual(['pro', 'pter']);
  });

  it("leaves ['Sanc','tus'] unchanged (no p→t sequence)", () => {
    expect(applyR10_mutaPT(['Sanc', 'tus'])).toEqual(['Sanc', 'tus']);
  });
});

describe('applySungRules — pipeline', () => {
  it("leaves ['Sanc','tus'] unchanged (no rule matches)", () => {
    expect(applySungRules(['Sanc', 'tus'], 'Sanctus')).toEqual(['Sanc', 'tus']);
  });

  it("leaves ['Do','mi','nus'] unchanged (no rule matches)", () => {
    expect(applySungRules(['Do', 'mi', 'nus'], 'Dominus')).toEqual(['Do', 'mi', 'nus']);
  });

  it("composes R1 on 'omnípotens' Hypher output", () => {
    expect(applySungRules(['om', 'ní', 'pot', 'ens'], 'omnípotens')).toEqual([
      'om',
      'ní',
      'po',
      'tens',
    ]);
  });

  it("composes R2 on 'Adorámus' Hypher output", () => {
    expect(applySungRules(['Ad', 'o', 'rá', 'mus'], 'Adorámus')).toEqual([
      'A',
      'do',
      'rá',
      'mus',
    ]);
  });

  it("composes R9 on 'Quóniam' Hypher output", () => {
    expect(applySungRules(['Quón', 'i', 'am'], 'Quóniam')).toEqual(['Quó', 'ni', 'am']);
  });

  it("composes R10 on 'propter' Hypher output", () => {
    expect(applySungRules(['prop', 'ter'], 'propter')).toEqual(['pro', 'pter']);
  });
});

describe('normalizeOverrideKey', () => {
  it('lowercases and strips accents', () => {
    // Clayton lookup keys are normalized; accents preserved only in values.
    expect(normalizeOverrideKey('Adorámus')).toBe('adoramus');
  });

  it('expands æ ligature', () => {
    expect(normalizeOverrideKey('cælum')).toBe('caelum');
  });

  it('expands œ ligature', () => {
    expect(normalizeOverrideKey('cœlum')).toBe('coelum');
  });

  it('handles Capital + accent', () => {
    expect(normalizeOverrideKey('Quóniam')).toBe('quoniam');
  });
});

describe('liturgicalOverrides', () => {
  it('exports a Record<string, string[]>', () => {
    // Starts empty — populated on demand with comment citing Clayton rule.
    expect(typeof liturgicalOverrides).toBe('object');
    expect(liturgicalOverrides).not.toBeNull();
  });
});

describe('R11 — ae/oe digraph merge (Clayton §7 Dígrafos)', () => {
  it("merges ['bo','na','e'] → ['bo','nae'] for bonae", () => {
    expect(applyR11_aeOeDigraph(['bo', 'na', 'e'], 'bonae')).toEqual(['bo', 'nae']);
  });

  it("merges ['ca','e','li'] → ['cae','li'] for caeli", () => {
    expect(applyR11_aeOeDigraph(['ca', 'e', 'li'], 'caeli')).toEqual(['cae', 'li']);
  });

  it("merges ['co','e','nan','ti'] → ['coe','nan','ti'] for coenanti", () => {
    expect(applyR11_aeOeDigraph(['co', 'e', 'nan', 'ti'], 'coenanti')).toEqual(['coe', 'nan', 'ti']);
  });

  it("is idempotent: ['bo','nae'] stays ['bo','nae']", () => {
    expect(applyR11_aeOeDigraph(['bo', 'nae'], 'bonae')).toEqual(['bo', 'nae']);
  });

  it("preserves ['Is','ra','el'] for Israel (next syl is 'el' length 2, not digraph)", () => {
    // Hebrew proper noun — ae/el is not a digraph; without trema, the heuristic
    // uses next-syl-is-isolated-'e' to avoid false positives.
    expect(applyR11_aeOeDigraph(['Is', 'ra', 'el'], 'Israel')).toEqual(['Is', 'ra', 'el']);
  });

  it("preserves ['po','ë','ma'] for poëma (trema is a distinct character)", () => {
    expect(applyR11_aeOeDigraph(['po', 'ë', 'ma'], 'poëma')).toEqual(['po', 'ë', 'ma']);
  });

  it("applySungRules merges bonae end-to-end", () => {
    expect(applySungRules(['bo', 'na', 'e'], 'bonae')).toEqual(['bo', 'nae']);
  });
});
