import { createContext, useContext, useReducer } from "react";
import type { MocquereauProject } from "../lib/models";

type ProjectAction =
  | { type: "SET_PROJECT"; payload: MocquereauProject }
  | { type: "RESET" };

interface ProjectState {
  project: MocquereauProject | null;
  isDirty: boolean;
}

const initialState: ProjectState = {
  project: null,
  isDirty: false,
};

function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case "SET_PROJECT":
      return { ...state, project: action.payload, isDirty: true };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

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
