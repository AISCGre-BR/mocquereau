// src/shared/analysis/indicator-tables.ts
//
// Whole-project indicators as ready-made text tables (columns = source sigla), for the
// DOCX appendix. The renderer calls this and sends the result; the main process only lays it out.
import type { ProjectBody } from "../project-schema";
import type { NeumeVocabulary } from "../annotation/types";
import { selectCells } from "./cells";
import { concordanceBySource } from "./concordance";
import { marks, neumeContent } from "./content";
import { progressBySource } from "./progress";
import { tagCounts } from "./tag-counts";

export interface IndicatorTable {
  title: string;
  columns: string[];
  rows: Array<{ label: string; values: string[]; group?: boolean }>;
}

type T = (key: string, opts?: object) => string;

const percent = (x: number) => `${(x * 100).toFixed(1)}%`;
const EMPTY: Record<string, never> = {};
const DASH = "—";

export function buildIndicatorTables(p: ProjectBody<unknown>, v: NeumeVocabulary, t: T): IndicatorTable[] {
  const { sources } = selectCells(p, EMPTY);
  const columns = sources.map((s) => s.metadata.siglum);
  const ids = sources.map((s) => s.id);
  const group = (label: string): IndicatorTable["rows"][number] => ({ label, values: ids.map(() => ""), group: true });

  // 1. Progress by source: measures as rows, sources as columns.
  const progress = progressBySource(p, EMPTY, v);
  const progressTable: IndicatorTable = {
    title: t("indicators.progress"),
    columns,
    rows: (["withBox", "annotated", "illegible", "missing"] as const).map((k) => ({
      label: t(`indicators.${k}`),
      values: progress.map((r) => String(r[k])),
    })),
  };

  // 2. Neume content: count (% of annotated syllables), grouped by category.
  const content = neumeContent(p, EMPTY, v);
  const contentRows: IndicatorTable["rows"] = [];
  const categoryName = new Map(v.categories.map((c) => [c.id, c.name]));
  const categoryOrder = [...v.categories.map((c) => c.id), null];
  for (const categoryId of categoryOrder) {
    const kindRows = content.rows.filter((r) =>
      categoryId === null ? r.unknown || !categoryName.has(r.categoryId ?? "") : r.categoryId === categoryId && !r.unknown);
    if (kindRows.length === 0) continue;
    contentRows.push(group(categoryId === null ? t("indicators.unknown") : (categoryName.get(categoryId) ?? categoryId)));
    for (const r of kindRows) {
      contentRows.push({
        label: r.name,
        values: ids.map((id) => {
          const cell = r.bySource[id];
          return cell.percent === null ? String(cell.count) : `${cell.count} (${percent(cell.percent)})`;
        }),
      });
    }
  }
  contentRows.push({
    label: t("indicators.meanNotes"),
    values: ids.map((id) => {
      const m = content.meanNotes[id];
      return m === null ? "" : m.toFixed(2);
    }),
  });
  const contentTable: IndicatorTable = { title: t("indicators.content"), columns, rows: contentRows };

  // 3. Liquescence, episema, letters and certainty (including "not informed"), one group each.
  const letters = new Map(v.letters.map((l) => [`letter.${l.id.replace(/^letter\./, "")}`, l]));
  const markLabel = (key: string): string => {
    if (key.endsWith(".unset")) return t("indicators.unset");
    if (key.startsWith("letter.")) {
      const l = letters.get(key);
      return l ? `${l.abbr} — ${l.meaning}` : `${key.slice("letter.".length)} (${t("indicators.unknown")})`;
    }
    return t(`indicators.${key}`);
  };
  const markRows: IndicatorTable["rows"] = [];
  let currentGroup = "";
  for (const m of marks(p, EMPTY, v)) {
    const g = m.key.split(".")[0];
    if (g !== currentGroup) {
      currentGroup = g;
      markRows.push(group(t(`indicators.group.${g}`)));
    }
    markRows.push({ label: markLabel(m.key), values: ids.map((id) => String(m.bySource[id] ?? 0)) });
  }
  const marksTable: IndicatorTable = { title: t("indicators.marks"), columns, rows: markRows };

  // 4. Concordance matrix: "—" on the diagonal, empty when the pair has no common data.
  const conc = concordanceBySource(p, EMPTY, v);
  const concTable: IndicatorTable = {
    title: t("indicators.concordance"),
    columns,
    rows: conc.ids.map((a, i) => ({
      label: columns[i],
      values: conc.ids.map((b) => {
        if (a === b) return DASH;
        const cell = conc.matrix[a][b];
        return cell.percent === null ? "" : percent(cell.percent);
      }),
    })),
  };

  // 5. Tags by source, grouped by tag group.
  const tags = tagCounts(p, EMPTY);
  const tagRows: IndicatorTable["rows"] = [];
  const groupNames = [...new Set(tags.map((r) => r.group))];
  const ordered = [...groupNames.filter((g): g is string => g !== null), ...(groupNames.includes(null) ? [null] : [])];
  for (const g of ordered) {
    tagRows.push(group(g ?? t("indicators.noGroup")));
    for (const r of tags.filter((x) => x.group === g)) {
      tagRows.push({
        label: r.unknown ? `${r.name} (${t("indicators.unknown")})` : r.name,
        values: ids.map((id) => String(r.bySource[id] ?? 0)),
      });
    }
  }
  const tagsTable: IndicatorTable = { title: t("indicators.tags"), columns, rows: tagRows };

  return [progressTable, contentTable, marksTable, concTable, tagsTable];
}
