// src/renderer/components/slice-editor/editorReducer.test.ts

import { describe, it, expect } from 'vitest';
import { editorReducer, initialEditorState, EditorState } from './editorReducer';

// ── Helper ────────────────────────────────────────────────────────────────────

function stateWithLine(): EditorState {
  return {
    ...initialEditorState,
    activeSourceId: 'src-1',
    activeLineId: 'line-1',
    syllableRange: { start: 0, end: 4 },
    gaps: [2],
    dividers: [0.25, 0.5, 0.75], // 4 active syllables → 3 dividers
    coveredSyllables: [],
    isDirty: true,
  };
}

// ── initialEditorState ────────────────────────────────────────────────────────

describe('initialEditorState', () => {
  it('has coveredSyllables: []', () => {
    expect(initialEditorState.coveredSyllables).toEqual([]);
  });

  it('has all other fields at their default values', () => {
    expect(initialEditorState.activeSourceId).toBeNull();
    expect(initialEditorState.activeLineId).toBeNull();
    expect(initialEditorState.dividers).toEqual([]);
    expect(initialEditorState.syllableRange).toBeNull();
    expect(initialEditorState.gaps).toEqual([]);
    expect(initialEditorState.hoveredSyllableIdx).toBeNull();
    expect(initialEditorState.zoom).toBe(1);
    expect(initialEditorState.panOffset).toEqual({ x: 0, y: 0 });
    expect(initialEditorState.isDirty).toBe(false);
  });
});

// ── LOAD_SOURCE with coveredSyllables ─────────────────────────────────────────

describe('LOAD_SOURCE', () => {
  it('stores coveredSyllables from payload', () => {
    const result = editorReducer(initialEditorState, {
      type: 'LOAD_SOURCE',
      payload: {
        sourceId: 'src-1',
        lineId: 'line-1',
        initialDividers: [],
        syllableRange: { start: 0, end: 5 },
        gaps: [],
        coveredSyllables: [0, 1, 2],
      },
    });
    expect(result.coveredSyllables).toEqual([0, 1, 2]);
  });

  it('defaults coveredSyllables to [] when not provided (backward-compat)', () => {
    const payloadWithoutCovered = {
      sourceId: 'src-1',
      lineId: 'line-1',
      initialDividers: [],
      syllableRange: { start: 0, end: 5 },
      gaps: [],
    };
    const result = editorReducer(initialEditorState, {
      type: 'LOAD_SOURCE',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: payloadWithoutCovered as any,
    });
    expect(result.coveredSyllables).toEqual([]);
  });
});

// ── ADD_LINE ──────────────────────────────────────────────────────────────────

describe('ADD_LINE', () => {
  it('returns state unchanged (pure marker — SliceEditor follows with SWITCH_LINE)', () => {
    const state = stateWithLine();
    const result = editorReducer(state, { type: 'ADD_LINE' });
    expect(result).toStrictEqual(state);
  });
});

// ── SWITCH_LINE ───────────────────────────────────────────────────────────────

describe('SWITCH_LINE', () => {
  it('updates activeLineId', () => {
    const result = editorReducer(stateWithLine(), {
      type: 'SWITCH_LINE',
      payload: {
        lineId: 'line-2',
        initialDividers: [],
        syllableRange: { start: 5, end: 9 },
        gaps: [],
        coveredSyllables: [0, 1, 2, 3, 4],
      },
    });
    expect(result.activeLineId).toBe('line-2');
  });

  it('loads coveredSyllables from payload', () => {
    const result = editorReducer(stateWithLine(), {
      type: 'SWITCH_LINE',
      payload: {
        lineId: 'line-2',
        initialDividers: [],
        syllableRange: { start: 5, end: 9 },
        gaps: [],
        coveredSyllables: [0, 1, 2, 3, 4],
      },
    });
    expect(result.coveredSyllables).toEqual([0, 1, 2, 3, 4]);
  });

  it('resets zoom to 1 and panOffset to {x:0,y:0}', () => {
    const state: EditorState = { ...stateWithLine(), zoom: 3, panOffset: { x: 50, y: 20 } };
    const result = editorReducer(state, {
      type: 'SWITCH_LINE',
      payload: {
        lineId: 'line-2',
        initialDividers: [],
        syllableRange: { start: 5, end: 9 },
        gaps: [],
        coveredSyllables: [],
      },
    });
    expect(result.zoom).toBe(1);
    expect(result.panOffset).toEqual({ x: 0, y: 0 });
  });

  it('resets isDirty to false', () => {
    const result = editorReducer(stateWithLine(), {
      type: 'SWITCH_LINE',
      payload: {
        lineId: 'line-2',
        initialDividers: [],
        syllableRange: { start: 5, end: 9 },
        gaps: [],
        coveredSyllables: [],
      },
    });
    expect(result.isDirty).toBe(false);
  });

  it('clears hoveredSyllableIdx', () => {
    const state: EditorState = { ...stateWithLine(), hoveredSyllableIdx: 3 };
    const result = editorReducer(state, {
      type: 'SWITCH_LINE',
      payload: {
        lineId: 'line-2',
        initialDividers: [],
        syllableRange: null,
        gaps: [],
        coveredSyllables: [],
      },
    });
    expect(result.hoveredSyllableIdx).toBeNull();
  });

  it('uses provided initialDividers when non-empty', () => {
    const result = editorReducer(stateWithLine(), {
      type: 'SWITCH_LINE',
      payload: {
        lineId: 'line-2',
        initialDividers: [0.33, 0.66],
        syllableRange: { start: 5, end: 7 },
        gaps: [],
        coveredSyllables: [],
      },
    });
    expect(result.dividers).toEqual([0.33, 0.66]);
  });

  it('auto-distributes dividers evenly when initialDividers is empty', () => {
    // syllableRange 5-9 (5 syllables), no gaps → 4 dividers: 0.2, 0.4, 0.6, 0.8
    const result = editorReducer(stateWithLine(), {
      type: 'SWITCH_LINE',
      payload: {
        lineId: 'line-2',
        initialDividers: [],
        syllableRange: { start: 5, end: 9 },
        gaps: [],
        coveredSyllables: [],
      },
    });
    expect(result.dividers).toEqual([0.2, 0.4, 0.6, 0.8]);
  });

  it('handles null syllableRange gracefully', () => {
    const result = editorReducer(stateWithLine(), {
      type: 'SWITCH_LINE',
      payload: {
        lineId: 'line-2',
        initialDividers: [],
        syllableRange: null,
        gaps: [],
        coveredSyllables: [],
      },
    });
    expect(result.syllableRange).toBeNull();
    expect(result.dividers).toEqual([]);
  });
});

// ── REMOVE_LINE ───────────────────────────────────────────────────────────────

describe('REMOVE_LINE', () => {
  it('clears active line state when removed line is active', () => {
    const state = stateWithLine(); // activeLineId = 'line-1'
    const result = editorReducer(state, {
      type: 'REMOVE_LINE',
      payload: { lineId: 'line-1' },
    });
    expect(result.activeLineId).toBeNull();
    expect(result.dividers).toEqual([]);
    expect(result.syllableRange).toBeNull();
    expect(result.gaps).toEqual([]);
    expect(result.coveredSyllables).toEqual([]);
    expect(result.isDirty).toBe(false);
  });

  it('returns state unchanged when removed line is not active', () => {
    const state = stateWithLine(); // activeLineId = 'line-1'
    const result = editorReducer(state, {
      type: 'REMOVE_LINE',
      payload: { lineId: 'line-other' },
    });
    expect(result).toStrictEqual(state);
  });
});

// ── Invariant checks — existing actions still hold ────────────────────────────

describe('SET_RANGE invariant', () => {
  it('recomputes dividers when range changes', () => {
    const state = editorReducer(initialEditorState, {
      type: 'LOAD_SOURCE',
      payload: {
        sourceId: 'src-1',
        lineId: 'line-1',
        initialDividers: [],
        syllableRange: { start: 0, end: 9 },
        gaps: [],
        coveredSyllables: [],
      },
    });
    const result = editorReducer(state, {
      type: 'SET_RANGE',
      payload: { start: 0, end: 4 },
    });
    // 5 syllables, no gaps → 4 dividers
    expect(result.dividers).toHaveLength(4);
  });
});

describe('REPLACE_BOXES', () => {
  it('replaces the boxes and keeps zoom, pan and the active syllable', () => {
    const s: EditorState = {
      ...stateWithLine(),
      zoom: 2,
      panOffset: { x: 5, y: 6 },
      activeSyllableIdx: 3,
      syllableBoxes: { 0: { x: 0, y: 0, w: 0.1, h: 0.1 } },
      isDirty: true,
    };
    const next = editorReducer(s, {
      type: 'REPLACE_BOXES',
      payload: { 0: { x: 0.5, y: 0, w: 0.1, h: 0.1 }, 1: null },
    });
    expect(next.syllableBoxes).toEqual({ 0: { x: 0.5, y: 0, w: 0.1, h: 0.1 }, 1: null });
    expect(next.zoom).toBe(2);
    expect(next.panOffset).toEqual({ x: 5, y: 6 });
    expect(next.activeSyllableIdx).toBe(3);
    expect(next.isDirty).toBe(false);
  });
});
