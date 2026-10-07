// Ações de arquivo da onda A1, ligadas aos handlers que já existiam (StatusBar e
// ProjectSetup). O ciclo de vida completo (salvar atômico, recuperação, registro de
// comandos) é da onda B; aqui só mudam de lugar e ganham toasts.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createNewProject, useProject } from "./useProject";
import { useToast } from "../ui/Toast";
import { syllabifyText } from "../lib/syllabify";
import type { MocquereauProject } from "../lib/models";

export const AUTOSAVE_DELAY_MS = 3000;

export interface ProjectFileActions {
  newProject: () => void;
  open: () => Promise<void>;
  openRecent: (filePath: string) => Promise<void>;
  save: () => Promise<boolean>;
  saveAs: () => Promise<boolean>;
  close: () => void;
  importGueranger: () => Promise<void>;
  /** Muda a cada troca de projeto; usado como key das vistas para remontá-las. */
  projectEpoch: number;
}

export function useProjectFile(options: { onOpened?: () => void } = {}): ProjectFileActions {
  const { state, dispatch } = useProject();
  const { t } = useTranslation();
  const toast = useToast();
  const [projectEpoch, setProjectEpoch] = useState(0);

  const stateRef = useRef(state);
  stateRef.current = state;
  const onOpenedRef = useRef(options.onOpened);
  onOpenedRef.current = options.onOpened;
  const lastAutosaveError = useRef<string | null>(null);

  const confirmDiscard = useCallback((): boolean => {
    const s = stateRef.current;
    if (!s.project || !s.isDirty) return true;
    return window.confirm(t("file.confirmDiscard"));
  }, [t]);

  const adopt = useCallback(
    (project: MocquereauProject, filePath: string | null) => {
      dispatch({ type: "SET_PROJECT", payload: project });
      dispatch({ type: "SET_FILE_PATH", payload: filePath });
      setProjectEpoch((n) => n + 1);
      onOpenedRef.current?.();
      if (filePath) void window.mocquereau.addRecentFile(filePath).catch(() => undefined);
    },
    [dispatch],
  );

  const writeProject = useCallback(
    async (existingPath: string | undefined, silent: boolean): Promise<boolean> => {
      const s = stateRef.current;
      if (!s.project) return false;
      const updated = { ...s.project, meta: { ...s.project.meta, updatedAt: new Date().toISOString() } };
      try {
        const result = await window.mocquereau.saveProject(updated, existingPath);
        if (!result) return false; // diálogo cancelado
        lastAutosaveError.current = null;
        dispatch({ type: "SAVE_SUCCESS" });
        if (result.filePath !== s.currentFilePath) {
          dispatch({ type: "SET_FILE_PATH", payload: result.filePath });
          void window.mocquereau.addRecentFile(result.filePath).catch(() => undefined);
        }
        if (!silent) toast.show({ kind: "ok", message: t("file.saved") });
        return true;
      } catch (err) {
        const message = t("file.saveError", { message: err instanceof Error ? err.message : String(err) });
        // Autosave que falha de novo com a mesma mensagem não empilha toasts.
        if (!silent || lastAutosaveError.current !== message) {
          toast.show({ kind: "error", message });
        }
        if (silent) lastAutosaveError.current = message;
        return false;
      }
    },
    [dispatch, t, toast],
  );

  const save = useCallback(
    () => writeProject(stateRef.current.currentFilePath ?? undefined, false),
    [writeProject],
  );
  const saveAs = useCallback(() => writeProject(undefined, false), [writeProject]);

  const newProject = useCallback(() => {
    if (!confirmDiscard()) return;
    adopt(createNewProject(t("file.untitled"), ""), null);
  }, [adopt, confirmDiscard, t]);

  const open = useCallback(async () => {
    if (!confirmDiscard()) return;
    const result = await window.mocquereau.openProject();
    if (result) adopt(result.project, result.filePath);
  }, [adopt, confirmDiscard]);

  const openRecent = useCallback(
    async (filePath: string) => {
      if (!confirmDiscard()) return;
      const result = await window.mocquereau.openProjectByPath(filePath).catch(() => null);
      if (!result) {
        toast.show({ kind: "error", message: t("file.openError", { filePath }) });
        return;
      }
      adopt(result.project, result.filePath);
    },
    [adopt, confirmDiscard, t, toast],
  );

  const close = useCallback(() => {
    if (!confirmDiscard()) return;
    dispatch({ type: "RESET" });
    setProjectEpoch((n) => n + 1);
  }, [confirmDiscard, dispatch]);

  const importGueranger = useCallback(async () => {
    if (!stateRef.current.project) return;
    const result = await window.mocquereau.importGueranger();
    const incipit = result?.manuscripts[0]?.incipit;
    const project = stateRef.current.project;
    if (!incipit || !project) return;
    if (project.text.raw.trim()) {
      toast.show({ kind: "warn", message: t("file.importTextFilled") });
      return;
    }
    const mode = project.text.hyphenationMode;
    dispatch({ type: "SET_TEXT", payload: { raw: incipit, words: syllabifyText(incipit, mode), hyphenationMode: mode } });
    setProjectEpoch((n) => n + 1);
    onOpenedRef.current?.();
  }, [dispatch, t, toast]);

  // Autosave silencioso (antes na StatusBar): só quando já existe arquivo.
  useEffect(() => {
    if (!state.isDirty || !state.project || !state.currentFilePath) return;
    const timer = window.setTimeout(() => {
      void writeProject(stateRef.current.currentFilePath ?? undefined, true);
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state.isDirty, state.project, state.currentFilePath, writeProject]);

  // Estado sujo no main, para a confirmação ao fechar a janela.
  useEffect(() => {
    void window.mocquereau.setDirty(state.isDirty && state.project !== null);
  }, [state.isDirty, state.project]);

  return { newProject, open, openRecent, save, saveAs, close, importGueranger, projectEpoch };
}
