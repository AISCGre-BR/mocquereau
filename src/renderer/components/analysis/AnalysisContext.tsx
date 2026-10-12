// src/renderer/components/analysis/AnalysisContext.tsx
//
// Filters of the Análise view: session state (not saved in the project), shared by the
// view, its toolbar and the CSV export. The App clears them when the project changes.
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { AnalysisFilters } from "@shared/analysis";
import { NO_SECTION } from "@shared/analysis/cells";
import type { MocquereauProject } from "../../lib/models";

type FiltersState = [AnalysisFilters, (f: AnalysisFilters) => void];

const AnalysisFiltersContext = createContext<FiltersState | null>(null);

export function AnalysisFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<AnalysisFilters>({});
  const value = useMemo<FiltersState>(() => [filters, setFilters], [filters]);
  return <AnalysisFiltersContext.Provider value={value}>{children}</AnalysisFiltersContext.Provider>;
}

export function useAnalysisFilters(): FiltersState {
  const ctx = useContext(AnalysisFiltersContext);
  if (!ctx) throw new Error("useAnalysisFilters precisa estar dentro de <AnalysisFiltersProvider>");
  return ctx;
}

type IdKey = "sourceIds" | "classValueIds" | "sectionIds" | "tagIds";

/**
 * The filters without ids the project no longer has (source, class value, section or tag
 * removed during the session): a stale id would otherwise keep filtering everything out.
 */
export function pruneFilters(p: MocquereauProject, f: AnalysisFilters): AnalysisFilters {
  const known: Record<IdKey, Set<string>> = {
    sourceIds: new Set(p.sources.map((s) => s.id)),
    classValueIds: new Set(p.classification.flatMap((l) => l.values.map((v) => v.id))),
    sectionIds: new Set([...p.sections.map((s) => s.id), NO_SECTION]),
    tagIds: new Set((p.tags ?? []).map((t) => t.id)),
  };
  const out: AnalysisFilters = { ...f };
  for (const key of Object.keys(known) as IdKey[]) {
    const kept = f[key]?.filter((id) => known[key].has(id));
    if (kept === undefined) continue;
    if (kept.length === 0) delete out[key];
    else out[key] = kept;
  }
  return out;
}

/** The active filters, pruned against the project (what the blocks, the bar and the CSV use). */
export function useEffectiveAnalysisFilters(project: MocquereauProject | null): AnalysisFilters {
  const [filters] = useAnalysisFilters();
  return useMemo(() => (project ? pruneFilters(project, filters) : filters), [project, filters]);
}

/** Whether any source has an annotation (the Análise view and its CSV need one). */
export function projectHasAnnotations(p: MocquereauProject): boolean {
  return p.sources.some((s) => s.annotations !== undefined && Object.keys(s.annotations).length > 0);
}
