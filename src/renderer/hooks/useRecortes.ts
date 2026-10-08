// src/renderer/hooks/useRecortes.ts
//
// Ephemeral state of the Recortes view (spec D6): selection, active syllable,
// zoom and the drawing toggles. Everything persistent (boxes, range, gaps) is
// read from the project; the selection is re-validated against it on every
// render, so undo/redo or a deletion never leaves it pointing at nothing.

import { useCallback, useMemo, useReducer } from "react";
import type { ManuscriptLine, ManuscriptSource, MocquereauProject } from "../lib/models";
import { flattenSyllables } from "../lib/sliceUtils";
import { editorReducer, initialEditorState } from "../components/slice-editor/editorReducer";

export interface SyllableRange {
  start: number;
  end: number;
}

/**
 * The range a page works on. Pages added without a range ({0,0}, e.g. from the
 * Fontes view) cover the whole text until their range is set.
 */
export function effectiveRange(line: ManuscriptLine, totalSyllables: number): SyllableRange {
  const r = line.syllableRange;
  if (r.start === 0 && r.end === 0) return { start: 0, end: Math.max(0, totalSyllables - 1) };
  return r;
}

/** First page still to be done, else the first page. */
function defaultLine(source: ManuscriptSource): ManuscriptLine | null {
  return source.lines.find((l) => !l.confirmed) ?? source.lines[0] ?? null;
}

export interface RecortesState {
  activeSourceId: string | null;
  activeLineId: string | null;
  activeSyllable: number | null;
  selectSource(id: string): void;
  selectLine(sourceId: string, lineId: string): void;
  setActiveSyllable(i: number | null): void;
  zoom: number;
  setZoom(zoom: number): void;
  drawMode: boolean;
  setDrawMode(on: boolean): void;
  sameSize: boolean;
  setSameSize(on: boolean): void;
  showAll: boolean;
  setShowAll(on: boolean): void;
  imagePanelOpen: boolean;
  setImagePanelOpen(open: boolean): void;
  goTo(target: { sourceId: string; syllable?: number }): void;
}

export function useRecortes(project: MocquereauProject | null): RecortesState {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const total = useMemo(() => (project ? flattenSyllables(project.text.words).length : 0), [project]);

  // Resolve the stored selection against the project as it is now.
  const sources = project?.sources ?? [];
  const source = sources.find((s) => s.id === state.activeSourceId) ?? sources[0] ?? null;
  const sameSource = source !== null && source.id === state.activeSourceId;
  const storedLine = sameSource ? source.lines.find((l) => l.id === state.activeLineId) : undefined;
  const line = storedLine ?? (source ? defaultLine(source) : null);
  const sourceId = source?.id ?? null;
  const lineId = line?.id ?? null;

  // Selection fell back (first render, undo, deletion): store it, with the
  // active syllable at the start of the page. A page selected in the same tick
  // it was added is not in the project yet: keep the selection until it is.
  const pendingNewLine = sameSource && state.activeLineId !== null && storedLine === undefined && state.followRangeStart;
  if ((sourceId !== state.activeSourceId || lineId !== state.activeLineId) && !pendingNewLine) {
    dispatch({ type: "SELECT", payload: { sourceId, lineId } });
  } else if (state.followRangeStart && line && storedLine) {
    dispatch({ type: "SET_ACTIVE_SYLLABLE", payload: effectiveRange(line, total).start });
  }

  const selectSource = useCallback(
    (id: string) => dispatch({ type: "SELECT", payload: { sourceId: id, lineId: null } }),
    [],
  );
  const selectLine = useCallback(
    (sid: string, lid: string) => dispatch({ type: "SELECT", payload: { sourceId: sid, lineId: lid } }),
    [],
  );
  const setActiveSyllable = useCallback(
    (i: number | null) => dispatch({ type: "SET_ACTIVE_SYLLABLE", payload: i }),
    [],
  );
  const setZoom = useCallback((z: number) => dispatch({ type: "SET_ZOOM", payload: z }), []);
  const setDrawMode = useCallback((on: boolean) => dispatch({ type: "SET_DRAW_MODE", payload: on }), []);
  const setSameSize = useCallback((on: boolean) => dispatch({ type: "SET_SAME_SIZE", payload: on }), []);
  const setShowAll = useCallback((on: boolean) => dispatch({ type: "SET_SHOW_ALL", payload: on }), []);
  const setImagePanelOpen = useCallback(
    (open: boolean) => dispatch({ type: "SET_IMAGE_PANEL_OPEN", payload: open }),
    [],
  );

  function goTo(target: { sourceId: string; syllable?: number }) {
    const src = project?.sources.find((s) => s.id === target.sourceId);
    if (!src) return;
    const { syllable } = target;
    const containing =
      syllable === undefined
        ? undefined
        : src.lines.find((l) => {
            const r = effectiveRange(l, total);
            return r.start <= syllable && syllable <= r.end;
          });
    const page = containing ?? src.lines[0] ?? null;
    dispatch({
      type: "SELECT",
      payload: { sourceId: src.id, lineId: page?.id ?? null, activeSyllableIdx: syllable },
    });
  }

  // A pending SELECT/SET_ACTIVE_SYLLABLE above re-renders before commit;
  // expose the resolved values so consumers never see a dangling selection.
  return {
    activeSourceId: sourceId,
    activeLineId: pendingNewLine ? state.activeLineId : lineId,
    activeSyllable:
      state.followRangeStart && line && !pendingNewLine ? effectiveRange(line, total).start : state.activeSyllableIdx,
    selectSource,
    selectLine,
    setActiveSyllable,
    zoom: state.zoom,
    setZoom,
    drawMode: state.drawMode,
    setDrawMode,
    sameSize: state.sameSize,
    setSameSize,
    showAll: state.showAll,
    setShowAll,
    imagePanelOpen: state.imagePanelOpen,
    setImagePanelOpen,
    goTo,
  };
}
