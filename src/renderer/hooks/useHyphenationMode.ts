// Modo de silabificação e re-silabificação do texto do projeto, com as confirmações
// de sempre: descartar sílabas editadas à mão e remapear caixas de recorte quando a
// divisão muda (migrate-hyphenation).
import { useTranslation } from "react-i18next";
import { useProject } from "./useProject";
import { syllabifyText, type HyphenationMode } from "../lib/syllabify";
import { migrateHyphenation, previewMigration, type MigrationStats } from "../lib/migrate-hyphenation";
import { modeName } from "../components/new-project/ModeOptions";
import type { MocquereauProject } from "../lib/models";

type T = (key: string, options?: Record<string, unknown>) => string;

/** Sílabas que não coincidem com a silabificação automática do modo atual. */
export function hasManualEdits(project: MocquereauProject): boolean {
  const { raw, words, hyphenationMode } = project.text;
  return JSON.stringify(words) !== JSON.stringify(syllabifyText(raw, hyphenationMode));
}

/** Dados indexados por sílaba (caixas, intervalos) que precisam de remapeamento. */
function hasAnyBoxes(project: MocquereauProject): boolean {
  return project.sources.some((s) =>
    s.lines.some(
      (l) => (l.syllableBoxes && Object.keys(l.syllableBoxes).length > 0) || (l.gaps && l.gaps.length > 0),
    ),
  );
}

/** Mensagem de confirmação antes de remapear os índices de sílaba. */
function buildMigrationMessage(t: T, head: string, stats: MigrationStats): string {
  const kept = t("texto.migration.kept", { count: stats.preservedBoxes });
  const dropped = t("texto.migration.dropped", { count: stats.droppedBoxes });
  const total = t("texto.migration.total", {
    oldCount: stats.oldSyllableCount,
    newCount: stats.newSyllableCount,
  });
  const wordsList =
    stats.changedWords.length > 0
      ? t("texto.migration.changedWordsHeader") +
        stats.changedWords
          .slice(0, 10)
          .map((w) => t("texto.migration.changedWordItem", { word: w.word, oldSplit: w.oldSplit, newSplit: w.newSplit }))
          .join("\n") +
        (stats.changedWords.length > 10
          ? "\n" + t("texto.migration.changedWordsMore", { count: stats.changedWords.length - 10 })
          : "")
      : t("texto.migration.noChangedWords");
  const foot = stats.droppedBoxes > 0 ? t("texto.migration.footDropped") : t("texto.migration.footContinue");
  return [head, kept, dropped, total, wordsList, foot].join("");
}

const syllableCount = (words: { syllables: string[] }[]) => words.reduce((n, w) => n + w.syllables.length, 0);

/**
 * Texto novo aplicado sem perguntas (flush ao sair da vista): re-silabifica no modo
 * atual e, havendo caixas e mudando a contagem de sílabas, remapeia-as.
 */
export function withRawText(project: MocquereauProject, raw: string): MocquereauProject {
  const mode = project.text.hyphenationMode;
  const words = syllabifyText(raw, mode);
  if (hasAnyBoxes(project) && syllableCount(words) !== syllableCount(project.text.words)) {
    return migrateHyphenation({ ...project, text: { ...project.text, raw } }, mode).project;
  }
  return { ...project, text: { raw, words, hyphenationMode: mode } };
}

export function useHyphenationMode() {
  const { state, dispatch } = useProject();
  const { t } = useTranslation();
  const project = state.project;
  const mode: HyphenationMode = project?.text.hyphenationMode ?? "sung";

  function changeMode(next: HyphenationMode) {
    if (!project || next === mode) return;
    if (hasManualEdits(project) && next !== "manual") {
      if (!window.confirm(t("texto.confirmDiscardManualEdits"))) return;
    }

    // Caixas, intervalos e recortes são indexados por sílaba: a divisão pode mudar
    // entre os modos. Oferece a migração automática (preserva as caixas das palavras
    // que não mudam, descarta as das que mudam de contagem).
    if (next !== "manual" && mode !== "manual" && hasAnyBoxes(project)) {
      const stats = previewMigration(project, next);
      const head = t("texto.migration.head", { mode: modeName(t, next) });
      if (!window.confirm(buildMigrationMessage(t, head, stats))) return;
      dispatch({ type: "REPLACE_PROJECT", payload: migrateHyphenation(project, next).project });
      return;
    }

    const raw = project.text.raw;
    dispatch({ type: "SET_TEXT", payload: { raw, words: syllabifyText(raw, next), hyphenationMode: next } });
  }

  /**
   * Aplica um texto novo, re-silabificado no modo atual. Devolve false se o usuário
   * recusou uma das confirmações (o texto não é aplicado).
   */
  function changeText(raw: string): boolean {
    if (!project || raw === project.text.raw) return true;
    if (hasManualEdits(project) && !window.confirm(t("texto.confirmDiscardManualEdits"))) return false;
    const words = syllabifyText(raw, mode);
    if (hasAnyBoxes(project) && syllableCount(words) !== syllableCount(project.text.words)) {
      const candidate = { ...project, text: { ...project.text, raw } };
      const stats = previewMigration(candidate, mode);
      if (!window.confirm(buildMigrationMessage(t, t("texto.migration.headText"), stats))) return false;
      dispatch({ type: "REPLACE_PROJECT", payload: migrateHyphenation(candidate, mode).project });
      return true;
    }
    dispatch({ type: "SET_TEXT", payload: { raw, words, hyphenationMode: mode } });
    return true;
  }

  return { mode, changeMode, changeText };
}
