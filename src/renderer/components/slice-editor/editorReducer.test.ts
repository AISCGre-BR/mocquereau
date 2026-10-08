// src/renderer/components/slice-editor/editorReducer.test.ts

import { describe, it, expect } from 'vitest';
import { editorReducer, initialEditorState, type EditorState } from './editorReducer';

function selected(): EditorState {
  return {
    ...initialEditorState,
    activeSourceId: 'src-1',
    activeLineId: 'line-1',
    activeSyllableIdx: 3,
    followRangeStart: false,
    zoom: 2,
    imagePanelOpen: true,
  };
}

describe('initialEditorState', () => {
  it('holds no persistent data: only selection and view toggles', () => {
    expect(Object.keys(initialEditorState).sort()).toEqual([
      'activeLineId',
      'activeSourceId',
      'activeSyllableIdx',
      'drawMode',
      'followRangeStart',
      'imagePanelOpen',
      'sameSize',
      'showAll',
      'zoom',
    ]);
    expect(initialEditorState.drawMode).toBe(true);
    expect(initialEditorState.showAll).toBe(true);
    expect(initialEditorState.sameSize).toBe(false);
  });
});

describe('SELECT', () => {
  it('selects source and page, resets zoom and closes the image panel', () => {
    const next = editorReducer(selected(), {
      type: 'SELECT',
      payload: { sourceId: 'src-2', lineId: 'line-9' },
    });
    expect(next.activeSourceId).toBe('src-2');
    expect(next.activeLineId).toBe('line-9');
    expect(next.zoom).toBe(1);
    expect(next.imagePanelOpen).toBe(false);
  });

  it('without a syllable the active one follows the start of the range', () => {
    const next = editorReducer(selected(), { type: 'SELECT', payload: { sourceId: 's', lineId: 'l' } });
    expect(next.activeSyllableIdx).toBeNull();
    expect(next.followRangeStart).toBe(true);
  });

  it('with a syllable it is pinned', () => {
    const next = editorReducer(selected(), {
      type: 'SELECT',
      payload: { sourceId: 's', lineId: 'l', activeSyllableIdx: 7 },
    });
    expect(next.activeSyllableIdx).toBe(7);
    expect(next.followRangeStart).toBe(false);
  });

  it('keeps the drawing toggles', () => {
    const s = { ...selected(), drawMode: false, sameSize: true, showAll: false };
    const next = editorReducer(s, { type: 'SELECT', payload: { sourceId: 's', lineId: null } });
    expect([next.drawMode, next.sameSize, next.showAll]).toEqual([false, true, false]);
  });
});

describe('SET_ACTIVE_SYLLABLE', () => {
  it('pins the active syllable', () => {
    const s = { ...initialEditorState, followRangeStart: true };
    const next = editorReducer(s, { type: 'SET_ACTIVE_SYLLABLE', payload: 4 });
    expect(next.activeSyllableIdx).toBe(4);
    expect(next.followRangeStart).toBe(false);
  });
});

describe('SET_ZOOM', () => {
  it('clamps the zoom', () => {
    expect(editorReducer(initialEditorState, { type: 'SET_ZOOM', payload: 100 }).zoom).toBe(8);
    expect(editorReducer(initialEditorState, { type: 'SET_ZOOM', payload: 0 }).zoom).toBe(0.25);
  });
});

describe('toggles', () => {
  it('set draw mode, same size, show all and the image panel', () => {
    let s = editorReducer(initialEditorState, { type: 'SET_DRAW_MODE', payload: false });
    s = editorReducer(s, { type: 'SET_SAME_SIZE', payload: true });
    s = editorReducer(s, { type: 'SET_SHOW_ALL', payload: false });
    s = editorReducer(s, { type: 'SET_IMAGE_PANEL_OPEN', payload: true });
    expect([s.drawMode, s.sameSize, s.showAll, s.imagePanelOpen]).toEqual([false, true, false, true]);
  });
});
