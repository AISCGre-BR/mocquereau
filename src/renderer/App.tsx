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
import { TextoView } from "./views/TextoView";
import { FontesView } from "./views/FontesView";
import { RecortesView } from "./views/RecortesView";
import { TabelaView } from "./views/TabelaView";
import { ExportDialog } from "./components/ExportDialog";
import { toSupportedLang, type SupportedLang } from "./i18n";

const HOMEPAGE = "https://github.com/AISCGre-BR/mocquereau";

export function App() {
  const [state, dispatch, history] = useProjectReducer();
  const [pending] = useState(createPendingEdits);
  const { t } = useTranslation();
  return (
    <ProjectContext.Provider value={{ state, dispatch, history, pending }}>
      <Toaster dismissLabel={t("toast.dismiss")}>
        <Workbench />
      </Toaster>
    </ProjectContext.Provider>
  );
}

function Workbench() {
  const { state, history, pending } = useProject();
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [view, setView] = useState<ViewId>("texto");
  const [exportOpen, setExportOpen] = useState(false);
  // Desfazer/Refazer troca o projeto por baixo das vistas, que guardam cópias locais
  // (campos do Texto, caixas do editor) até a onda B: remontá-las relê o projeto.
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

  // "Salvar" no diálogo de fechar a janela: o main pede, o renderer salva (gravando
  // antes as edições pendentes). O project:save iniciado aqui é o que o main aguarda.
  const saveRef = useRef(file.save);
  saveRef.current = file.save;
  useEffect(() => {
    return window.mocquereau.onSaveRequested?.(() => {
      void saveRef.current();
    });
  }, []);

  const project = state.project;
  const canExport = project !== null && project.sources.some((s) => s.lines.length > 0);
  const language: SupportedLang = toSupportedLang(i18n.language);
  const title = project ? project.meta.title.trim() || t("file.untitled") : "Mocquereau";
  const edited = project !== null && state.isDirty;
  const platform = window.mocquereau.platform;

  const menus = buildMenus(
    {
      hasProject: project !== null,
      canExport,
      view,
      theme,
      language,
      canUndo: history?.canUndo ?? false,
      canRedo: history?.canRedo ?? false,
    },
    {
      newProject: file.newProject,
      open: () => void file.open(),
      save: () => void file.save(),
      saveAs: () => void file.saveAs(),
      importGueranger: () => void file.importGueranger(),
      exportDocx: () => setExportOpen(true),
      closeProject: file.close,
      undo: () => stepHistory("undo"),
      redo: () => stepHistory("redo"),
      setView,
      setTheme,
      setLanguage: (lng) => void i18n.changeLanguage(lng),
      openWebsite: () => void window.mocquereau.openExternal(HOMEPAGE),
      reportIssue: () => void window.mocquereau.openExternal(`${HOMEPAGE}/issues`),
    },
    (key) => t(key),
  );
  useMenuShortcuts(menus);

  // Título da janela (barra de tarefas): "Puer natus est — Editado — Mocquereau".
  useEffect(() => {
    document.title = project
      ? [title, edited ? t("shell.edited") : null, "— Mocquereau"].filter(Boolean).join(" ")
      : "Mocquereau";
  }, [project, title, edited, t]);

  return (
    <AppShell
      menubar={<MenuBar menus={menus} title={title} edited={edited} platform={platform} />}
      toolbar={
        project ? (
          <Toolbar
            view={view}
            onViewChange={setView}
            platform={platform}
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
      {project === null ? (
        <Welcome
          onNew={file.newProject}
          onOpen={() => void file.open()}
          onOpenRecent={(p) => void file.openRecent(p)}
          onOpenExample={() => void file.openExample()}
        />
      ) : (
        <div key={`${file.projectEpoch}:${historyEpoch}`} className="flex min-h-0 flex-1 flex-col">
          {view === "texto" && <TextoView />}
          {view === "fontes" && <FontesView />}
          {view === "recortes" && <RecortesView />}
          {view === "tabela" && <TabelaView onNavigateToEditor={() => setView("recortes")} />}
        </div>
      )}
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </AppShell>
  );
}
