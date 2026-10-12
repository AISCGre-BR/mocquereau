// src/shared/analysis/index.ts
//
// Pure analysis module: project + filters -> indicators. Shared by the Análise view,
// the CSV export and the DOCX appendix.
export * from "./types";
export { sectionOfSyllable, selectCells } from "./cells";
export { progressBySource, progressBySection } from "./progress";
export { neumeContent, marks, groupContentRows, type ContentGroup } from "./content";
export { concordanceBySource, concordanceByFamily, divergentSyllables } from "./concordance";
export { tagCounts } from "./tag-counts";
export { occurrences } from "./occurrences";
