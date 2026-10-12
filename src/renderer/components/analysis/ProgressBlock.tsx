// src/renderer/components/analysis/ProgressBlock.tsx
//
// Progress: per source (or section), a stacked bar of the syllables: annotated (lapis),
// illegible (orpiment, part of the annotated) and the rest on the track; percent annotated.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { progressBySection, progressBySource, type ProgressRow } from "@shared/analysis";
import { NO_SECTION } from "@shared/analysis/cells";
import { Panel } from "../../ui/Panel";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { BAR_GRID, BarRow, StackedBar } from "./BarRow";
import { DrillNumber } from "./DrillNumber";
import { Swatch } from "./Swatch";
import { useAnalysisFormat } from "./format";
import type { BlockProps } from "./types";

type Mode = "source" | "section";

export function ProgressBlock({ project, filters, vocabulary, onDrill, className }: BlockProps) {
  const { t } = useTranslation();
  const fmt = useAnalysisFormat();
  const [mode, setMode] = useState<Mode>("source");
  const rows = useMemo(
    () => (mode === "source" ? progressBySource : progressBySection)(project, filters, vocabulary),
    [mode, project, filters, vocabulary],
  );

  const label = (r: ProgressRow) =>
    mode === "source" ? r.label : r.key === NO_SECTION ? t("indicators.noSection") : r.label;

  return (
    <Panel
      title={t("analysis.progress")}
      className={className}
      action={
        <SegmentedControl<Mode>
          aria-label={t("analysis.progress")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "source", label: t("analysis.bySource") },
            { value: "section", label: t("analysis.bySection") },
          ]}
        />
      }
    >
      <div className="px-4 pb-3">
        <div className={BAR_GRID}>
          {rows.map((r) => {
            const rest = r.total - r.annotated;
            const title = [
              label(r),
              `${t("analysis.legend.annotated")} ${r.annotated}`,
              `${t("analysis.legend.illegible")} ${r.illegible}`,
              `${t("analysis.legend.missing")} ${rest}`,
            ].join(" · ");
            const where = mode === "source" ? { sourceId: r.key } : { sectionId: r.key };
            return (
              <BarRow
                key={r.key}
                label={<span className={mode === "source" ? "font-serif text-body" : "font-sans text-sm"}>{label(r)}</span>}
                bar={
                  <StackedBar
                    title={title}
                    max={r.total}
                    segments={[
                      { value: r.annotated - r.illegible, className: "fill-lapis" },
                      { value: r.illegible, className: "fill-orpiment" },
                    ]}
                  />
                }
                value={
                  <DrillNumber
                    onClick={r.annotated > 0 ? () => onDrill({ kind: "progress", status: "annotated", ...where }) : undefined}
                  >
                    {fmt.percent(r.total === 0 ? null : r.annotated / r.total)}
                  </DrillNumber>
                }
              />
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-muted">
          <span className="inline-flex items-center gap-1.5"><Swatch className="fill-lapis" />{t("analysis.legend.annotated")}</span>
          <span className="inline-flex items-center gap-1.5"><Swatch className="fill-orpiment" />{t("analysis.legend.illegible")}</span>
          <span className="inline-flex items-center gap-1.5"><Swatch className="fill-parchment-deep" />{t("analysis.legend.missing")}</span>
        </div>
      </div>
    </Panel>
  );
}
