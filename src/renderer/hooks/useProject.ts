import { createContext, useContext, useReducer } from "react";
import type { MocquereauProject, SyllabifiedWord, Section, ManuscriptSource } from "../lib/models";
import type { HyphenationMode } from "../lib/syllabify";

// ── Action types ─────────────────────────────────────────────────────────────

type ProjectAction =
  | { type: "SET_PROJECT"; payload: MocquereauProject }
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
  | { type: "SAVE_SUCCESS" }
  | { type: "ADD_SOURCE"; payload: ManuscriptSource }
  | { type: "REMOVE_SOURCE"; payload: string }          // source id
  | { type: "UPDATE_SOURCE"; payload: ManuscriptSource }
  | { type: "DUPLICATE_SOURCE"; payload: string }       // source id
  | { type: "REORDER_SOURCE"; payload: { id: string; direction: "up" | "down" } }
  | { type: "SET_FILE_PATH"; payload: string | null };

// ── State ────────────────────────────────────────────────────────────────────

interface ProjectState {
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

// ── Reducer ──────────────────────────────────────────────────────────────────

export function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case "SET_PROJECT":
      // Loading an existing project from disk starts clean; creating a new project
      // in-memory will typically dispatch SET_FILE_PATH right after to mark the path.
      return { ...state, project: action.payload, isDirty: false };

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
      sources.forEach((s, i) => { s.order = i + 1; });
      return { ...state, project: { ...state.project, sources }, isDirty: true };
    }

    default:
      return state;
  }
}

// ── Context ──────────────────────────────────────────────────────────────────

interface ProjectContextValue {
  state: ProjectState;
  dispatch: React.Dispatch<ProjectAction>;
}

export const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}

export function useProjectReducer() {
  return useReducer(projectReducer, initialState);
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
