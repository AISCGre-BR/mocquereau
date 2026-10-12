// src/renderer/views/AnaliseView.tsx
//
// Vista Análise (Ctrl+4): indicator blocks over the filtered project, recomputed on every
// change of project or filters. Every number opens its occurrences; choosing one opens
// Recortes on that syllable with the Anotação panel.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { occurrences as findOccurrences, type Occurrence } from "@shared/analysis";
import { getVocabulary } from "@shared/annotation/vocabulary";
import { useProject } from "../hooks/useProject";
import { useAnalysisFilters } from "../components/analysis/AnalysisContext";
import { ProgressBlock } from "../components/analysis/ProgressBlock";
import { ContentBlock } from "../components/analysis/ContentBlock";
import { MarksBlock } from "../components/analysis/MarksBlock";
import { ConcordanceBlock } from "../components/analysis/ConcordanceBlock";
import { TagsBlock } from "../components/analysis/TagsBlock";
import { OccurrencesDialog } from "../components/analysis/OccurrencesDialog";
import type { DrillQuery } from "../components/analysis/types";

export interface AnaliseViewProps {
  onOpenOccurrence: (sourceId: string, syllable: number) => void;
}

export function AnaliseView({ onOpenOccurrence }: AnaliseViewProps) {
  const { t } = useTranslation();
  const { state } = useProject();
  const [filters] = useAnalysisFilters();
  const [query, setQuery] = useState<DrillQuery | null>(null);
  const project = state.project!;
  const vocabulary = useMemo(() => getVocabulary(project, (k) => t(k)), [project, t]);

  const list = useMemo((): Occurrence[] => {
    if (!query) return [];
    if (query.kind !== "compared") return findOccurrences(project, filters, vocabulary, query);
    // Every compared syllable (agreeing and not), source-major like the other queries.
    const both = [true, false].flatMap((agree) =>
      findOccurrences(project, filters, vocabulary, { kind: "pair", a: query.a, b: query.b, agree }),
    );
    const order = [query.a, query.b];
    return both.sort((x, y) => order.indexOf(x.sourceId) - order.indexOf(y.sourceId) || x.syllable - y.syllable);
  }, [query, project, filters, vocabulary]);

  const hasAnnotations = project.sources.some((s) => s.annotations && Object.keys(s.annotations).length > 0);
  if (!hasAnnotations) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <p className="sc-empty">{t("analysis.empty")}</p>
      </div>
    );
  }

  const block = { project, filters, vocabulary, onDrill: setQuery };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(560px,1fr))] items-start gap-4">
        <ProgressBlock {...block} />
        <ConcordanceBlock {...block} />
        <ContentBlock {...block} className="col-span-full" />
        <MarksBlock {...block} />
        <TagsBlock {...block} />
      </div>
      {query && (
        <OccurrencesDialog
          project={project}
          occurrences={list}
          onClose={() => setQuery(null)}
          onOpen={onOpenOccurrence}
        />
      )}
    </div>
  );
}
