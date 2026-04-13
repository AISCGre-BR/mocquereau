import { useState } from "react";
import { Screen } from "./lib/constants";
import { ProjectContext, useProjectReducer } from "./hooks/useProject";
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

  return (
    <ProjectContext.Provider value={{ state, dispatch }}>
      <div className="flex flex-col h-screen">
        {screen === Screen.ProjectSetup && <ProjectSetup {...screenProps} />}
        {screen === Screen.SourceList && <SourceList {...screenProps} />}
        {screen === Screen.SliceEditor && <SliceEditor {...screenProps} />}
        {screen === Screen.TablePreview && <TablePreview {...screenProps} />}
        {screen === Screen.Export && <ExportDialog {...screenProps} />}
      </div>
    </ProjectContext.Provider>
  );
}
