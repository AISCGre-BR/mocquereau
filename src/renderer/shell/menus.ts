// Menus da janela (onda A1): ligados aos handlers existentes. Na onda B passam a vir
// do registro de comandos do subprojeto 2.
import type { MenuDefinition, MenuEntry } from "./menuTypes";
import { VIEW_ORDER, type ViewId } from "./Toolbar";
import type { ThemePreference } from "../lib/models";
import { LANG_META, SUPPORTED_LANGS, type SupportedLang } from "../i18n";

export interface MenuState {
  hasProject: boolean;
  canExport: boolean;
  view: ViewId;
  theme: ThemePreference;
  language: SupportedLang;
}

export interface MenuActions {
  newProject: () => void;
  open: () => void;
  save: () => void;
  saveAs: () => void;
  importGueranger: () => void;
  exportDocx: () => void;
  closeProject: () => void;
  setView: (view: ViewId) => void;
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (lng: SupportedLang) => void;
  openWebsite: () => void;
  reportIssue: () => void;
}

const THEMES: readonly ThemePreference[] = ["system", "light", "dark"];

export function buildMenus(state: MenuState, actions: MenuActions, t: (key: string) => string): MenuDefinition[] {
  const noProject = !state.hasProject;

  const viewItems = VIEW_ORDER.map(
    (view, i): MenuEntry => ({
      id: `view.${view}`,
      label: t(`shell.view.${view}`),
      accelerator: `Ctrl+${i + 1}`,
      disabled: noProject,
      checked: state.hasProject && state.view === view,
      onSelect: () => actions.setView(view),
    }),
  );
  const themeItems = THEMES.map(
    (theme): MenuEntry => ({
      id: `theme.${theme}`,
      label: t(`shell.theme.${theme}`),
      checked: state.theme === theme,
      onSelect: () => actions.setTheme(theme),
    }),
  );
  const languageItems = SUPPORTED_LANGS.map(
    (lng): MenuEntry => ({
      id: `lang.${lng}`,
      label: LANG_META[lng].label,
      checked: state.language === lng,
      onSelect: () => actions.setLanguage(lng),
    }),
  );

  return [
    {
      id: "file",
      label: t("shell.menu.file"),
      items: [
        { id: "file.new", label: t("shell.file.new"), accelerator: "Ctrl+N", onSelect: actions.newProject },
        { id: "file.open", label: t("shell.file.open"), accelerator: "Ctrl+O", onSelect: actions.open },
        "separator",
        { id: "file.save", label: t("shell.file.save"), accelerator: "Ctrl+S", disabled: noProject, onSelect: actions.save },
        { id: "file.saveAs", label: t("shell.file.saveAs"), accelerator: "Ctrl+Shift+S", disabled: noProject, onSelect: actions.saveAs },
        "separator",
        { id: "file.importGueranger", label: t("shell.file.importGueranger"), disabled: noProject, onSelect: actions.importGueranger },
        { id: "file.exportDocx", label: t("shell.file.exportDocx"), accelerator: "Ctrl+E", disabled: !state.canExport, onSelect: actions.exportDocx },
        "separator",
        { id: "file.close", label: t("shell.file.close"), disabled: noProject, onSelect: actions.closeProject },
      ],
    },
    {
      id: "view",
      label: t("shell.menu.view"),
      items: [...viewItems, "separator", ...themeItems, "separator", ...languageItems],
    },
    {
      id: "help",
      label: t("shell.menu.help"),
      items: [
        { id: "help.website", label: t("shell.help.website"), onSelect: actions.openWebsite },
        { id: "help.reportIssue", label: t("shell.help.reportIssue"), onSelect: actions.reportIssue },
      ],
    },
  ];
}
