// src/renderer/components/analysis/AnalysisContext.tsx
//
// Filters of the Análise view: session state (not saved in the project), shared by the
// view, its toolbar and the CSV export. The App clears them when the project changes.
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { AnalysisFilters } from "@shared/analysis";

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
