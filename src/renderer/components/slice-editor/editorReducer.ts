// src/renderer/components/slice-editor/editorReducer.ts

import type { SyllableBox } from '../../lib/models';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EditorState {
  activeSourceId: string | null;
  activeLineId: string | null;
  dividers: number[];                 // fractions 0.0–1.0; length === activeSyllableCount - 1
  syllableRange: { start: number; end: number } | null;
  gaps: number[];                     // global syllable indices marked as gap
  coveredSyllables: number[];         // global indices confirmed in OTHER lines of same source
  hoveredSyllableIdx: number | null;  // global syllable index driving highlight
  zoom: number;                       // 1.0 === 100%
  panOffset: { x: number; y: number };
  isDirty: boolean;
  /** Index of the syllable currently being box-edited (global idx), or null */
  activeSyllableIdx: number | null;
  /** In-flight boxes: Record<globalSyllableIdx, SyllableBox | null> */
  syllableBoxes: Record<number, SyllableBox | null>;
}

export const initialEditorState: EditorState = {
  activeSourceId: null,
  activeLineId: null,
  dividers: [],
  syllableRange: null,
  gaps: [],
  coveredSyllables: [],
  hoveredSyllableIdx: null,
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  isDirty: false,
  activeSyllableIdx: null,
  syllableBoxes: {},
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
        coveredSyllables?: number[];  // optional — backward compatible
        syllableBoxes?: Record<number, SyllableBox | null>;
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
  | { type: 'CONFIRM_COMMITTED' }
  | { type: 'ADD_LINE' }
  | {
      type: 'SWITCH_LINE';
      payload: {
        lineId: string;
        initialDividers: number[];
        syllableRange: { start: number; end: number } | null;
        gaps: number[];
        coveredSyllables: number[];  // indices confirmed in OTHER lines
        syllableBoxes?: Record<number, SyllableBox | null>;
      };
    }
  | {
      type: 'REMOVE_LINE';
      payload: { lineId: string };
    }
  | {
      type: 'SET_BOX';
      payload: { syllableIdx: number; box: SyllableBox };
    }
  | {
      type: 'DELETE_BOX';
      payload: { syllableIdx: number };
    }
  | {
      type: 'SET_ACTIVE_SYLLABLE';
      payload: number | null;
    };

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
      // Auto-select first syllable in range so user can immediately start drawing
      const autoActive = action.payload.syllableRange?.start ?? null;
      return {
        activeSourceId: action.payload.sourceId,
        activeLineId: action.payload.lineId,
        dividers: action.payload.initialDividers,
        syllableRange: action.payload.syllableRange,
        gaps: action.payload.gaps,
        coveredSyllables: action.payload.coveredSyllables ?? [],
        hoveredSyllableIdx: null,
        zoom: 1,
        panOffset: { x: 0, y: 0 },
        isDirty: false,
        activeSyllableIdx: autoActive,
        syllableBoxes: action.payload.syllableBoxes ?? {},
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
        activeSyllableIdx: null,
        syllableBoxes: {},
      };
    }

    case 'CONFIRM_COMMITTED': {
      return { ...state, isDirty: false };
    }

    case 'ADD_LINE': {
      // Pure marker action — SliceEditor will follow with SWITCH_LINE
      return state;
    }

    case 'SWITCH_LINE': {
      const { lineId, initialDividers, syllableRange, gaps, coveredSyllables } = action.payload;
      const activeSyllableCount = computeActiveSyllableCount(syllableRange, gaps);
      const dividers = initialDividers.length > 0
        ? initialDividers
        : evenlyDistributed(activeSyllableCount);
      // Auto-select first syllable in range
      const autoActive = syllableRange?.start ?? null;
      return {
        ...state,
        activeLineId: lineId,
        dividers,
        syllableRange: syllableRange ?? null,
        gaps,
        coveredSyllables,
        hoveredSyllableIdx: null,
        zoom: 1,
        panOffset: { x: 0, y: 0 },
        isDirty: false,
        activeSyllableIdx: autoActive,
        syllableBoxes: action.payload.syllableBoxes ?? {},
      };
    }

    case 'REMOVE_LINE': {
      if (state.activeLineId !== action.payload.lineId) return state;
      // Active line was removed — clear to empty state
      return {
        ...state,
        activeLineId: null,
        dividers: [],
        syllableRange: null,
        gaps: [],
        coveredSyllables: [],
        isDirty: false,
        activeSyllableIdx: null,
        syllableBoxes: {},
      };
    }

    case 'SET_BOX': {
      const { syllableIdx, box } = action.payload;
      const updated = { ...state.syllableBoxes, [syllableIdx]: box };
      return { ...state, syllableBoxes: updated, isDirty: true };
    }

    case 'DELETE_BOX': {
      const { syllableIdx } = action.payload;
      const updated = { ...state.syllableBoxes, [syllableIdx]: null };
      return { ...state, syllableBoxes: updated, isDirty: true };
    }

    case 'SET_ACTIVE_SYLLABLE': {
      return { ...state, activeSyllableIdx: action.payload };
    }

    default:
      return state;
  }
}
