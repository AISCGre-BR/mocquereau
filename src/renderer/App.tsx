import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { FileDown } from "lucide-react";
import { ProjectContext, useProject, useProjectReducer } from "./hooks/useProject";
import { useProjectFile } from "./hooks/useProjectFile";
import { createPendingEdits } from "./hooks/pendingEdits";
import { Toaster } from "./ui/Toast";
import { Button } from "./ui/Button";
import { AppShell } from "./shell/AppShell";
import { MenuBar } from "./shell/MenuBar";
import { Toolbar, type ViewId } from "./shell/Toolbar";
import { buildMenus } from "./shell/menus";
import { useMenuShortcuts } from "./shell/useMenuShortcuts";
import { useTheme } from "./shell/useTheme";
import { Welcome } from "./views/Welcome";
import { NewProjectGuide } from "./views/NewProjectGuide";
import { TextoView } from "./views/TextoView";
import { RecortesView } from "./views/RecortesView";
import { TabelaView } from "./views/TabelaView";
import { ExportDialog } from "./components/ExportDialog";
import { ClassificationDialog } from "./components/sources/ClassificationDialog";
import { RecortesTools } from "./components/recortes/RecortesTools";
import { TabelaTools } from "./components/table-preview/TabelaTools";
import { TableZoomProvider } from "./hooks/useTableZoom";
import { RecortesProvider, useRecortesCommands, useRecortesContext } from "./hooks/RecortesContext";
import { SuggestionsProvider } from "./hooks/SuggestionsContext";
import { createEmptySource } from "./lib/sources";
import { resetSourceTreeSession } from "./components/sources/SourceTree";
import { toSupportedLang, type SupportedLang } from "./i18n";

const HOMEPAGE = "https://github.com/AISCGre-BR/mocquereau";

export function App() {
  const [state, dispatch, history] = useProjectReducer();
  const [pending] = useState(createPendingEdits);
  const { t } = useTranslation();
  return (
    <ProjectContext.Provider value={{ state, dispatch, history, pending }}>
      <RecortesProvider>
        <TableZoomProvider>
          <SuggestionsProvider>
            <Toaster dismissLabel={t("toast.dismiss")}>
              <Workbench />
            </Toaster>
          </SuggestionsProvider>
        </TableZoomProvider>
      </RecortesProvider>
    </ProjectContext.Provider>
  );
}

function Workbench() {
  const { state, dispatch, history, pending } = useProject();
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [view, setView] = useState<ViewId>("texto");
  const [exportOpen, setExportOpen] = useState(false);
  const [classificationOpen, setClassificationOpen] = useState(false);
  // Desfazer/Refazer troca o projeto por baixo das vistas. As que ainda guardam
  // cópias locais (campos do Texto) remontam para reler o projeto; Recortes lê o
  // projeto a cada render (D6) e fica montada, com a seleção e o zoom.
  const [historyEpoch, setHistoryEpoch] = useState(0);
  function stepHistory(direction: "undo" | "redo") {
    if (!history) return;
    // Edições ainda no debounce entram no histórico antes, para Desfazer desfazê-las.
    flushSync(() => {
      pending?.flushAll();
    });
    if (direction === "undo") history.undo();
    else history.redo();
    pending?.bump();
    setHistoryEpoch((n) => n + 1);
  }
  const file = useProjectFile({ onOpened: () => setView("texto") });
  const recortes = useRecortesCommands();
  const recortesCtx = useRecortesContext();
  // Projeto trocado ou fechado: diálogos e escolhas de sessão do anterior não seguem.
  const setRecortesDialog = recortesCtx.setDialog;
  useEffect(() => {
    setClassificationOpen(false);
    setRecortesDialog(null);
    resetSourceTreeSession();
  }, [file.projectEpoch, setRecortesDialog]);

  // Fonte nova pedida pela Texto: Recortes abre o diálogo Fonte dela ao montar.
  const [newSourceId, setNewSourceId] = useState<string | null>(null);

  function addSourceInRecortes() {
    const source = createEmptySource();
    dispatch({ type: "ADD_SOURCE", payload: source });
    recortesCtx.selectSource(source.id);
    setNewSourceId(source.id);
    setView("recortes");
  }

  // Seleção e sílaba ativa vivem no provider; trocar de vista antes de apontar
  // deixa a Recortes já montada na página certa.
  function openInRecortes(sourceId: string, syllable: number) {
    setView("recortes");
    recortesCtx.goTo({ sourceId, syllable });
  }

  // "Salvar" no diálogo de fechar a janela: o main pede, o renderer salva (gravando
  // antes as edições pendentes). O project:save iniciado aqui é o que o main aguarda.
  const saveRef = useRef(file.save);
  saveRef.current = file.save;
  useEffect(() => {
    return window.mocquereau.onSaveRequested?.(() => {
      void saveRef.current();
    });
  }, []);

  const [welcomeKey, setWelcomeKey] = useState(0);
  const project = state.project;
  // Guia de criação aberto: ocupa a janela inteira, mesmo com um projeto aberto por baixo.
  const creating = file.creating;
  const canExport = !creating && project !== null && project.sources.some((s) => s.lines.length > 0);
  const language: SupportedLang = toSupportedLang(i18n.language);
  const title = creating
    ? t("newProject.title")
    : project
      ? project.meta.title.trim() || t("file.untitled")
      : "Mocquereau";
  const edited = !creating && project !== null && state.isDirty;
  const platform = window.mocquereau.platform;

  const menus = buildMenus(
    {
      hasProject: !creating && project !== null,
      canExport,
      view,
      theme,
      language,
      canUndo: history?.canUndo ?? false,
      canRedo: history?.canRedo ?? false,
      recortes: recortes.state,
    },
    {
      newProject: file.newProject,
      open: () => void file.open(),
      save: () => void file.save(),
      saveAs: () => void file.saveAs(),
      importGueranger: () => void file.importGueranger(),
      editClassification: () => setClassificationOpen(true),
      exportDocx: () => setExportOpen(true),
      closeProject: file.close,
      undo: () => stepHistory("undo"),
      redo: () => stepHistory("redo"),
      setView,
      setTheme,
      setLanguage: (lng) => void i18n.changeLanguage(lng),
      openWebsite: () => void window.mocquereau.openExternal(HOMEPAGE),
      reportIssue: () => void window.mocquereau.openExternal(`${HOMEPAGE}/issues`),
      openExample: () => void file.openExample(),
      removeBox: recortes.removeBox,
      clearPage: recortes.clearPage,
      realignBoxes: recortes.realignBoxes,
      nextSource: recortes.nextSource,
      clearRecent: () => {
        if (!window.confirm(t("shell.file.clearRecentConfirm"))) return;
        void window.mocquereau
          .clearRecentFiles()
          .catch(() => {})
          .then(() => setWelcomeKey((k) => k + 1));
      },
    },
    (key) => t(key),
  );
  useMenuShortcuts(menus);

  // Título da janela (barra de tarefas): "Puer natus est — Editado — Mocquereau".
  useEffect(() => {
    document.title =
      project || creating
        ? [title, edited ? t("shell.edited") : null, "— Mocquereau"].filter(Boolean).join(" ")
        : "Mocquereau";
  }, [project, creating, title, edited, t]);

  return (
    <AppShell
      menubar={<MenuBar menus={menus} title={title} edited={edited} platform={platform} />}
      toolbar={
        project && !creating ? (
          <Toolbar
            view={view}
            onViewChange={setView}
            platform={platform}
            tools={view === "recortes" ? <RecortesTools /> : view === "tabela" ? <TabelaTools /> : undefined}
            primaryAction={
              view === "tabela" ? (
                <Button
                  variant="filled"
                  icon={<FileDown aria-hidden="true" />}
                  disabled={!canExport}
                  onClick={() => setExportOpen(true)}
                >
                  {t("shell.file.exportDocx")}
                </Button>
              ) : undefined
            }
          />
        ) : undefined
      }
    >
      {creating ? (
        <NewProjectGuide onCancel={file.cancelNewProject} onCreate={(draft) => void file.createProject(draft)} />
      ) : project === null ? (
        <Welcome
          key={welcomeKey}
          onNew={file.newProject}
          onOpen={() => void file.open()}
          onOpenRecent={(p) => void file.openRecent(p)}
          onOpenExample={() => void file.openExample()}
        />
      ) : (
        <div
          key={view === "recortes" ? `${file.projectEpoch}` : `${file.projectEpoch}:${historyEpoch}`}
          className="flex min-h-0 flex-1 flex-col"
        >
          {view === "texto" && (
            <TextoView onAddSource={addSourceInRecortes} onImportGueranger={() => void file.importGueranger()} />
          )}
          {view === "recortes" && <RecortesView openSourceId={newSourceId} onOpenSourceHandled={() => setNewSourceId(null)} />}
          {view === "tabela" && <TabelaView onNavigateToEditor={openInRecortes} />}
        </div>
      )}
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      {classificationOpen && project && !creating && <ClassificationDialog onClose={() => setClassificationOpen(false)} />}
    </AppShell>
  );
}
