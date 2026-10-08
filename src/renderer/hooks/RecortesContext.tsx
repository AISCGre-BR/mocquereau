// src/renderer/hooks/RecortesContext.tsx
//
// useRecortes lifted above the views: the App toolbar (RecortesTools), the
// window menu (Recortes) and the view itself read the same selection and
// toggles. The provider also holds which Recortes dialog is open, so a menu
// item can open a dialog that the view renders.

import { createContext, useContext, useState, type ReactNode } from "react";
import { useProject } from "./useProject";
import { useRecortes, type RecortesState } from "./useRecortes";
import { boxesInView, hasAnyBox } from "@shared/box-frame";
import type { RecortesMenuState } from "../shell/menus";

export type RecortesDialog = "clearPage" | "realign" | null;

export interface RecortesContextValue extends RecortesState {
  dialog: RecortesDialog;
  setDialog(dialog: RecortesDialog): void;
}

const RecortesContext = createContext<RecortesContextValue | null>(null);

export function RecortesProvider({ children }: { children: ReactNode }) {
  const { state } = useProject();
  const recortes = useRecortes(state.project);
  const [dialog, setDialog] = useState<RecortesDialog>(null);
  return <RecortesContext.Provider value={{ ...recortes, dialog, setDialog }}>{children}</RecortesContext.Provider>;
}

export function useRecortesContext(): RecortesContextValue {
  const ctx = useContext(RecortesContext);
  if (!ctx) throw new Error("useRecortesContext must be used inside RecortesProvider");
  return ctx;
}

export interface RecortesCommands {
  state: RecortesMenuState;
  /** Removes the active syllable's box (menu, Delete). */
  removeBox(): void;
  /** Removes the box of syllable `idx` on the active page: the one path for every removal. */
  removeBoxAt(idx: number): void;
  /** Opens the confirmation; clearActivePage does the clearing. */
  clearPage(): void;
  clearActivePage(): void;
  realignBoxes(): void;
  nextSource(): void;
}

/** The Recortes menu commands (window menu, sheet context menu, keyboard). */
export function useRecortesCommands(): RecortesCommands {
  const { state, dispatch } = useProject();
  const recortes = useRecortesContext();
  const project = state.project;
  const sources = project?.sources ?? [];
  const sourceIdx = sources.findIndex((s) => s.id === recortes.activeSourceId);
  const source = sourceIdx >= 0 ? sources[sourceIdx] : null;
  const line = source?.lines.find((l) => l.id === recortes.activeLineId) ?? null;
  const active = recortes.activeSyllable;
  const viewBoxes = line ? boxesInView(line) : {};
  const hasActiveBox = active !== null && viewBoxes[active] != null;
  const pageHasWork = !!line && (hasAnyBox(line.syllableBoxes) || line.gaps.length > 0 || line.confirmed);

  function removeBoxAt(idx: number) {
    if (!source || !line || viewBoxes[idx] == null) return;
    // Removing a box leaves the syllable pending (key absent), not a gap (null).
    const boxes = { ...viewBoxes };
    delete boxes[idx];
    dispatch({
      type: "UPDATE_LINE_BOXES",
      payload: { sourceId: source.id, lineId: line.id, syllableBoxes: boxes, confirmed: hasAnyBox(boxes) },
    });
  }

  function clearActivePage() {
    if (!source || !line) return;
    const syllableCuts = { ...source.syllableCuts };
    for (let i = line.syllableRange.start; i <= line.syllableRange.end; i++) delete syllableCuts[i];
    const { boxFrame: _drop, ...rest } = line;
    const cleared = { ...rest, dividers: [], gaps: [], syllableBoxes: {}, confirmed: false };
    dispatch({
      type: "UPDATE_SOURCE",
      payload: { ...source, syllableCuts, lines: source.lines.map((l) => (l.id === line.id ? cleared : l)) },
    });
    recortes.setActiveSyllable(line.syllableRange.start);
  }

  return {
    state: {
      canRemoveBox: hasActiveBox,
      canClearPage: pageHasWork,
      canRealign: !!line && hasAnyBox(line.syllableBoxes),
      hasNextSource: sourceIdx >= 0 && sourceIdx < sources.length - 1,
    },
    removeBox: () => {
      if (active !== null) removeBoxAt(active);
    },
    removeBoxAt,
    clearPage: () => {
      if (pageHasWork) recortes.setDialog("clearPage");
    },
    clearActivePage,
    realignBoxes: () => {
      if (line && hasAnyBox(line.syllableBoxes)) recortes.setDialog("realign");
    },
    nextSource: () => {
      const next = sourceIdx >= 0 ? sources[sourceIdx + 1] : undefined;
      if (next) recortes.selectSource(next.id);
    },
  };
}
