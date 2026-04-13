import { createContext, useContext, useReducer } from "react";
import type { MocquereauProject, SyllabifiedWord, Section } from "../lib/models";
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
  | { type: "SAVE_SUCCESS" };

// ── State ────────────────────────────────────────────────────────────────────

interface ProjectState {
  project: MocquereauProject | null;
  isDirty: boolean;
}

const initialState: ProjectState = {
  project: null,
  isDirty: false,
};

// ── Reducer ──────────────────────────────────────────────────────────────────

function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case "SET_PROJECT":
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
    text: { raw: "", words: [], hyphenationMode: "liturgical" },
    sections: [],
    sources: [],
  };
}
