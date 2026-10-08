// src/renderer/hooks/useTableZoom.ts
//
// Zoom of the Tabela view, lifted above the views: the App toolbar
// (TabelaTools) and the table (TablePreview) read the same value. Session
// state only, never saved. Discrete presets: the table scales its layout
// sizes instead of using a CSS transform, so sticky header and column keep
// working at every level.

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const ZOOM_PRESETS = [50, 75, 100, 125, 150] as const;
export type ZoomLevel = (typeof ZOOM_PRESETS)[number];

export interface TableZoom {
  zoom: ZoomLevel;
  zoomIn(): void;
  zoomOut(): void;
  zoomReset(): void;
}

const TableZoomContext = createContext<TableZoom | null>(null);

export function TableZoomProvider({ children }: { children: ReactNode }) {
  const [zoom, setZoom] = useState<ZoomLevel>(100);
  const zoomIn = useCallback(() => setZoom((z) => ZOOM_PRESETS[Math.min(ZOOM_PRESETS.indexOf(z) + 1, ZOOM_PRESETS.length - 1)]), []);
  const zoomOut = useCallback(() => setZoom((z) => ZOOM_PRESETS[Math.max(ZOOM_PRESETS.indexOf(z) - 1, 0)]), []);
  const zoomReset = useCallback(() => setZoom(100), []);
  const value = useMemo(() => ({ zoom, zoomIn, zoomOut, zoomReset }), [zoom, zoomIn, zoomOut, zoomReset]);
  return createElement(TableZoomContext.Provider, { value }, children);
}

export function useTableZoom(): TableZoom {
  const ctx = useContext(TableZoomContext);
  if (!ctx) throw new Error("useTableZoom must be used inside TableZoomProvider");
  return ctx;
}

/**
 * Ctrl+= / Ctrl+- / Ctrl+0 zoom the table. Called by the table itself, so the
 * shortcuts only act while the Tabela view is mounted, and not while focus is
 * in a dialog or an editable element. preventDefault keeps Electron's page
 * zoom out of the way.
 */
export function useTableZoomShortcuts(): void {
  const { zoomIn, zoomOut, zoomReset } = useTableZoom();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      // A dialog (Exportar) or a text field keeps its own keys.
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [role=dialog]"))) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0") {
        e.preventDefault();
        zoomReset();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIn, zoomOut, zoomReset]);
}
