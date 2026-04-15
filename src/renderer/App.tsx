import { useState, useEffect, useRef } from "react";
import { Screen } from "./lib/constants";
import { ProjectContext, useProject, useProjectReducer } from "./hooks/useProject";
import { ProjectSetup } from "./components/ProjectSetup";
import { SourceList } from "./components/SourceList";
import { SliceEditor } from "./components/SliceEditor";
import { TablePreview } from "./components/TablePreview";
import { ExportDialog } from "./components/ExportDialog";

const SCREEN_ORDER: Screen[] = [
  Screen.ProjectSetup,
  Screen.SourceList,
  Screen.SliceEditor,
  Screen.TablePreview,
  Screen.Export,
];

// Top status bar — shown only when a project is loaded. Displays project name,
// dirty indicator, and handles Ctrl+S + debounced auto-save to the current file.
function StatusBar() {
  const { state, dispatch } = useProject();
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  async function doSave(silent: boolean) {
    const s = stateRef.current;
    if (!s.project) return;
    setSaving(true);
    try {
      const updated = {
        ...s.project,
        meta: { ...s.project.meta, updatedAt: new Date().toISOString() },
      };
      const result = await window.mocquereau.saveProject(
        updated,
        s.currentFilePath ?? undefined,
      );
      if (result) {
        dispatch({ type: "SAVE_SUCCESS" });
        dispatch({ type: "SET_FILE_PATH", payload: result.filePath });
        setLastSavedAt(Date.now());
      } else if (!silent) {
        // User cancelled dialog — nothing to do
      }
    } finally {
      setSaving(false);
    }
  }

  // Ctrl+S / Cmd+S keyboard shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        doSave(false);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced auto-save to disk (only if we have a filePath already and project is dirty)
  useEffect(() => {
    if (!state.isDirty || !state.project || !state.currentFilePath) return;
    const timer = setTimeout(() => doSave(true), 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isDirty, state.project, state.currentFilePath]);

  if (!state.project) return null;

  const title = state.project.meta.title || "Sem título";
  const pathTail = state.currentFilePath?.split(/[/\\]/).pop() ?? "";
  const justSaved = lastSavedAt !== null && Date.now() - lastSavedAt < 2000;

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-gray-100 border-b border-gray-300 text-xs text-gray-700 flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-semibold truncate">{title}</span>
        {state.isDirty && (
          <span className="text-amber-600 font-bold" title="Alterações não salvas">•</span>
        )}
        {pathTail && (
          <span className="text-gray-400 truncate">— {pathTail}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {saving ? (
          <span className="text-blue-600">Salvando…</span>
        ) : justSaved ? (
          <span className="text-green-600">Salvo ✓</span>
        ) : state.isDirty ? (
          <span className="text-amber-600">Alterações pendentes</span>
        ) : (
          <span className="text-gray-400">Salvo</span>
        )}
        <button
          type="button"
          onClick={() => doSave(false)}
          disabled={saving || !state.isDirty}
          className="px-2 py-0.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-40"
          title="Salvar (Ctrl+S)"
        >
          Salvar
        </button>
      </div>
    </div>
  );
}

export function App() {
  const [screen, setScreen] = useState<Screen>(Screen.ProjectSetup);
  const [state, dispatch] = useProjectReducer();

  const currentIndex = SCREEN_ORDER.indexOf(screen);
  const canGoNext = currentIndex < SCREEN_ORDER.length - 1;
  const canGoPrev = currentIndex > 0;

  function goNext() {
    if (canGoNext) setScreen(SCREEN_ORDER[currentIndex + 1]);
  }

  function goPrev() {
    if (canGoPrev) setScreen(SCREEN_ORDER[currentIndex - 1]);
  }

  const screenProps = { onNext: goNext, onPrev: goPrev, canGoNext, canGoPrev };

  // D-06: navigate from TablePreview context menu back to SliceEditor.
  // SliceEditor manages source selection internally via its own sidebar —
  // pre-selection by sourceId is not yet supported (TODO: add initialSourceId prop to SliceEditor v2).
  function navigateToEditor(_sourceId: string) {
    setScreen(Screen.SliceEditor);
  }

  return (
    <ProjectContext.Provider value={{ state, dispatch }}>
      <div className="flex flex-col h-screen">
        <StatusBar />
        {screen === Screen.ProjectSetup && <ProjectSetup {...screenProps} />}
        {screen === Screen.SourceList && <SourceList {...screenProps} />}
        {screen === Screen.SliceEditor && <SliceEditor {...screenProps} />}
        {screen === Screen.TablePreview && (
          <TablePreview {...screenProps} onNavigateToEditor={navigateToEditor} />
        )}
        {screen === Screen.Export && <ExportDialog {...screenProps} />}
      </div>
    </ProjectContext.Provider>
  );
}
