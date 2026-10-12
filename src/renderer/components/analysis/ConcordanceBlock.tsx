// src/renderer/components/analysis/ConcordanceBlock.tsx
//
// Agreement matrix (source x source or family x family): share of the syllables annotated
// in both whose neume sequence is identical after equivalences; lapis wash by step.
// Below, the syllables with the most distinct readings.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { concordanceByFamily, concordanceBySource, divergentSyllables, selectCells } from "@shared/analysis";
import { FAMILY_LEVEL_ID, NO_FAMILY } from "@shared/analysis/cells";
import { Panel } from "../../ui/Panel";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { DrillNumber } from "./DrillNumber";
import { syllableTexts, useAnalysisFormat } from "./format";
import { TABLE, TH_COL, TH_ROW, type BlockProps } from "./types";

type Mode = "source" | "family";

/** Five wash steps of lapis for 0..100%. */
const WASH = ["bg-lapis/5", "bg-lapis/10", "bg-lapis/15", "bg-lapis/20", "bg-lapis/25"] as const;
export const washOf = (p: number) => WASH[Math.min(4, Math.max(0, Math.floor(p * 5)))];

export function ConcordanceBlock({ project, filters, vocabulary, onDrill, className }: BlockProps) {
  const { t } = useTranslation();
  const fmt = useAnalysisFormat();
  const [mode, setMode] = useState<Mode>("source");
  const { matrix, divergent, names } = useMemo(() => {
    const names = new Map<string, string>();
    if (mode === "source") {
      for (const s of selectCells(project, filters).sources) names.set(s.id, s.metadata.siglum);
    } else {
      const level = project.classification.find((l) => l.id === FAMILY_LEVEL_ID);
      for (const v of level?.values ?? []) names.set(v.id, v.name);
      names.set(NO_FAMILY, t("indicators.noFamily"));
    }
    return {
      matrix: (mode === "source" ? concordanceBySource : concordanceByFamily)(project, filters, vocabulary),
      divergent: divergentSyllables(project, filters, vocabulary, 10),
      names,
    };
  }, [mode, project, filters, vocabulary, t]);
  const texts = useMemo(() => syllableTexts(project.text.words), [project.text.words]);
  const name = (id: string) => names.get(id) ?? id;
  const headClass = mode === "source" ? TH_COL : `${TH_COL} font-sans text-caption`;

  return (
    <Panel
      title={t("indicators.concordance")}
      className={className}
      action={
        <SegmentedControl<Mode>
          aria-label={t("indicators.concordance")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "source", label: t("analysis.bySource") },
            { value: "family", label: t("analysis.byFamily") },
          ]}
        />
      }
    >
      <div className="overflow-x-auto px-2 pb-3">
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH_ROW} />
              {matrix.ids.map((id) => (
                <th key={id} scope="col" className={`${headClass} text-center`}>{name(id)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.ids.map((a) => (
              <tr key={a}>
                <th scope="row" className={mode === "source" ? `${TH_ROW} font-serif` : TH_ROW}>{name(a)}</th>
                {matrix.ids.map((b) => {
                  const cell = matrix.matrix[a][b];
                  const diagonal = a === b && mode === "source";
                  return (
                    <td
                      key={b}
                      data-pair={`${a}:${b}`}
                      className={[
                        "h-9 min-w-14 rounded-sm border border-surface px-2 text-center tabular-nums",
                        cell.percent !== null ? washOf(cell.percent) : "",
                        diagonal ? "text-ink-muted" : "",
                      ].join(" ")}
                    >
                      {diagonal ? (
                        "—"
                      ) : cell.percent === null ? null : mode === "source" ? (
                        <DrillNumber onClick={() => onDrill({ kind: "pair", a, b, agree: false })}>{fmt.percent(cell.percent)}</DrillNumber>
                      ) : (
                        fmt.percent(cell.percent)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {divergent.length > 0 && (
          <div className="mt-3 px-2">
            <h4 className="mb-1 text-caption text-ink-muted">{t("analysis.mostDivergent")}</h4>
            <ul className="flex flex-col">
              {divergent.map((d) => (
                <li key={d.syllable}>
                  <button
                    type="button"
                    className="group flex w-full items-baseline gap-3 rounded-sm px-1 py-0.5 text-left hover:bg-ink-wash focus-visible:outline-2 focus-visible:outline-focus"
                    onClick={() => onDrill({ kind: "syllable", syllable: d.syllable })}
                  >
                    <span className="min-w-12 font-serif text-body italic text-ink">{texts[d.syllable] ?? d.syllable}</span>
                    <span className="border-b border-dotted border-rule-strong font-sans text-sm text-ink-soft group-hover:border-ink">
                      {t("analysis.readings", { count: d.readings })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}
