// Ações de arquivo da onda A1. Gravar/abrir (pacote .mocquereau, migração legada,
// confirmação de sobrescrita, recentes) é do main (project-io, onda A2); aqui só
// ficam o fluxo da interface, o autosave e os toasts. Recuperação e registro de
// comandos são da onda B.
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { createNewProject, useProject } from "./useProject";
import { useToast } from "../ui/Toast";
import { syllabifyText } from "../lib/syllabify";
import type { ManuscriptLine, MocquereauProject } from "../lib/models";
import { detectRealignments, loadRasterForInk, type RasterLoader } from "../lib/box-frame-realign";

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

export interface ProjectFileOptions {
  onOpened?: () => void;
  /** Decodes a line image for the legacy box realignment (tests inject a fake). */
  loadRaster?: RasterLoader;
}

/** Same boxes, frame and adjustments: the scored line is still the line on screen. */
function sameBoxGeometry(a: ManuscriptLine, b: ManuscriptLine): boolean {
  return (
    a.syllableBoxes === b.syllableBoxes &&
    a.boxFrame === b.boxFrame &&
    (a.imageAdjustments?.rotation ?? 0) === (b.imageAdjustments?.rotation ?? 0) &&
    !!a.imageAdjustments?.flipH === !!b.imageAdjustments?.flipH &&
    !!a.imageAdjustments?.flipV === !!b.imageAdjustments?.flipV
  );
}

export function useProjectFile(options: ProjectFileOptions = {}): ProjectFileActions {
  const { state, dispatch, pending } = useProject();
  const { t } = useTranslation();
  const toast = useToast();
  const [projectEpoch, setProjectEpoch] = useState(0);

  const stateRef = useRef(state);
  stateRef.current = state;
  const onOpenedRef = useRef(options.onOpened);
  onOpenedRef.current = options.onOpened;
  const loadRasterRef = useRef<RasterLoader>(options.loadRaster ?? loadRasterForInk);
  loadRasterRef.current = options.loadRaster ?? loadRasterForInk;
  const lastAutosaveError = useRef<string | null>(null);
  /**
   * Geração do documento: muda quando o projeto é trocado (adopt) ou fechado. Um
   * salvamento que termina depois disso não pode marcar o novo projeto como salvo
   * nem vinculá-lo ao arquivo do anterior. (pending.epoch() não serve: Desfazer o muda.)
   */
  const docGen = useRef(0);

  /**
   * Grava as edições pendentes das vistas (debounces de 300 ms) e re-renderiza na
   * hora, para stateRef refletir o projeto com elas.
   */
  const flushPending = useCallback(() => {
    if (!pending) return;
    flushSync(() => {
      pending.flushAll();
    });
  }, [pending]);

  /** O documento sob as vistas vai ser trocado: remonta e descarta flushes de desmontagem. */
  const replaceDocument = useCallback(() => {
    pending?.bump();
    setProjectEpoch((n) => n + 1);
  }, [pending]);

  const confirmDiscard = useCallback((): boolean => {
    flushPending();
    const s = stateRef.current;
    if (!s.project || !s.isDirty) return true;
    return window.confirm(t("file.confirmDiscard"));
  }, [flushPending, t]);

  const adopt = useCallback(
    (project: MocquereauProject, filePath: string | null) => {
      docGen.current += 1;
      dispatch({ type: "SET_PROJECT", payload: project });
      dispatch({ type: "SET_FILE_PATH", payload: filePath });
      replaceDocument();
      onOpenedRef.current?.();
      // O main registra os arquivos abertos (inclusive legados) na lista de recentes.
    },
    [dispatch, replaceDocument],
  );

  /**
   * Legacy files (v0.0.6/0.0.7) did not remap boxes when the rotation changed,
   * so the migration's frame can be wrong. The ink decides; a fix is one
   * undoable step, announced with a toast.
   */
  const realignLegacy = useCallback(
    async (project: MocquereauProject) => {
      const gen = docGen.current;
      const found = await detectRealignments(project, loadRasterRef.current, {
        isCancelled: () => gen !== docGen.current,
      });
      if (found.length === 0 || gen !== docGen.current) return;
      const current = stateRef.current.project;
      if (!current) return;
      const scored = new Map(project.sources.flatMap((s) => s.lines.map((l) => [l.id, l] as const)));
      const live = new Map(current.sources.flatMap((s) => s.lines.map((l) => [l.id, l] as const)));
      // Lines edited while the ink was being read keep what the user did.
      const updates = found
        .filter((f) => {
          const before = scored.get(f.lineId);
          const now = live.get(f.lineId);
          return !!before && !!now && sameBoxGeometry(before, now);
        })
        .map((f) => ({ lineId: f.lineId, frame: f.to }));
      if (updates.length === 0) return;
      dispatch({ type: "SET_LINE_BOX_FRAME", payload: updates });
      toast.show({
        kind: "ok",
        message: t("realign.applied", { count: updates.length }),
        action: { label: t("realign.undo"), onSelect: () => dispatch({ type: "UNDO" }) },
      });
    },
    [dispatch, t, toast],
  );

  /** Opened from main: a legacy .mocquereau.json comes back without a writable path. */
  const adoptOpened = useCallback(
    (project: MocquereauProject, filePath: string | null) => {
      adopt(project, filePath);
      if (filePath === null) void realignLegacy(project);
    },
    [adopt, realignLegacy],
  );

  const writeProject = useCallback(
    async (mode: "save" | "saveAs", silent: boolean): Promise<boolean> => {
      if (!silent) flushPending();
      const s = stateRef.current;
      if (!s.project) return false;
      // B2 (onda A2): o ponto salvo é este snapshot, não o que existir quando o main responder.
      const snapshot = s.project;
      const updated = { ...snapshot, meta: { ...snapshot.meta, updatedAt: new Date().toISOString() } };
      const currentPath = s.currentFilePath ?? undefined;
      const gen = docGen.current;
      try {
        // Arquivo legado aberto tem filePath null: "Salvar" vira "Salvar como" para .mocquereau
        // (decidido no main, que também confirma sobrescrita e registra o recente).
        const result =
          mode === "saveAs"
            ? await window.mocquereau.saveProjectAs(updated, currentPath)
            : await window.mocquereau.saveProject(updated, currentPath);
        if (!result) return false; // diálogo cancelado ou erro já mostrado pelo main
        lastAutosaveError.current = null;
        // Documento trocado durante a gravação: o arquivo foi gravado, mas o
        // resultado não pertence ao projeto atual.
        if (gen === docGen.current) {
          dispatch({ type: "SAVE_SUCCESS", payload: { project: snapshot } });
          if (result.filePath !== stateRef.current.currentFilePath) {
            dispatch({ type: "SET_FILE_PATH", payload: result.filePath });
          }
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
    [dispatch, flushPending, t, toast],
  );

  const save = useCallback(() => writeProject("save", false), [writeProject]);
  const saveAs = useCallback(() => writeProject("saveAs", false), [writeProject]);

  const newProject = useCallback(() => {
    if (!confirmDiscard()) return;
    adopt(createNewProject(t("file.untitled"), ""), null);
  }, [adopt, confirmDiscard, t]);

  const open = useCallback(async () => {
    if (!confirmDiscard()) return;
    const result = await window.mocquereau.openProject();
    if (result) adoptOpened(result.project, result.filePath);
  }, [adoptOpened, confirmDiscard]);

  const openRecent = useCallback(
    async (filePath: string) => {
      if (!confirmDiscard()) return;
      const result = await window.mocquereau.openProjectByPath(filePath).catch(() => null);
      if (!result) {
        toast.show({ kind: "error", message: t("file.openError", { filePath }) });
        return;
      }
      adoptOpened(result.project, result.filePath);
    },
    [adoptOpened, confirmDiscard, t, toast],
  );

  const close = useCallback(() => {
    if (!confirmDiscard()) return;
    docGen.current += 1;
    dispatch({ type: "RESET" });
    replaceDocument();
  }, [confirmDiscard, dispatch, replaceDocument]);

  const importGueranger = useCallback(async () => {
    if (!stateRef.current.project) return;
    flushPending(); // texto digitado agora conta para "o texto já está preenchido"
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
    replaceDocument();
    onOpenedRef.current?.();
  }, [dispatch, flushPending, replaceDocument, t, toast]);

  // Autosave silencioso (antes na StatusBar): só quando já existe arquivo.
  useEffect(() => {
    if (!state.isDirty || !state.project || !state.currentFilePath) return;
    const timer = window.setTimeout(() => {
      void writeProject("save", true);
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state.isDirty, state.project, state.currentFilePath, writeProject]);

  // Estado sujo no main, para a confirmação ao fechar a janela.
  // Encerra o ciclo de markPending: a partir daqui o estado do projeto manda.
  useEffect(() => {
    pending?.settle();
    void window.mocquereau.setDirty(state.isDirty && state.project !== null);
  }, [state.isDirty, state.project, pending]);

  return { newProject, open, openRecent, save, saveAs, close, importGueranger, projectEpoch };
}
