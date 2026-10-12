// src/renderer/components/analysis/MarksBlock.tsx
//
// Liquescence, episema, lengthened notes, significant letters (one row per letter) and certainty,
// each with "not informed"; counts per source.
import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { marks, selectCells, type MarkRow } from "@shared/analysis";
import { letterKey } from "@shared/analysis/content";
import { Panel } from "../../ui/Panel";
import { DrillNumber } from "./DrillNumber";
import { GROUP_ROW, TABLE, TD, TH_COL, TH_ROW, type BlockProps } from "./types";

export function MarksBlock({ project, filters, vocabulary, onDrill, className }: BlockProps) {
  const { t } = useTranslation();
  const { sources, rows } = useMemo(
    () => ({ sources: selectCells(project, filters).sources, rows: marks(project, filters, vocabulary) }),
    [project, filters, vocabulary],
  );
  const letters = useMemo(() => new Map(vocabulary.letters.map((l) => [letterKey(l.id), l])), [vocabulary]);

  const groups: Array<{ group: string; rows: MarkRow[] }> = [];
  for (const r of rows) {
    const group = r.key.split(".")[0];
    const last = groups[groups.length - 1];
    if (last?.group === group) last.rows.push(r);
    else groups.push({ group, rows: [r] });
  }

  const label = (key: string) => {
    if (key.endsWith(".unset")) return t("indicators.unset");
    if (key.startsWith("letter.")) {
      const l = letters.get(key);
      if (!l) return <span className="italic">{key.slice("letter.".length)} ({t("indicators.unknown")})</span>;
      return (
        <>
          <span className="font-serif italic">{l.abbr}</span>
          <span className="ml-2 text-ink-muted">{l.meaning}</span>
        </>
      );
    }
    return t(`indicators.${key}`);
  };

  return (
    <Panel title={t("indicators.marks")} className={className}>
      <div className="overflow-x-auto px-2 pb-3">
        <table className={TABLE}>
          <thead>
            <tr className="border-b border-rule">
              <th className={TH_ROW} />
              {sources.map((s) => (
                <th key={s.id} scope="col" className={TH_COL}>{s.metadata.siglum}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.group}>
                <tr className={GROUP_ROW}>
                  <th colSpan={sources.length + 1} scope="colgroup" className={TH_ROW}>{t(`indicators.group.${g.group}`)}</th>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.key} className="border-b border-rule-soft">
                    <th scope="row" className={TH_ROW}>{label(r.key)}</th>
                    {sources.map((s) => {
                      const n = r.bySource[s.id] ?? 0;
                      return (
                        <td key={s.id} className={TD}>
                          <DrillNumber onClick={n > 0 ? () => onDrill({ kind: "mark", key: r.key, sourceId: s.id }) : undefined}>
                            {n}
                          </DrillNumber>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
