// src/renderer/components/slice-editor/editorReducer.ts

// ── Types ────────────────────────────────────────────────────────────────────

export interface EditorState {
  activeSourceId: string | null;
  activeLineId: string | null;
  dividers: number[];                 // fractions 0.0–1.0; length === activeSyllableCount - 1
  syllableRange: { start: number; end: number } | null;
  gaps: number[];                     // global syllable indices marked as gap
  hoveredSyllableIdx: number | null;  // global syllable index driving highlight
  zoom: number;                       // 1.0 === 100%
  panOffset: { x: number; y: number };
  isDirty: boolean;
}

export const initialEditorState: EditorState = {
  activeSourceId: null,
  activeLineId: null,
  dividers: [],
  syllableRange: null,
  gaps: [],
  hoveredSyllableIdx: null,
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  isDirty: false,
};

// ── Action union ─────────────────────────────────────────────────────────────

export type EditorAction =
  | {
      type: 'LOAD_SOURCE';
      payload: {
        sourceId: string;
        lineId: string;
        initialDividers: number[];
        syllableRange: { start: number; end: number };
        gaps: number[];
      };
    }
  | { type: 'SET_DIVIDERS'; payload: number[] }
  | { type: 'SET_RANGE'; payload: { start: number; end: number } }
  | { type: 'TOGGLE_GAP'; payload: number }
  | { type: 'AUTO_DISTRIBUTE' }
  | { type: 'SET_HOVER'; payload: number | null }
  | { type: 'SET_ZOOM'; payload: number }
  | { type: 'SET_PAN'; payload: { x: number; y: number } }
  | { type: 'CLEAR_LINE' }
  | { type: 'CONFIRM_COMMITTED' };

// ── Private helpers ──────────────────────────────────────────────────────────

function computeActiveSyllableCount(
  range: { start: number; end: number } | null,
  gaps: number[],
): number {
  if (!range) return 0;
  return (range.end - range.start + 1) - gaps.filter(g => g >= range.start && g <= range.end).length;
}

function evenlyDistributed(n: number): number[] {
  return Array.from({ length: Math.max(0, n - 1) }, (_, i) => (i + 1) / n);
}

// ── Reducer ──────────────────────────────────────────────────────────────────

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'LOAD_SOURCE': {
      return {
        activeSourceId: action.payload.sourceId,
        activeLineId: action.payload.lineId,
        dividers: action.payload.initialDividers,
        syllableRange: action.payload.syllableRange,
        gaps: action.payload.gaps,
        hoveredSyllableIdx: null,
        zoom: 1,
        panOffset: { x: 0, y: 0 },
        isDirty: false,
      };
    }

    case 'SET_DIVIDERS': {
      return { ...state, dividers: action.payload, isDirty: true };
    }

    case 'SET_RANGE': {
      const newRange = action.payload;
      // Remove gaps outside the new range
      const newGaps = state.gaps.filter(g => g >= newRange.start && g <= newRange.end);
      const activeSyllableCount = computeActiveSyllableCount(newRange, newGaps);
      const newDividers = evenlyDistributed(activeSyllableCount);
      return {
        ...state,
        syllableRange: newRange,
        gaps: newGaps,
        dividers: newDividers,
        isDirty: true,
      };
    }

    case 'TOGGLE_GAP': {
      if (!state.syllableRange) return state;
      const idx = action.payload;
      const gapSet = new Set(state.gaps);
      if (gapSet.has(idx)) {
        gapSet.delete(idx);
      } else {
        gapSet.add(idx);
      }
      const newGaps = Array.from(gapSet).sort((a, b) => a - b);
      const activeSyllableCount = computeActiveSyllableCount(state.syllableRange, newGaps);
      const newDividers = evenlyDistributed(activeSyllableCount);
      return {
        ...state,
        gaps: newGaps,
        dividers: newDividers,
        isDirty: true,
      };
    }

    case 'AUTO_DISTRIBUTE': {
      if (!state.syllableRange) return state;
      const activeSyllableCount = computeActiveSyllableCount(state.syllableRange, state.gaps);
      const newDividers = evenlyDistributed(activeSyllableCount);
      return { ...state, dividers: newDividers, isDirty: true };
    }

    case 'SET_HOVER': {
      return { ...state, hoveredSyllableIdx: action.payload };
    }

    case 'SET_ZOOM': {
      return { ...state, zoom: Math.max(0.25, Math.min(8, action.payload)) };
    }

    case 'SET_PAN': {
      return { ...state, panOffset: action.payload };
    }

    case 'CLEAR_LINE': {
      const activeSyllableCount = state.syllableRange
        ? computeActiveSyllableCount(state.syllableRange, [])
        : 0;
      const newDividers = evenlyDistributed(activeSyllableCount);
      return {
        ...state,
        dividers: newDividers,
        gaps: [],
        isDirty: false,
      };
    }

    case 'CONFIRM_COMMITTED': {
      return { ...state, isDirty: false };
    }

    default:
      return state;
  }
}
