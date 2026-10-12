// src/renderer/components/analysis/TagsBlock.tsx
//
// Tag counts per source (a syllable counts once per tag), grouped by tag group.
import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { selectCells, tagCounts, type TagCountRow } from "@shared/analysis";
import { Panel } from "../../ui/Panel";
import { DrillNumber } from "./DrillNumber";
import { GROUP_ROW, TABLE, TD, TH_COL, TH_ROW, type BlockProps } from "./types";

export function TagsBlock({ project, filters, onDrill, className }: BlockProps) {
  const { t } = useTranslation();
  const { sources, groups } = useMemo(() => {
    const rows = tagCounts(project, filters);
    const names = [...new Set(rows.map((r) => r.group))];
    const ordered = [...names.filter((g): g is string => g !== null), ...(names.includes(null) ? [null] : [])];
    return {
      sources: selectCells(project, filters).sources,
      groups: ordered.map((g) => ({ group: g, rows: rows.filter((r) => r.group === g) as TagCountRow[] })),
    };
  }, [project, filters]);

  if (groups.length === 0) return null;

  return (
    <Panel title={t("indicators.tags")} className={className}>
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
              <Fragment key={g.group ?? ""}>
                <tr className={GROUP_ROW}>
                  <th colSpan={sources.length + 1} scope="colgroup" className={TH_ROW}>{g.group ?? t("indicators.noGroup")}</th>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.tagId} className="border-b border-rule-soft">
                    <th scope="row" className={TH_ROW}>
                      {r.unknown ? <span className="italic">{r.name} ({t("indicators.unknown")})</span> : r.name}
                    </th>
                    {sources.map((s) => {
                      const n = r.bySource[s.id] ?? 0;
                      return (
                        <td key={s.id} className={TD}>
                          <DrillNumber onClick={n > 0 ? () => onDrill({ kind: "tag", tagId: r.tagId, sourceId: s.id }) : undefined}>
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
