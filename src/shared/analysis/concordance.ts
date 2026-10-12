// src/shared/analysis/concordance.ts
//
// Agreement between sources: identical neume sequences after resolving equivalences.
// Only syllables where both sources have at least one neume are compared.
import type { ProjectBody } from "../project-schema";
import type { NeumeVocabulary } from "../annotation/types";
import { resolveEquivalent } from "../annotation/vocabulary";
import type { Agreement, AgreementMatrix, AnalysisFilters, DivergentSyllable } from "./types";
import { FAMILY_LEVEL_ID, NO_FAMILY, familyOf, selectCells } from "./cells";

/** sourceId -> syllable -> canonical reading (resolved kinds), only for syllables with neumes. */
export function readings(
  p: ProjectBody<unknown>,
  f: AnalysisFilters,
  v: NeumeVocabulary,
): { ids: string[]; bySource: Map<string, Map<number, string>> } {
  const { sources, cells } = selectCells(p, f);
  const bySource = new Map(sources.map((s) => [s.id, new Map<number, string>()]));
  for (const c of cells) {
    const neumes = c.annotation?.neumes ?? [];
    if (neumes.length === 0) continue;
    bySource.get(c.sourceId)!.set(c.syllable, JSON.stringify(neumes.map((n) => resolveEquivalent(v, n.kind))));
  }
  return { ids: sources.map((s) => s.id), bySource };
}

/** Syllables compared between two reading maps, split by agreement. */
export function comparePair(a: Map<number, string>, b: Map<number, string>): { agree: number[]; disagree: number[] } {
  const agree: number[] = [];
  const disagree: number[] = [];
  for (const [syllable, ra] of a) {
    const rb = b.get(syllable);
    if (rb === undefined) continue;
    (ra === rb ? agree : disagree).push(syllable);
  }
  const asc = (x: number, y: number) => x - y;
  return { agree: agree.sort(asc), disagree: disagree.sort(asc) };
}

const agreement = (compared: number, agree: number): Agreement => ({
  compared, agree, percent: compared === 0 ? null : agree / compared,
});

export function concordanceBySource(p: ProjectBody<unknown>, f: AnalysisFilters, v: NeumeVocabulary): AgreementMatrix {
  const { ids, bySource } = readings(p, f, v);
  const matrix: AgreementMatrix["matrix"] = {};
  for (const a of ids) {
    matrix[a] = {};
    for (const b of ids) {
      if (a === b) {
        matrix[a][b] = agreement(0, 0);
        continue;
      }
      const r = comparePair(bySource.get(a)!, bySource.get(b)!);
      matrix[a][b] = agreement(r.agree.length + r.disagree.length, r.agree.length);
    }
  }
  return { ids, matrix };
}

/** Sums agreement over pairs of distinct sources (a in F1, b in F2); "none" = no family. */
export function concordanceByFamily(p: ProjectBody<unknown>, f: AnalysisFilters, v: NeumeVocabulary): AgreementMatrix {
  const { sources } = selectCells(p, f);
  const bySource = concordanceBySource(p, f, v).matrix;
  const familyOfSource = new Map(sources.map((s) => [s.id, familyOf(p, s)]));

  const present = new Set(familyOfSource.values());
  const levelIdx = p.classification.findIndex((l) => l.id === FAMILY_LEVEL_ID);
  const order = levelIdx < 0 ? [] : p.classification[levelIdx].values.map((x) => x.id);
  const ids = [
    ...order.filter((id) => present.has(id)),
    ...[...present].filter((id) => id !== NO_FAMILY && !order.includes(id)).sort(),
    ...(present.has(NO_FAMILY) ? [NO_FAMILY] : []),
  ];

  const members = (fam: string) => sources.filter((s) => familyOfSource.get(s.id) === fam).map((s) => s.id);
  const matrix: AgreementMatrix["matrix"] = {};
  for (const f1 of ids) {
    matrix[f1] = {};
    for (const f2 of ids) {
      const m1 = members(f1);
      const m2 = members(f2);
      let compared = 0;
      let agree = 0;
      m1.forEach((a, i) => {
        m2.forEach((b, j) => {
          if (a === b || (f1 === f2 && j <= i)) return; // within a family, each pair once
          compared += bySource[a][b].compared;
          agree += bySource[a][b].agree;
        });
      });
      matrix[f1][f2] = agreement(compared, agree);
    }
  }
  return { ids, matrix };
}

/** Syllables with >= 2 distinct readings (so >= 2 sources), by number of distinct readings desc, then sources desc, then index. */
export function divergentSyllables(
  p: ProjectBody<unknown>,
  f: AnalysisFilters,
  v: NeumeVocabulary,
  limit = 10,
): DivergentSyllable[] {
  const { bySource } = readings(p, f, v);
  const bySyllable = new Map<number, string[]>();
  for (const m of bySource.values()) {
    for (const [syllable, r] of m) bySyllable.set(syllable, [...(bySyllable.get(syllable) ?? []), r]);
  }
  return [...bySyllable]
    .filter(([, rs]) => rs.length >= 2)
    .map(([syllable, rs]) => ({ syllable, readings: new Set(rs).size, sources: rs.length }))
    .filter((d) => d.readings >= 2)
    .sort((a, b) => b.readings - a.readings || b.sources - a.sources || a.syllable - b.syllable)
    .slice(0, limit);
}
