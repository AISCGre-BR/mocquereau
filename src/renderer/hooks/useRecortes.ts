// src/renderer/hooks/useRecortes.ts
//
// Ephemeral state of the Recortes view (spec D6): selection, active syllable,
// zoom and the drawing toggles. Everything persistent (boxes, range, gaps) is
// read from the project; the selection is re-validated against it on every
// render, so undo/redo or a deletion never leaves it pointing at nothing.

import { useCallback, useReducer } from "react";
import type { ManuscriptLine, ManuscriptSource, MocquereauProject } from "../lib/models";
import { editorReducer, initialEditorState } from "../components/slice-editor/editorReducer";

export interface SyllableRange {
  start: number;
  end: number;
}

/** First page still to be done, else the first page. */
function defaultLine(source: ManuscriptSource): ManuscriptLine | null {
  return source.lines.find((l) => !l.confirmed) ?? source.lines[0] ?? null;
}

/** Distance from a syllable to a page's range (0 when the range contains it). */
function rangeDistance(line: ManuscriptLine, syllable: number): number {
  const { start, end } = line.syllableRange;
  if (syllable < start) return start - syllable;
  if (syllable > end) return syllable - end;
  return 0;
}

/**
 * The page whose range contains the syllable, else the one whose range is
 * nearest to it (ties: the first in page order).
 */
export function nearestPage(source: ManuscriptSource, syllable: number): ManuscriptLine | null {
  let best: ManuscriptLine | null = null;
  let bestDistance = Infinity;
  for (const l of source.lines) {
    const d = rangeDistance(l, syllable);
    if (d < bestDistance) {
      best = l;
      bestDistance = d;
    }
  }
  return best;
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
  /** "Marcar linha de neumas" (S7). */
  bandTool: boolean;
  setBandTool(on: boolean): void;
  /** Selected neume band of the active page (index into its sorted bands), or null. */
  activeBand: number | null;
  setActiveBand(i: number | null): void;
  goTo(target: { sourceId: string; syllable?: number }): void;
}

export function useRecortes(project: MocquereauProject | null): RecortesState {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);

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
    dispatch({ type: "SET_ACTIVE_SYLLABLE", payload: line.syllableRange.start });
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

  const setBandTool = useCallback((on: boolean) => dispatch({ type: "SET_BAND_TOOL", payload: on }), []);
  const setActiveBand = useCallback((i: number | null) => dispatch({ type: "SET_ACTIVE_BAND", payload: i }), []);

  function goTo(target: { sourceId: string; syllable?: number }) {
    const src = project?.sources.find((s) => s.id === target.sourceId);
    if (!src) return;
    const { syllable } = target;
    const page = syllable === undefined ? (src.lines[0] ?? null) : nearestPage(src, syllable);
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
      state.followRangeStart && line && !pendingNewLine ? line.syllableRange.start : state.activeSyllableIdx,
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
    bandTool: state.bandTool,
    setBandTool,
    // A band removed by undo or by another page's selection is no selection.
    activeBand:
      state.bandTool && state.activeBand !== null && line?.neumeBands?.[state.activeBand] && !pendingNewLine
        ? state.activeBand
        : null,
    setActiveBand,
    goTo,
  };
}
