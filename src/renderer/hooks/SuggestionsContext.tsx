// src/renderer/hooks/SuggestionsContext.tsx
//
// Neume suggestions of the Recortes view (spec S4, S5, S8, S10). Suggestions
// are transient session state, per page: never in the project, never in the
// undo history. What the view shows (`active`) is derived on every render from
// the project as it is now, so undo, drawing a box or marking a gap hides the
// suggestion of that syllable; a new frame (rotation/flip) or range discards
// the page's suggestions. Accepting is the only write: one UPDATE_LINE_BOXES.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { projectReducer, useProject, type ProjectAction } from "./useProject";
import { useRecortesContext } from "./RecortesContext";
import { boxesInView, frameOf, framesEqual } from "@shared/box-frame";
import type { BoxFrame } from "@shared/project-schema";
import { createNeumeDetectClient, NeumeDetectCancelledError, type NeumeDetectClient, type SuggestResult } from "../lib/neume-detect";
import { planSuggestion, regionToView } from "../lib/suggest/request";
import { loadSuggestImage, renderSuggestRaster } from "../lib/suggest/raster";
import { isLineGap } from "../lib/syllable-gap";
import { coveredByOtherPages } from "../lib/sources";
import type { ManuscriptLine, ManuscriptSource, MocquereauProject, SyllableBox } from "../lib/models";

export interface PageSuggestions {
  /** Caixas sugeridas no referencial da vista no momento do pedido. */
  boxes: Record<number, SyllableBox>;
  /** Referencial (giro/espelho) e intervalo usados no pedido: mudou = descartar (S5). */
  frame: BoxFrame;
  range: { start: number; end: number };
}

export type SuggestStatus = "idle" | "running";
export type SuggestNotice = "needsBand" | "none" | "error";

export interface SuggestionsValue {
  /** Preferência S8 (padrão true; carregada da main). */
  enabled: boolean;
  /** Grava na main; desligar descarta tudo e encerra o worker. */
  setEnabled(on: boolean): void;
  /** Da página ativa. */
  status: SuggestStatus;
  /** Sugestões vivas da página ativa (já filtradas contra o projeto atual). */
  active: Record<number, SyllableBox>;
  /** Último aviso da página ativa; null some. */
  notice: SuggestNotice | null;
  /** Changes every time a notice is set, even the same one again (a repeated hint shows again). */
  noticeSeq: number;
  suggest(): void;
  cancel(): void;
  accept(idx: number): void;
  /** Todas da página ativa, um dispatch. */
  acceptAll(): void;
  /** Some e entra nas rejeitadas da página (sessão). */
  reject(idx: number): void;
  /** Esc. */
  discardPage(): void;
  /** S10: lineIds que precisam de área. */
  suggestSource(): Promise<{ skipped: string[] }>;
}

interface Running {
  lineId: string;
  id: number | null;
}

type RunOutcome = { kind: "done"; result: SuggestResult } | { kind: "skipped" } | { kind: "cancelled" } | { kind: "error" };

const SuggestionsContext = createContext<SuggestionsValue | null>(null);

const EMPTY: Record<number, SyllableBox> = Object.freeze({}) as Record<number, SyllableBox>;

function findLine(project: MocquereauProject | null, sourceId: string | null, lineId: string | null) {
  const source = project?.sources.find((s) => s.id === sourceId) ?? null;
  const line = source?.lines.find((l) => l.id === lineId) ?? null;
  return { source, line };
}

function findLineById(project: MocquereauProject | null, lineId: string) {
  for (const source of project?.sources ?? []) {
    const line = source.lines.find((l) => l.id === lineId);
    if (line) return { source, line };
  }
  return { source: null, line: null };
}

function hasUsableImage(line: ManuscriptLine): boolean {
  const img = line.image as (ManuscriptLine["image"] & { missing?: boolean }) | undefined;
  return !!img?.dataUrl && !img.missing;
}

/** The page's suggestions still valid for the line as it is now (S5). */
function stillValid(page: PageSuggestions, line: ManuscriptLine): boolean {
  return (
    framesEqual(page.frame, frameOf(line.imageAdjustments)) &&
    page.range.start === line.syllableRange.start &&
    page.range.end === line.syllableRange.end
  );
}

/** Suggested boxes a syllable can still take: no key (box or null), no gap, no legacy crop, inside the range. */
function liveBoxes(page: PageSuggestions | undefined, source: ManuscriptSource, line: ManuscriptLine): Record<number, SyllableBox> {
  if (!page || !stillValid(page, line)) return EMPTY;
  const view = boxesInView(line);
  const out: Record<number, SyllableBox> = {};
  for (const [key, box] of Object.entries(page.boxes)) {
    const idx = Number(key);
    if (idx < line.syllableRange.start || idx > line.syllableRange.end) continue;
    if (idx in view || isLineGap(line, idx) || idx in source.syllableCuts) continue;
    out[idx] = box;
  }
  return out;
}

export function SuggestionsProvider({
  children,
  createClient = createNeumeDetectClient,
}: {
  children: ReactNode;
  createClient?: () => NeumeDetectClient;
}) {
  const { state, dispatch } = useProject();
  const recortes = useRecortesContext();
  const project = state.project;
  const { activeSourceId, activeLineId } = recortes;

  // null = preference not loaded yet: treated as off (S8: no worker before we know).
  const [enabledPref, setEnabledState] = useState<boolean | null>(null);
  const enabled = enabledPref === true;
  const [pages, setPages] = useState<ReadonlyMap<string, PageSuggestions>>(() => new Map());
  const [rejected, setRejected] = useState<ReadonlyMap<string, ReadonlySet<number>>>(() => new Map());
  const [notices, setNotices] = useState<ReadonlyMap<string, { notice: SuggestNotice; seq: number }>>(() => new Map());
  const noticeSeqRef = useRef(0);
  const [running, setRunning] = useState<Running | null>(null);

  // Async work reads the latest values, not the render that started it.
  // Kept ahead of the render after our own dispatches, so two accepts in one
  // handler each see the boxes the previous one wrote.
  const projectRef = useRef(project);
  projectRef.current = project;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const enabledRef = useRef(enabled);
  const rejectedRef = useRef(rejected);
  rejectedRef.current = rejected;
  const runningRef = useRef<Running | null>(null);
  const userChoseRef = useRef(false);
  const clientRef = useRef<NeumeDetectClient | null>(null);
  const createClientRef = useRef(createClient);
  createClientRef.current = createClient;

  /** Updates the pages state and its ref together (reads in the same handler see the change). */
  const updatePages = useCallback(
    (fn: (prev: ReadonlyMap<string, PageSuggestions>) => ReadonlyMap<string, PageSuggestions>) => {
      const next = fn(pagesRef.current);
      if (next === pagesRef.current) return;
      pagesRef.current = next;
      setPages(next);
    },
    [],
  );

  // S8: the preference lives in the main process.
  useEffect(() => {
    let alive = true;
    const get = window.mocquereau?.getSuggestionsEnabled;
    if (get) {
      get()
        .then((on) => {
          // A choice the user made meanwhile wins over the stored value.
          if (alive && typeof on === "boolean" && !userChoseRef.current) {
            enabledRef.current = on;
            setEnabledState(on);
          }
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, []);

  // The worker goes with the provider.
  useEffect(
    () => () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    },
    [],
  );

  // S5: a page whose frame or range changed (or that is gone) loses its suggestions.
  useEffect(() => {
    if (pages.size === 0) return;
    let changed = false;
    const next = new Map(pages);
    for (const [lineId, page] of pages) {
      const { line } = findLineById(project, lineId);
      if (!line || !stillValid(page, line)) {
        next.delete(lineId);
        changed = true;
      }
    }
    if (changed) updatePages(() => next);
  }, [project, pages, updatePages]);

  const setNotice = useCallback((lineId: string, notice: SuggestNotice | null) => {
    // A new seq even for the same notice: "none" twice shows the line twice.
    const seq = notice ? ++noticeSeqRef.current : 0;
    setNotices((prev) => {
      if (!notice && !prev.has(lineId)) return prev;
      const next = new Map(prev);
      if (notice) next.set(lineId, { notice, seq });
      else next.delete(lineId);
      return next;
    });
  }, []);

  // S7: a NEW needsBand result on the active page turns the band tool on, once.
  // Notices persist per page, so revisiting the page (or remounting the view)
  // must not turn it on again: the consumed seqs live here, above the view.
  const consumedBandSeqs = useRef(new Set<number>());
  const { setBandTool } = recortes;
  useEffect(() => {
    if (!activeLineId) return;
    const entry = notices.get(activeLineId);
    if (entry?.notice !== "needsBand" || consumedBandSeqs.current.has(entry.seq)) return;
    consumedBandSeqs.current.add(entry.seq);
    setBandTool(true);
  }, [activeLineId, notices, setBandTool]);

  // A band saved on a page answers its needsBand notice: the hint goes.
  useEffect(() => {
    if (!project) return;
    const answered: string[] = [];
    for (const [lineId, entry] of notices) {
      if (entry.notice !== "needsBand") continue;
      if (findLineById(project, lineId).line?.neumeBands?.length) answered.push(lineId);
    }
    if (answered.length === 0) return;
    setNotices((prev) => {
      const next = new Map(prev);
      for (const id of answered) next.delete(id);
      return next;
    });
  }, [project, notices]);

  const finish = useCallback((token: Running) => {
    if (runningRef.current !== token) return;
    runningRef.current = null;
    setRunning(null);
  }, []);

  /** One request on one page; resolves when the page's suggestions (or notice) are stored. */
  const run = useCallback(
    async (lineId: string): Promise<RunOutcome> => {
      if (!enabledRef.current || runningRef.current) return { kind: "skipped" };
      const { source, line } = findLineById(projectRef.current, lineId);
      const words = projectRef.current?.text.words;
      if (!source || !line || !words || !hasUsableImage(line)) return { kind: "skipped" };

      const covered = coveredByOtherPages(source, line.id, "");
      const plan = planSuggestion(source, line, words, covered, rejectedRef.current.get(line.id) ?? new Set());
      if (!plan) {
        setNotice(line.id, "none");
        return { kind: "skipped" };
      }

      // Frame and range at REQUEST time: a result for another frame is never shown.
      const frame = frameOf(line.imageAdjustments);
      const range = { start: line.syllableRange.start, end: line.syllableRange.end };
      const client = (clientRef.current ??= createClientRef.current());
      const token: Running = { lineId: line.id, id: null };
      runningRef.current = token;
      setRunning(token);
      setNotice(line.id, null);

      try {
        const imgEl = await loadSuggestImage(line.image.dataUrl);
        if (runningRef.current !== token) return { kind: "cancelled" };
        const image = renderSuggestRaster(imgEl, { width: line.image.width, height: line.image.height }, frame, plan.region);
        const request = client.suggest({ ...plan.input, image });
        token.id = request.id;
        const result = await request.result;
        if (runningRef.current !== token) return { kind: "cancelled" };

        if (findLineById(projectRef.current, line.id).line) {
          const boxes: Record<number, SyllableBox> = {};
          for (const s of result.suggestions) boxes[s.index] = regionToView(s.box, plan.region);
          updatePages((prev) => new Map(prev).set(line.id, { boxes, frame, range }));
          // Task 7 turns on the area tool on needsBand.
          setNotice(line.id, result.debug.needsBand ? "needsBand" : result.suggestions.length === 0 ? "none" : null);
        }
        return { kind: "done", result };
      } catch (err) {
        if (runningRef.current !== token || err instanceof NeumeDetectCancelledError) return { kind: "cancelled" };
        setNotice(line.id, "error");
        return { kind: "error" };
      } finally {
        finish(token);
      }
    },
    [finish, setNotice, updatePages],
  );

  const cancelRunning = useCallback(() => {
    const token = runningRef.current;
    if (!token) return;
    runningRef.current = null;
    setRunning(null);
    if (token.id !== null) clientRef.current?.cancel(token.id);
  }, []);

  const { source: activeSource, line: activeLine } = findLine(project, activeSourceId, activeLineId);
  const activePage = activeLineId ? pages.get(activeLineId) : undefined;
  const active = useMemo(
    () => (activeSource && activeLine ? liveBoxes(activePage, activeSource, activeLine) : EMPTY),
    [activePage, activeSource, activeLine],
  );

  /** Live suggestions of the active page from the latest project and pages (not this render's snapshot). */
  function freshActive() {
    const { source, line } = findLine(projectRef.current, activeSourceId, activeLineId);
    if (!source || !line) return null;
    return { source, line, live: liveBoxes(pagesRef.current.get(line.id), source, line) };
  }

  function acceptBoxes(pick: (live: Record<number, SyllableBox>) => Record<number, SyllableBox>) {
    const fresh = freshActive();
    if (!fresh) return;
    const { source, line } = fresh;
    const take = pick(fresh.live);
    // The page's boxes NOW: never overwrite a box or a "no neume" (null).
    const current = boxesInView(line);
    const merged: Record<number, SyllableBox | null> = { ...current };
    let any = false;
    for (const [key, box] of Object.entries(take)) {
      const idx = Number(key);
      if (idx in current) continue;
      merged[idx] = box;
      any = true;
    }
    if (!any) return;
    const action: ProjectAction = {
      type: "UPDATE_LINE_BOXES",
      payload: { sourceId: source.id, lineId: line.id, syllableBoxes: merged, confirmed: true },
    };
    dispatch(action);
    projectRef.current = projectReducer({ project: projectRef.current, isDirty: false, currentFilePath: null }, action).project;
  }

  function dropFromPage(lineId: string, idx: number) {
    updatePages((prev) => {
      const page = prev.get(lineId);
      if (!page || !(idx in page.boxes)) return prev;
      const boxes = { ...page.boxes };
      delete boxes[idx];
      return new Map(prev).set(lineId, { ...page, boxes });
    });
  }

  const value: SuggestionsValue = {
    enabled,
    setEnabled(on) {
      userChoseRef.current = true;
      setEnabledState(on);
      enabledRef.current = on;
      window.mocquereau?.setSuggestionsEnabled?.(on).catch(() => {});
      if (!on) {
        cancelRunning();
        updatePages(() => new Map());
        setRejected(new Map());
        setNotices(new Map());
        clientRef.current?.dispose();
        clientRef.current = null;
      }
    },
    status: running && running.lineId === activeLineId ? "running" : "idle",
    active,
    notice: (activeLineId && notices.get(activeLineId)?.notice) || null,
    noticeSeq: (activeLineId && notices.get(activeLineId)?.seq) || 0,
    suggest() {
      if (activeLine) void run(activeLine.id);
    },
    cancel: cancelRunning,
    accept(idx) {
      acceptBoxes((live) => (idx in live ? { [idx]: live[idx] } : {}));
    },
    acceptAll() {
      acceptBoxes((live) => live);
    },
    reject(idx) {
      if (!activeLineId) return;
      setRejected((prev) => new Map(prev).set(activeLineId, new Set(prev.get(activeLineId)).add(idx)));
      dropFromPage(activeLineId, idx);
    },
    discardPage() {
      if (!activeLineId) return;
      if (runningRef.current?.lineId === activeLineId) cancelRunning();
      updatePages((prev) => {
        if (!prev.has(activeLineId)) return prev;
        const next = new Map(prev);
        next.delete(activeLineId);
        return next;
      });
      setNotice(activeLineId, null);
    },
    async suggestSource() {
      const skipped: string[] = [];
      const source = projectRef.current?.sources.find((s) => s.id === activeSourceId);
      if (!source || !enabledRef.current) return { skipped };
      for (const { id } of source.lines) {
        const outcome = await run(id);
        if (outcome.kind === "cancelled") break;
        if (outcome.kind === "done" && outcome.result.debug.needsBand) skipped.push(id);
      }
      return { skipped };
    },
  };

  return <SuggestionsContext.Provider value={value}>{children}</SuggestionsContext.Provider>;
}

export function useSuggestions(): SuggestionsValue {
  const ctx = useContext(SuggestionsContext);
  if (!ctx) throw new Error("useSuggestions must be used inside SuggestionsProvider");
  return ctx;
}

/** null outside a SuggestionsProvider (the Recortes commands work without one). */
export function useOptionalSuggestions(): SuggestionsValue | null {
  return useContext(SuggestionsContext);
}
