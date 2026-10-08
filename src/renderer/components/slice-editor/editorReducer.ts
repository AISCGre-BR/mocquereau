// src/renderer/components/slice-editor/editorReducer.ts
//
// Ephemeral state of the Recortes view (spec D6): what is selected and how the
// sheet is shown. Boxes, range and gaps are NOT here: they are read from the
// project on every render and written to it at the end of each gesture.

import { clampZoom } from '../../lib/canvas-zoom';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EditorState {
  activeSourceId: string | null;
  activeLineId: string | null;
  /** Global index of the syllable being boxed, or null. */
  activeSyllableIdx: number | null;
  /**
   * The active syllable follows the start of the selected page's range until
   * the page is known (a page selected in the same tick it is added).
   */
  followRangeStart: boolean;
  zoom: number; // 1.0 === 100%
  drawMode: boolean;
  sameSize: boolean;
  showAll: boolean;
  imagePanelOpen: boolean;
}

export const initialEditorState: EditorState = {
  activeSourceId: null,
  activeLineId: null,
  activeSyllableIdx: null,
  followRangeStart: true,
  zoom: 1,
  drawMode: true,
  sameSize: false,
  showAll: true,
  imagePanelOpen: false,
};

// ── Action union ─────────────────────────────────────────────────────────────

export type EditorAction =
  | {
      /**
       * Selects a source and page. Without activeSyllableIdx the active syllable
       * is the start of the page's range. Resets zoom and closes the image panel.
       */
      type: 'SELECT';
      payload: { sourceId: string | null; lineId: string | null; activeSyllableIdx?: number };
    }
  | { type: 'SET_ACTIVE_SYLLABLE'; payload: number | null }
  | { type: 'SET_ZOOM'; payload: number }
  | { type: 'SET_DRAW_MODE'; payload: boolean }
  | { type: 'SET_SAME_SIZE'; payload: boolean }
  | { type: 'SET_SHOW_ALL'; payload: boolean }
  | { type: 'SET_IMAGE_PANEL_OPEN'; payload: boolean };

// ── Reducer ──────────────────────────────────────────────────────────────────

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SELECT': {
      const { sourceId, lineId, activeSyllableIdx } = action.payload;
      return {
        ...state,
        activeSourceId: sourceId,
        activeLineId: lineId,
        activeSyllableIdx: activeSyllableIdx ?? null,
        followRangeStart: activeSyllableIdx === undefined,
        zoom: 1,
        imagePanelOpen: false,
      };
    }

    case 'SET_ACTIVE_SYLLABLE':
      return { ...state, activeSyllableIdx: action.payload, followRangeStart: false };

    case 'SET_ZOOM':
      return { ...state, zoom: clampZoom(action.payload) };

    case 'SET_DRAW_MODE':
      return { ...state, drawMode: action.payload };

    case 'SET_SAME_SIZE':
      return { ...state, sameSize: action.payload };

    case 'SET_SHOW_ALL':
      return { ...state, showAll: action.payload };

    case 'SET_IMAGE_PANEL_OPEN':
      return { ...state, imagePanelOpen: action.payload };

    default:
      return state;
  }
}
