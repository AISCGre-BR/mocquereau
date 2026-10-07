import { createContext, useContext, useMemo, useReducer } from "react";
import type {
  ImageAdjustments,
  ManuscriptLine,
  ManuscriptSource,
  MocquereauProject,
  Section,
  StoredImage,
  SyllableBox,
  SyllabifiedWord,
} from "../lib/models";
import type { HyphenationMode } from "../lib/syllabify";
import { normalizeRotation } from "../lib/image-adjustments";
import { frameOf, framesEqual, hasAnyBox } from "@shared/box-frame";
import type { BoxFrame } from "@shared/project-schema";
import type { PendingEdits } from "./pendingEdits";
import {
  canRedo,
  canUndo,
  createHistory,
  isDirty,
  redoLabel,
  undoLabel,
  withHistory,
  type HistoryMeta,
  type HistoryState,
} from "../history/history";

// ── Action types ─────────────────────────────────────────────────────────────

export type ProjectAction =
  | { type: "SET_PROJECT"; payload: MocquereauProject }
  | { type: "REPLACE_PROJECT"; payload: MocquereauProject }
  | { type: "LOAD_PROJECT"; payload: { project: MocquereauProject | null; dirty?: boolean } }
  | { type: "RESET" }
  | { type: "SET_META"; payload: Partial<MocquereauProject["meta"]> }
  | {
      type: "SET_TEXT";
      payload: { raw: string; words: SyllabifiedWord[]; hyphenationMode: HyphenationMode };
    }
  | { type: "SET_SYLLABLE_MODE"; payload: HyphenationMode }
  | { type: "EDIT_SYLLABLES"; payload: SyllabifiedWord[] }
  | { type: "ADD_SECTION"; payload: Section }
  | { type: "REMOVE_SECTION"; payload: string } // section id
  | { type: "UPDATE_SECTION"; payload: Section }
  /**
   * B2: payload.project is the snapshot that was sent to main, captured before
   * the IPC call; edits made while the save was in flight stay dirty.
   * Without a payload the current present is marked saved.
   */
  | { type: "SAVE_SUCCESS"; payload?: { project: MocquereauProject | null } }
  | { type: "ADD_SOURCE"; payload: ManuscriptSource }
  | { type: "REMOVE_SOURCE"; payload: string }          // source id
  | { type: "UPDATE_SOURCE"; payload: ManuscriptSource }
  | { type: "DUPLICATE_SOURCE"; payload: string }       // source id
  | { type: "REORDER_SOURCE"; payload: { id: string; direction: "up" | "down" } }
  | { type: "SET_FILE_PATH"; payload: string | null }
  | { type: "UPDATE_SYLLABLE_TEXT"; payload: { wordIdx: number; sylIdx: number; newText: string } }
  | {
      type: "UPDATE_LINE_METADATA";
      payload: { sourceId: string; lineId: string; folio?: string; label?: string };
    }
  | {
      /**
       * Boxes edited in the SliceEditor (autosave, confirm). syllableBoxes is the
       * line's COMPLETE map in the frame the user currently sees (boxesInView):
       * the reducer stores it and sets boxFrame to the current adjustments.
       */
      type: "UPDATE_LINE_BOXES";
      payload: {
        sourceId: string;
        lineId: string;
        syllableBoxes: Record<number, SyllableBox | null>;
        syllableRange?: { start: number; end: number };
        gaps?: number[];
        confirmed?: boolean;
        /** Crops merged into source.syllableCuts (confirm). */
        syllableCuts?: Record<number, StoredImage | null>;
      };
    }
  | {
      type: "UPDATE_LINE_ADJUSTMENTS";
      payload: {
        sourceId: string;
        lineId: string;
        adjustments: Partial<ImageAdjustments>;
      };
    }
  | {
      /**
       * Declares which frame the line's stored boxes are in (realignment of
       * legacy lines whose boxes predate the current rotation). The boxes are
       * not rewritten: boxesInView reinterprets them. An array applies several
       * lines as one undo step.
       */
      type: "SET_LINE_BOX_FRAME";
      payload: LineBoxFrameUpdate | LineBoxFrameUpdate[];
    };

export interface LineBoxFrameUpdate {
  lineId: string;
  frame: BoxFrame;
}

// ── State ────────────────────────────────────────────────────────────────────

export interface ProjectState {
  project: MocquereauProject | null;
  isDirty: boolean;
  currentFilePath: string | null;
}

const initialState: ProjectState = {
  project: null,
  currentFilePath: null,
  isDirty: false,
};

/** Exported for unit testing only */
export const initialStateForTest = initialState;

// ── Image adjustments helpers ────────────────────────────────────────────────

const ADJ_DEFAULT = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  invert: false,
  rotation: 0 as number,
  flipH: false,
  flipV: false,
} as const;

function isAllDefaultAdjustments(a: ImageAdjustments): boolean {
  return (
    a.brightness === 100 &&
    a.contrast === 100 &&
    a.saturation === 100 &&
    a.grayscale === 0 &&
    a.invert === false &&
    a.rotation === 0 &&
    a.flipH === false &&
    a.flipV === false
  );
}

// ── Reducer ──────────────────────────────────────────────────────────────────

export function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case "SET_PROJECT":
      // Loading an existing project from disk starts clean; creating a new project
      // in-memory will typically dispatch SET_FILE_PATH right after to mark the path.
      return { ...state, project: action.payload, isDirty: false };

    case "LOAD_PROJECT":
      return { ...state, project: action.payload.project, isDirty: !!action.payload.dirty };

    case "REPLACE_PROJECT":
      // Whole-project edit (e.g. hyphenation migration): undoable and dirty.
      return { ...state, project: action.payload, isDirty: true };

    case "RESET":
      return initialState;

    case "SET_META": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          meta: { ...state.project.meta, ...action.payload },
        },
        isDirty: true,
      };
    }

    case "SET_TEXT": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          text: {
            raw: action.payload.raw,
            words: action.payload.words,
            hyphenationMode: action.payload.hyphenationMode,
          },
        },
        isDirty: true,
      };
    }

    case "SET_SYLLABLE_MODE": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          text: { ...state.project.text, hyphenationMode: action.payload },
        },
        isDirty: true,
      };
    }

    case "EDIT_SYLLABLES": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          text: { ...state.project.text, words: action.payload },
        },
        isDirty: true,
      };
    }

    case "ADD_SECTION": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          sections: [...state.project.sections, action.payload],
        },
        isDirty: true,
      };
    }

    case "REMOVE_SECTION": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          sections: state.project.sections.filter((s) => s.id !== action.payload),
        },
        isDirty: true,
      };
    }

    case "UPDATE_SECTION": {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          sections: state.project.sections.map((s) =>
            s.id === action.payload.id ? action.payload : s
          ),
        },
        isDirty: true,
      };
    }

    case "SAVE_SUCCESS":
      return { ...state, isDirty: false };

    case "SET_FILE_PATH":
      return { ...state, currentFilePath: action.payload };

    case "ADD_SOURCE": {
      if (!state.project) return state;
      const newSource = { ...action.payload, order: state.project.sources.length + 1 };
      return {
        ...state,
        project: { ...state.project, sources: [...state.project.sources, newSource] },
        isDirty: true,
      };
    }

    case "REMOVE_SOURCE": {
      if (!state.project) return state;
      const sources = state.project.sources
        .filter((s) => s.id !== action.payload)
        .map((s, i) => ({ ...s, order: i + 1 }));
      return { ...state, project: { ...state.project, sources }, isDirty: true };
    }

    case "UPDATE_SOURCE": {
      if (!state.project) return state;
      const sources = state.project.sources.map((s) =>
        s.id === action.payload.id ? action.payload : s
      );
      return { ...state, project: { ...state.project, sources }, isDirty: true };
    }

    case "DUPLICATE_SOURCE": {
      if (!state.project) return state;
      const original = state.project.sources.find((s) => s.id === action.payload);
      if (!original) return state;
      const copy: ManuscriptSource = {
        ...original,
        id: crypto.randomUUID(),
        order: state.project.sources.length + 1,
        lines: [],
        syllableCuts: {},
      };
      return {
        ...state,
        project: { ...state.project, sources: [...state.project.sources, copy] },
        isDirty: true,
      };
    }

    case "REORDER_SOURCE": {
      if (!state.project) return state;
      const sources = [...state.project.sources];
      const idx = sources.findIndex((s) => s.id === action.payload.id);
      if (idx === -1) return state;
      const swapIdx = action.payload.direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sources.length) return state;
      [sources[idx], sources[swapIdx]] = [sources[swapIdx], sources[idx]];
      // Never mutate objects shared with the previous state: history keeps it.
      const reordered = sources.map((s, i) => (s.order === i + 1 ? s : { ...s, order: i + 1 }));
      return { ...state, project: { ...state.project, sources: reordered }, isDirty: true };
    }

    case "UPDATE_SYLLABLE_TEXT": {
      if (!state.project) return state;
      const { wordIdx, sylIdx, newText } = action.payload;
      const words = state.project.text.words;
      if (wordIdx < 0 || wordIdx >= words.length) return state;
      const word = words[wordIdx];
      if (sylIdx < 0 || sylIdx >= word.syllables.length) return state;
      const newWords = words.map((w, wi) =>
        wi === wordIdx
          ? { ...w, syllables: w.syllables.map((s, si) => (si === sylIdx ? newText : s)) }
          : w,
      );
      return {
        ...state,
        project: {
          ...state.project,
          text: { ...state.project.text, words: newWords },
        },
        isDirty: true,
      };
    }

    case "UPDATE_LINE_METADATA": {
      if (!state.project) return state;
      const { sourceId, lineId, folio, label } = action.payload;
      const sources = state.project.sources.map((s) => {
        if (s.id !== sourceId) return s;
        const lines = s.lines.map((l) =>
          l.id === lineId ? { ...l, folio, label } : l,
        );
        return { ...s, lines };
      });
      return { ...state, project: { ...state.project, sources }, isDirty: true };
    }

    case "UPDATE_LINE_ADJUSTMENTS": {
      if (!state.project) return state;
      const { sourceId, lineId, adjustments } = action.payload;
      const src = state.project.sources.find((s) => s.id === sourceId);
      if (!src) return state;
      const tgt = src.lines.find((l) => l.id === lineId);
      if (!tgt) return state;
      const current: ImageAdjustments = tgt.imageAdjustments ?? { ...ADJ_DEFAULT };
      const mergedRaw: ImageAdjustments = { ...current, ...adjustments };
      // Phase 11 / IMG-07: normaliza rotation no merge (idempotente; barato).
      const merged: ImageAdjustments = {
        ...mergedRaw,
        rotation: normalizeRotation(mergedRaw.rotation),
      };
      // Spec R1 (S6/S7): boxes stay in the frame they were drawn in
      // (line.boxFrame); consumers read them through boxesInView. A rotation
      // is a plain adjustment update. A line with boxes but no boxFrame yet
      // has them in the frame that was current until now: pin it.
      const pinFrame = hasAnyBox(tgt.syllableBoxes) && !tgt.boxFrame ? frameOf(current) : undefined;
      const sources = state.project.sources.map((s) => {
        if (s.id !== sourceId) return s;
        const lines = s.lines.map((l) => {
          if (l.id !== lineId) return l;
          let next: ManuscriptLine;
          if (isAllDefaultAdjustments(merged)) {
            const { imageAdjustments: _drop, ...rest } = l;
            next = rest as ManuscriptLine;
          } else {
            next = { ...l, imageAdjustments: merged };
          }
          return pinFrame ? { ...next, boxFrame: pinFrame } : next;
        });
        return { ...s, lines };
      });
      return { ...state, project: { ...state.project, sources }, isDirty: true };
    }

    case "UPDATE_LINE_BOXES": {
      if (!state.project) return state;
      const { sourceId, lineId, syllableBoxes, syllableRange, gaps, confirmed, syllableCuts } = action.payload;
      const src = state.project.sources.find((s) => s.id === sourceId);
      if (!src || !src.lines.some((l) => l.id === lineId)) return state;
      const sources = state.project.sources.map((s) => {
        if (s.id !== sourceId) return s;
        const lines = s.lines.map((l) => {
          if (l.id !== lineId) return l;
          const next: ManuscriptLine = {
            ...l,
            syllableBoxes,
            // The editor drew/kept every box in the current view frame.
            boxFrame: frameOf(l.imageAdjustments),
          };
          if (syllableRange) next.syllableRange = syllableRange;
          if (gaps) next.gaps = gaps;
          if (confirmed !== undefined) next.confirmed = confirmed;
          return next;
        });
        return syllableCuts ? { ...s, lines, syllableCuts: { ...s.syllableCuts, ...syllableCuts } } : { ...s, lines };
      });
      return { ...state, project: { ...state.project, sources }, isDirty: true };
    }

    case "SET_LINE_BOX_FRAME": {
      if (!state.project) return state;
      const updates = Array.isArray(action.payload) ? action.payload : [action.payload];
      const wanted = new Map(updates.map((u) => [u.lineId, frameOf(u.frame)]));
      let changed = false;
      const sources = state.project.sources.map((s) => {
        let sourceChanged = false;
        const lines = s.lines.map((l) => {
          const frame = wanted.get(l.id);
          if (!frame) return l;
          const stored = l.boxFrame ?? frameOf(l.imageAdjustments);
          if (framesEqual(stored, frame)) return l;
          sourceChanged = true;
          return { ...l, boxFrame: frame };
        });
        if (!sourceChanged) return s;
        changed = true;
        return { ...s, lines };
      });
      if (!changed) return state;
      return { ...state, project: { ...state.project, sources }, isDirty: true };
    }

    default:
      return state;
  }
}

// ── Document state: undo/redo history around projectReducer ─────────────────

export type ProjectActionWithMeta = ProjectAction & { meta?: HistoryMeta };

export type DocumentAction =
  | ProjectActionWithMeta
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "MARK_SAVED"; payload?: { project: MocquereauProject | null } };

export interface DocumentState {
  history: HistoryState<MocquereauProject>;
  currentFilePath: string | null;
}

export const initialDocumentState: DocumentState = {
  history: createHistory<MocquereauProject>(null),
  currentFilePath: null,
};

function applyProjectAction(project: MocquereauProject | null, action: ProjectAction): MocquereauProject | null {
  return projectReducer({ project, isDirty: false, currentFilePath: null }, action).project;
}

const sortedKeys = (o: object) => Object.keys(o).sort().join(",");

/** Default coalescing for actions dispatched without meta (typing, sliders). */
export function historyMetaFor(action: ProjectAction): HistoryMeta | undefined {
  switch (action.type) {
    case "SET_META":
      return { coalesceKey: `SET_META:${sortedKeys(action.payload)}` };
    case "UPDATE_SYLLABLE_TEXT":
      return { coalesceKey: `UPDATE_SYLLABLE_TEXT:${action.payload.wordIdx}:${action.payload.sylIdx}` };
    case "UPDATE_LINE_METADATA":
      return {
        coalesceKey: `UPDATE_LINE_METADATA:${action.payload.lineId}`,
        focus: { sourceId: action.payload.sourceId, lineId: action.payload.lineId },
      };
    case "UPDATE_LINE_BOXES":
      return { focus: { sourceId: action.payload.sourceId, lineId: action.payload.lineId } };
    case "UPDATE_LINE_ADJUSTMENTS":
      return {
        coalesceKey: `UPDATE_LINE_ADJUSTMENTS:${action.payload.lineId}:${sortedKeys(action.payload.adjustments)}`,
        focus: { sourceId: action.payload.sourceId, lineId: action.payload.lineId },
      };
    default:
      return undefined;
  }
}

export function createDocumentReducer(now: () => number = Date.now) {
  const historyReducer = withHistory<MocquereauProject, ProjectActionWithMeta>(applyProjectAction, {
    now,
    metaFor: historyMetaFor,
  });
  return function documentReducer(state: DocumentState, action: DocumentAction): DocumentState {
    let history: HistoryState<MocquereauProject>;
    switch (action.type) {
      case "SET_FILE_PATH":
        return state.currentFilePath === action.payload ? state : { ...state, currentFilePath: action.payload };
      case "RESET":
        return { history: createHistory<MocquereauProject>(null), currentFilePath: null };
      case "SET_PROJECT":
        history = historyReducer(state.history, { type: "LOAD_PROJECT", payload: { project: action.payload } });
        break;
      case "SAVE_SUCCESS":
        history = historyReducer(state.history, { type: "MARK_SAVED", payload: action.payload });
        break;
      default:
        history = historyReducer(state.history, action);
    }
    return history === state.history ? state : { ...state, history };
  };
}

export const documentReducer = createDocumentReducer();

export function toProjectState(doc: DocumentState): ProjectState {
  return {
    project: doc.history.present,
    isDirty: isDirty(doc.history),
    currentFilePath: doc.currentFilePath,
  };
}

// ── Context ──────────────────────────────────────────────────────────────────

export interface HistoryApi {
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

interface ProjectContextValue {
  state: ProjectState;
  dispatch: React.Dispatch<DocumentAction>;
  /** Undo/redo API. Optional in wave A2: App.tsx does not pass it yet. */
  history?: HistoryApi;
  /** Pending view edits (wave A1 shell). Optional: isolated view tests omit it. */
  pending?: PendingEdits;
}

export const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}

export function useProjectReducer(): [ProjectState, React.Dispatch<DocumentAction>, HistoryApi] {
  const [doc, dispatch] = useReducer(documentReducer, initialDocumentState);
  const state = useMemo(() => toProjectState(doc), [doc]);
  const history = useMemo<HistoryApi>(
    () => ({
      undo: () => dispatch({ type: "UNDO" }),
      redo: () => dispatch({ type: "REDO" }),
      canUndo: canUndo(doc.history),
      canRedo: canRedo(doc.history),
      undoLabel: undoLabel(doc.history),
      redoLabel: redoLabel(doc.history),
    }),
    [doc.history],
  );
  return [state, dispatch, history];
}

// ── Helper ───────────────────────────────────────────────────────────────────

/**
 * Create a new empty MocquereauProject with default field values.
 */
export function createNewProject(title: string, author: string): MocquereauProject {
  const now = new Date().toISOString();
  return {
    meta: { title, author, createdAt: now, updatedAt: now },
    text: { raw: "", words: [], hyphenationMode: "sung" },
    sections: [],
    sources: [],
  };
}
