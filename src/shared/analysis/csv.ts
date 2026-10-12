// src/shared/analysis/csv.ts
//
// CSV serialization of the annotation data: raw rows (one per neume) and totals (long format).
// UTF-8 BOM, comma separator, CRLF lines, RFC 4180 quoting. Pure: no Electron, no DOM.
import { categoryLabel } from "../annotation/default-vocabulary";
import type { ProjectBody, SourceOf } from "../project-schema";
import type { NeumeVocabulary } from "../annotation/types";
import { kindMap } from "../annotation/vocabulary";
import type { AnalysisFilters } from "./types";
import { FAMILY_LEVEL_ID, selectCells } from "./cells";
import { concordanceBySource } from "./concordance";
import { marks, neumeContent } from "./content";
import { progressBySource } from "./progress";
import { tagCounts } from "./tag-counts";

export const RAW_HEADER = [
  "source", "family", "class2", "class3", "section", "syllable_index", "syllable", "position",
  "neume", "equivalent", "category", "notes", "liquescence", "episema", "lengthened", "letters",
  "neume_tags", "syllable_tags", "certainty", "comment",
] as const;
export const TOTALS_HEADER = ["block", "row", "column", "value", "percent"] as const;

const BOM = "﻿";

type Field = string | number | null | undefined;

function escapeField(v: Field): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<Field>>): string {
  return BOM + rows.map((r) => r.map(escapeField).join(",") + "\r\n").join("");
}

const pct = (x: number | null): string => (x === null ? "" : (x * 100).toFixed(1));

/** Names of the source's class values: [family, class2, class3]. */
function classNames(p: ProjectBody<unknown>, s: SourceOf<unknown>): [string, string, string] {
  const nameAt = (level: number): string => {
    const id = s.metadata.classes[level];
    if (id == null) return "";
    return p.classification[level]?.values.find((x) => x.id === id)?.name ?? id;
  };
  const familyLevel = p.classification.findIndex((l) => l.id === FAMILY_LEVEL_ID);
  const others = [0, 1, 2].filter((i) => i !== familyLevel);
  if (familyLevel < 0) return ["", nameAt(others[0]), nameAt(others[1])];
  return [nameAt(familyLevel), nameAt(others[0]), nameAt(others[1])];
}

export function rawRows(
  p: ProjectBody<unknown>,
  f: AnalysisFilters,
  v: NeumeVocabulary,
  t: (key: string) => string,
): string[][] {
  const { sources, cells } = selectCells(p, f);
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const kinds = kindMap(v);
  const categories = new Map(v.categories.map((c) => [c.id, categoryLabel(c, t)]));
  const letters = new Map(v.letters.map((l) => [l.id, l.abbr]));
  const tagNames = new Map((p.tags ?? []).map((t) => [t.id, t.name]));
  const tagName = (id: string) => tagNames.get(id) ?? id;
  const sections = new Map(p.sections.map((s) => [s.id, s.name]));
  const texts = p.text.words.flatMap((w) => w.syllables);

  const out: string[][] = [[...RAW_HEADER]];
  for (const c of cells) {
    const a = c.annotation;
    if (!a) continue;
    const s = sourceById.get(c.sourceId)!;
    const [family, class2, class3] = classNames(p, s);
    const head = [
      s.metadata.siglum, family, class2, class3,
      c.sectionId ? (sections.get(c.sectionId) ?? "") : "",
      String(c.syllable + 1), texts[c.syllable] ?? "",
    ];
    const syllableTags = a.tags.map(tagName).join("; ");
    const certainty = a.certainty ?? "";
    if (a.neumes.length === 0) {
      // position, neume, equivalent, category empty; notes = manual total; marks and neume tags empty.
      out.push([
        ...head, "", "", "", "", a.notes === undefined ? "" : String(a.notes), "", "", "", "", "",
        syllableTags, certainty, a.comment ?? "",
      ]);
      continue;
    }
    a.neumes.forEach((n, i) => {
      const kind = kinds.get(n.kind);
      const notes = n.notes ?? kind?.defaultNotes;
      // The syllable comment rides on the first neume row; neume comment follows.
      const comment = [i === 0 ? a.comment : undefined, n.comment].filter((x) => x).join("; ");
      out.push([
        ...head,
        String(i + 1),
        kind?.name ?? n.kind,
        (kind?.equivalentTo ?? []).map((id) => kinds.get(id)?.name ?? id).join("; "),
        kind?.categoryId !== undefined ? (categories.get(kind.categoryId) ?? "") : "",
        notes === undefined ? "" : String(notes),
        n.liquescence ?? "",
        n.episema === undefined ? "" : n.episema ? "yes" : "no",
        (n.lengthened ?? []).join("; "),
        (n.letters ?? []).map((id) => letters.get(id) ?? id).join("; "),
        (n.tags ?? []).map(tagName).join("; "),
        syllableTags,
        certainty,
        comment,
      ]);
    });
  }
  return out;
}

export function totalsRows(
  p: ProjectBody<unknown>,
  f: AnalysisFilters,
  v: NeumeVocabulary,
  t: (key: string, opts?: object) => string,
): string[][] {
  const { sources } = selectCells(p, f);
  const siglum = new Map(sources.map((s) => [s.id, s.metadata.siglum]));
  const out: string[][] = [[...TOTALS_HEADER]];

  for (const r of progressBySource(p, f, v)) {
    const share = (n: number) => (r.total === 0 ? "" : pct(n / r.total));
    out.push(["progress", r.label, t("indicators.withBox"), String(r.withBox), share(r.withBox)]);
    out.push(["progress", r.label, t("indicators.annotated"), String(r.annotated), share(r.annotated)]);
    out.push(["progress", r.label, t("indicators.illegible"), String(r.illegible), share(r.illegible)]);
    out.push(["progress", r.label, t("indicators.missing"), String(r.missing), share(r.missing)]);
  }

  const content = neumeContent(p, f, v);
  for (const row of content.rows) {
    for (const s of sources) {
      const cell = row.bySource[s.id];
      out.push(["neumes", row.name, s.metadata.siglum, String(cell.count), pct(cell.percent)]);
    }
  }
  for (const s of sources) {
    const m = content.meanNotes[s.id];
    out.push(["mean_notes", t("indicators.meanNotes"), s.metadata.siglum, m === null ? "" : m.toFixed(2), ""]);
  }

  for (const row of marks(p, f, v)) {
    for (const s of sources) out.push(["marks", row.key, s.metadata.siglum, String(row.bySource[s.id] ?? 0), ""]);
  }

  const conc = concordanceBySource(p, f, v);
  for (const a of conc.ids) {
    for (const b of conc.ids) {
      if (a === b) continue;
      const cell = conc.matrix[a][b];
      if (cell.compared === 0) continue;
      out.push(["concordance", siglum.get(a)!, siglum.get(b)!, String(cell.agree), pct(cell.percent)]);
    }
  }

  for (const row of tagCounts(p, f)) {
    for (const s of sources) out.push(["tags", row.name, s.metadata.siglum, String(row.bySource[s.id] ?? 0), ""]);
  }
  return out;
}

export interface CsvExportPayload { title: string; raw: string; totals: string }
