// src/renderer/components/analysis/ContentBlock.tsx
//
// Neume content: kind x source, as counts or as share of the annotated syllables,
// grouped by category; Total column with a bar; last row = mean notes per syllable.
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { neumeContent, selectCells, type KindRow } from "@shared/analysis";
import { Panel } from "../../ui/Panel";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { ValueBar } from "./BarRow";
import { DrillNumber } from "./DrillNumber";
import { useAnalysisFormat } from "./format";
import { GROUP_ROW, TABLE, TD, TH_COL, TH_ROW, type BlockProps } from "./types";

type Mode = "count" | "percent";

export function ContentBlock({ project, filters, vocabulary, onDrill, className }: BlockProps) {
  const { t } = useTranslation();
  const fmt = useAnalysisFormat();
  const [mode, setMode] = useState<Mode>("count");
  const { sources, content } = useMemo(
    () => ({ sources: selectCells(project, filters).sources, content: neumeContent(project, filters, vocabulary) }),
    [project, filters, vocabulary],
  );

  const groups = useMemo(() => {
    const names = new Map(vocabulary.categories.map((c) => [c.id, c.name]));
    const out: Array<{ id: string; name: string; rows: KindRow[] }> = [];
    for (const c of vocabulary.categories) {
      const rows = content.rows.filter((r) => !r.unknown && r.categoryId === c.id);
      if (rows.length > 0) out.push({ id: c.id, name: c.name, rows });
    }
    const unknown = content.rows.filter((r) => r.unknown || !names.has(r.categoryId ?? ""));
    if (unknown.length > 0) out.push({ id: "", name: t("indicators.unknown"), rows: unknown });
    return out;
  }, [content, vocabulary, t]);

  const maxTotal = Math.max(0, ...content.rows.map((r) => r.total));
  const span = sources.length + 2;

  return (
    <Panel
      title={t("indicators.content")}
      className={className}
      action={
        <SegmentedControl<Mode>
          aria-label={t("indicators.content")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "count", label: t("analysis.count") },
            { value: "percent", label: t("analysis.percent") },
          ]}
        />
      }
    >
      <div className="overflow-x-auto px-2 pb-3">
        <table className={TABLE}>
          <thead>
            <tr className="border-b border-rule">
              <th className={TH_ROW} />
              {sources.map((s) => (
                <th key={s.id} scope="col" className={TH_COL}>{s.metadata.siglum}</th>
              ))}
              <th scope="col" className={`${TH_COL} font-sans text-caption text-ink-muted`}>{t("analysis.total")}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.id}>
                <tr className={GROUP_ROW}>
                  <th colSpan={span} scope="colgroup" className={TH_ROW}>{g.name}</th>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.kindId} className="border-b border-rule-soft">
                    <th scope="row" className={TH_ROW}>
                      <span className={r.unknown ? "italic" : undefined}>{r.name}</span>
                      {r.equivalentName && (
                        <span className="ml-2 text-caption text-ink-muted">= {r.equivalentName}</span>
                      )}
                    </th>
                    {sources.map((s) => {
                      const cell = r.bySource[s.id];
                      const drill = cell.count > 0 ? () => onDrill({ kind: "neume", kindId: r.kindId, sourceId: s.id }) : undefined;
                      return (
                        <td key={s.id} className={TD}>
                          <DrillNumber onClick={drill}>
                            {mode === "count" ? cell.count : fmt.percent(cell.percent)}
                          </DrillNumber>
                        </td>
                      );
                    })}
                    <td className={`${TD} w-40`}>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <ValueBar value={r.total} max={maxTotal} />
                        </div>
                        <DrillNumber onClick={r.total > 0 ? () => onDrill({ kind: "neume", kindId: r.kindId }) : undefined}>
                          {r.total}
                        </DrillNumber>
                      </div>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr className="border-t border-rule">
              <th scope="row" className={TH_ROW}>{t("analysis.meanNotes")}</th>
              {sources.map((s) => (
                <td key={s.id} className={`${TD} tabular-nums`}>{fmt.mean(content.meanNotes[s.id] ?? null)}</td>
              ))}
              <td className={TD} />
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
