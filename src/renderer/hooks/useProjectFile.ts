// Ações de arquivo da onda A1. Gravar/abrir (pacote .mocquereau, migração legada,
// confirmação de sobrescrita, recentes) é do main (project-io, onda A2); aqui só
// ficam o fluxo da interface, o autosave e os toasts. Recuperação e registro de
// comandos são da onda B.
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { createNewProject, useProject } from "./useProject";
import { SUGGESTED_CLASSIFICATION, cloneClassification, mergeClassification } from "../../shared/classification";
import type { Classification } from "../../shared/classification";
import { useToast } from "../ui/Toast";
import { syllabifyText } from "../lib/syllabify";
import type { MocquereauProject } from "../lib/models";
import { buildRecentMeta, firstPageLine } from "../lib/recent-meta";
import { makeThumbnail } from "../lib/thumbnail";
import { detectRealignments, loadRasterForInk, type RasterLoader } from "../lib/box-frame-realign";
import type { NewProjectDraft } from "../lib/new-project";
import { resolveUnsetRanges } from "../lib/sources";

export const AUTOSAVE_DELAY_MS = 3000;

/** Biblioteca de classificação do usuário (prefs do main); sem ela, a lista sugerida. */
async function loadLibrary(): Promise<Classification> {
  try {
    return await window.mocquereau.getClassification();
  } catch {
    return cloneClassification(SUGGESTED_CLASSIFICATION);
  }
}

export interface ProjectFileActions {
  /** Menu Ctrl+N e tela inicial: abre o guia de criação (= startNewProject). */
  newProject: () => void;
  /** Confirma o descarte do projeto aberto e abre o guia de criação. */
  startNewProject: () => void;
  /** Fecha o guia; o projeto aberto (se houver) continua como estava. */
  cancelNewProject: () => void;
  /** Cria o projeto do rascunho do guia (sem arquivo) e fecha o guia. */
  createProject: (draft: NewProjectDraft) => Promise<void>;
  /** Guia de criação aberto. */
  creating: boolean;
  open: () => Promise<void>;
  openRecent: (filePath: string) => Promise<void>;
  /** Projeto de exemplo embutido: abre sem caminho, então o primeiro Salvar vira Salvar como. */
  openExample: () => Promise<void>;
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

/** Calcula miniatura e progresso em segundo plano e os entrega ao main (sem dispatch). */
let thumbCache: { key: string; thumb: string } | null = null;

/** Miniatura da primeira página; reaproveita a última se a imagem e os ajustes não mudaram. */
async function thumbnailFor(project: MocquereauProject): Promise<string | undefined> {
  const line = firstPageLine(project);
  const dataUrl = line?.image?.dataUrl;
  if (!line || !dataUrl) return undefined;
  const adj = line.imageAdjustments;
  const key = `${adj?.rotation ?? 0}|${adj?.flipH ? 1 : 0}|${adj?.flipV ? 1 : 0}|${dataUrl}`;
  if (thumbCache?.key === key) return thumbCache.thumb;
  const thumb = await makeThumbnail(dataUrl, undefined, adj);
  if (thumb) thumbCache = { key, thumb };
  return thumb;
}

function publishRecentMeta(project: MocquereauProject, filePath: string): void {
  // Começa dentro da cadeia: qualquer erro (projeto malformado) não pode derrubar o salvamento.
  void Promise.resolve()
    .then(() => thumbnailFor(project))
    .then((thumb) => window.mocquereau.updateRecentMeta(filePath, buildRecentMeta(project, thumb)))
    .catch(() => {});
}

export function useProjectFile(options: ProjectFileOptions = {}): ProjectFileActions {
  const { state, dispatch, pending } = useProject();
  const { t } = useTranslation();
  const toast = useToast();
  const [projectEpoch, setProjectEpoch] = useState(0);
  const [creating, setCreating] = useState(false);

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
    (project: MocquereauProject, filePath: string | null, dirty = false) => {
      docGen.current += 1;
      setCreating(false);
      // Aberto do disco: limpo. Criado pelo guia com texto: ainda não está em arquivo.
      dispatch({ type: "LOAD_PROJECT", payload: { project, dirty } });
      dispatch({ type: "SET_FILE_PATH", payload: filePath });
      replaceDocument();
      onOpenedRef.current?.();
      // O main registra os arquivos abertos (inclusive legados) na lista de recentes.
    },
    [dispatch, replaceDocument],
  );

  const openSeq = useRef(0);

  /**
   * Legacy files (v0.0.6/0.0.7) did not remap boxes when the rotation changed,
   * so the migration's frame can be wrong. The ink decides; the fix is part of
   * loading (done before the project is adopted): no toast, no history step,
   * not dirty. Failures fall back to the project as read.
   */
  const realignLegacy = useCallback(async (project: MocquereauProject, isCancelled: () => boolean) => {
    try {
      const found = await detectRealignments(project, loadRasterRef.current, { isCancelled });
      if (found.length === 0) return project;
      const wanted = new Map(found.map((f) => [f.lineId, f.to] as const));
      return {
        ...project,
        sources: project.sources.map((s) => ({
          ...s,
          lines: s.lines.map((l) => {
            const frame = wanted.get(l.id);
            return frame ? { ...l, boxFrame: frame } : l;
          }),
        })),
      };
    } catch (err) {
      console.warn("[box-frame-realign] legacy realignment skipped", err);
      return project;
    }
  }, []);

  /** Opened from main: a legacy .mocquereau.json comes back without a writable path. */
  const adoptOpened = useCallback(
    async (
      project: MocquereauProject,
      filePath: string | null,
      legacy = filePath === null,
      recentPath: string | null = filePath,
    ) => {
      const seq = ++openSeq.current;
      const realigned = legacy ? await realignLegacy(project, () => seq !== openSeq.current) : project;
      // Correção silenciosa na abertura, como o realinhamento: páginas sem intervalo.
      const ready = resolveUnsetRanges(realigned);
      if (seq !== openSeq.current) return; // a newer open superseded this one
      // Valores do projeto entram na biblioteca em segundo plano: sem dispatch, o projeto não suja.
      // Leitura própria, sem fallback sugerido: se falhar, não grava (não sobrescreve a biblioteca real).
      void Promise.resolve()
        .then(() => window.mocquereau.getClassification())
        .then((lib) => window.mocquereau.setClassification(mergeClassification(lib, ready.classification)))
        .catch(() => {});
      adopt(ready, filePath);
      // Legado: sem caminho gravável, mas o main o pôs nos recentes (recentPath); a miniatura vai para lá.
      if (recentPath) publishRecentMeta(ready, recentPath);
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
        publishRecentMeta(updated, result.filePath);
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

  const creatingRef = useRef(creating);
  creatingRef.current = creating;
  const startNewProject = useCallback(() => {
    // Ctrl+N com o guia já aberto: nada a fazer (o descarte já foi confirmado).
    if (creatingRef.current || !confirmDiscard()) return;
    // As vistas desmontam sob o guia: o flush de desmontagem não vale para o projeto
    // que o usuário aceitou descartar (as pendências já foram gravadas acima).
    pending?.bump();
    setCreating(true);
  }, [confirmDiscard, pending]);

  const cancelNewProject = useCallback(() => setCreating(false), []);

  /** Um "Criar projeto" em andamento: o duplo clique não cria duas vezes. */
  const creatingProject = useRef(false);
  const createProject = useCallback(
    async (draft: NewProjectDraft) => {
      if (creatingProject.current) return;
      creatingProject.current = true;
      try {
        const library = await loadLibrary();
        const project = createNewProject(draft.title.trim() || t("file.untitled"), draft.author.trim(), library);
        adopt(
          { ...project, text: { raw: draft.raw, words: draft.words, hyphenationMode: draft.mode } },
          null,
          draft.raw.trim() !== "",
        );
      } finally {
        creatingProject.current = false;
      }
    },
    [adopt, t],
  );

  const open = useCallback(async () => {
    if (!confirmDiscard()) return;
    const result = await window.mocquereau.openProject();
    if (result) await adoptOpened(result.project, result.filePath, undefined, result.recentPath ?? result.filePath);
  }, [adoptOpened, confirmDiscard]);

  const openRecent = useCallback(
    async (filePath: string) => {
      if (!confirmDiscard()) return;
      const result = await window.mocquereau.openProjectByPath(filePath).catch(() => null);
      if (!result) {
        toast.show({ kind: "error", message: t("file.openError", { filePath }) });
        return;
      }
      await adoptOpened(result.project, result.filePath, undefined, result.recentPath ?? result.filePath);
    },
    [adoptOpened, confirmDiscard, t, toast],
  );

  const openExample = useCallback(async () => {
    if (!confirmDiscard()) return;
    const result = await window.mocquereau.openExample().catch(() => null);
    if (!result) {
      toast.show({ kind: "error", message: t("file.exampleError") });
      return;
    }
    // Sem caminho, mas não é arquivo legado: sem realinhamento de caixas (o exemplo não tem caixas).
    await adoptOpened(result.project, result.filePath, false, null);
  }, [adoptOpened, confirmDiscard, t, toast]);

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

  // Autosave silencioso (antes na StatusBar): só quando já existe arquivo. Com o guia
  // aberto, não: o usuário pode ter aceitado descartar o projeto que está por baixo.
  useEffect(() => {
    if (creating || !state.isDirty || !state.project || !state.currentFilePath) return;
    const timer = window.setTimeout(() => {
      void writeProject("save", true);
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [creating, state.isDirty, state.project, state.currentFilePath, writeProject]);

  // Estado sujo no main, para a confirmação ao fechar a janela.
  // Encerra o ciclo de markPending: a partir daqui o estado do projeto manda.
  useEffect(() => {
    pending?.settle();
    void window.mocquereau.setDirty(state.isDirty && state.project !== null);
  }, [state.isDirty, state.project, pending]);

  return {
    newProject: startNewProject,
    startNewProject,
    cancelNewProject,
    createProject,
    creating,
    open,
    openRecent,
    openExample,
    save,
    saveAs,
    close,
    importGueranger,
    projectEpoch,
  };
}
