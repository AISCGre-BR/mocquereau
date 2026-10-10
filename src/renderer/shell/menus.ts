// Menus da janela (onda A1): ligados aos handlers existentes. Na onda B passam a vir
// do registro de comandos do subprojeto 2.
import { createElement } from "react";
import { Globe } from "lucide-react";
import type { MenuCommand, MenuDefinition, MenuEntry, MenuSubmenu } from "./menuTypes";
import { SUGGESTIONS_MODES, type SuggestionsMode } from "@shared/suggestions-mode";
import { VIEW_ORDER, type ViewId } from "./Toolbar";
import type { ThemePreference } from "../lib/models";
import { LANG_META, SUPPORTED_LANGS, languageMenuLabel, type SupportedLang } from "../i18n";

export interface MenuState {
  hasProject: boolean;
  canExport: boolean;
  view: ViewId;
  theme: ThemePreference;
  language: SupportedLang;
  canUndo: boolean;
  canRedo: boolean;
  /** Recortes menu state (only shown in the Recortes view). Absent: all disabled. */
  recortes?: RecortesMenuState;
}

export interface RecortesMenuState {
  canRemoveBox: boolean;
  canClearPage: boolean;
  canRealign: boolean;
  hasNextSource: boolean;
  /** M1: preference; "off" hides every suggestion item but the submenu. */
  suggestionsMode: SuggestionsMode;
  /** Active page has a usable image and nothing is running. */
  canSuggest: boolean;
  canSuggestSource: boolean;
  /** The active page shows suggestions (or candidates). */
  hasSuggestions: boolean;
}

export interface RecortesMenuActions {
  removeBox: () => void;
  clearPage: () => void;
  realignBoxes: () => void;
  nextSource: () => void;
  suggest: () => void;
  suggestSource: () => void;
  acceptAllSuggestions: () => void;
  discardSuggestions: () => void;
  setSuggestionsMode: (mode: SuggestionsMode) => void;
}

export interface MenuActions extends RecortesMenuActions {
  newProject: () => void;
  open: () => void;
  save: () => void;
  saveAs: () => void;
  importGueranger: () => void;
  editClassification: () => void;
  exportDocx: () => void;
  closeProject: () => void;
  undo: () => void;
  redo: () => void;
  setView: (view: ViewId) => void;
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (lng: SupportedLang) => void;
  openWebsite: () => void;
  reportIssue: () => void;
  openExample: () => void;
  clearRecent: () => void;
}

const THEMES: readonly ThemePreference[] = ["system", "light", "dark"];

const NO_RECORTES: RecortesMenuState = {
  canRemoveBox: false,
  canClearPage: false,
  canRealign: false,
  hasNextSource: false,
  suggestionsMode: "off",
  canSuggest: false,
  canSuggestSource: false,
  hasSuggestions: false,
};

/** Items of the Recortes menu; the sheet's context menu shows the same ones. */
export function recortesMenuItems(
  state: RecortesMenuState | undefined,
  actions: RecortesMenuActions,
  t: (key: string) => string,
): Array<MenuCommand | MenuSubmenu | "separator"> {
  const s = state ?? NO_RECORTES;
  const modes: MenuSubmenu = {
    id: "recortes.suggestionsMode",
    label: t("recortes.menu.suggestionsMode"),
    items: SUGGESTIONS_MODES.map((m) => ({
      id: `recortes.suggestionsMode.${m}`,
      label: t(`recortes.menu.suggestions.${m}`),
      checked: state !== undefined && s.suggestionsMode === m,
      disabled: state === undefined,
      onSelect: () => actions.setSuggestionsMode(m),
    })),
  };
  return [
    { id: "recortes.removeBox", label: t("recortes.menu.removeBox"), accelerator: "Delete", disabled: !s.canRemoveBox, onSelect: actions.removeBox },
    { id: "recortes.clearPage", label: t("recortes.menu.clearPage"), disabled: !s.canClearPage, onSelect: actions.clearPage },
    "separator",
    { id: "recortes.realign", label: t("recortes.menu.realign"), disabled: !s.canRealign, onSelect: actions.realignBoxes },
    "separator",
    // Esc (Descartar) is handled by the view's keyboard: menu accelerators need Ctrl.
    ...(s.suggestionsMode !== "off"
      ? ([
          { id: "recortes.suggest", label: t("recortes.menu.suggest"), accelerator: "Ctrl+Shift+G", disabled: !s.canSuggest, onSelect: actions.suggest },
          { id: "recortes.suggestSource", label: t("recortes.menu.suggestSource"), disabled: !s.canSuggestSource, onSelect: actions.suggestSource },
          { id: "recortes.acceptAll", label: t("recortes.menu.acceptAll"), accelerator: "Ctrl+Shift+Enter", disabled: !s.hasSuggestions || s.suggestionsMode === "candidates", onSelect: actions.acceptAllSuggestions },
          { id: "recortes.discard", label: t("recortes.menu.discard"), disabled: !s.hasSuggestions, onSelect: actions.discardSuggestions },
        ] satisfies MenuCommand[])
      : []),
    modes,
    "separator",
    { id: "recortes.nextSource", label: t("recortes.menu.nextSource"), accelerator: "Ctrl+Enter", nativeInTextInput: true, disabled: !s.hasNextSource, onSelect: actions.nextSource },
  ];
}

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
    (lng): MenuCommand => ({
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
        { id: "file.classification", label: t("shell.file.classification"), disabled: noProject, onSelect: actions.editClassification },
        { id: "file.exportDocx", label: t("shell.file.exportDocx"), accelerator: "Ctrl+E", disabled: !state.canExport, onSelect: actions.exportDocx },
        "separator",
        { id: "file.close", label: t("shell.file.close"), disabled: noProject, onSelect: actions.closeProject },
        ...(noProject
          ? ([
              "separator",
              { id: "file.clearRecent", label: t("shell.file.clearRecent"), onSelect: actions.clearRecent },
            ] satisfies MenuEntry[])
          : []),
      ],
    },
    {
      id: "edit",
      label: t("shell.menu.edit"),
      items: [
        {
          id: "edit.undo",
          label: t("shell.edit.undo"),
          accelerator: "Ctrl+Z",
          nativeInTextInput: true,
          allowRepeat: true,
          disabled: noProject || !state.canUndo,
          onSelect: actions.undo,
        },
        {
          id: "edit.redo",
          label: t("shell.edit.redo"),
          accelerator: "Ctrl+Shift+Z",
          altAccelerators: ["Ctrl+Y"],
          nativeInTextInput: true,
          allowRepeat: true,
          disabled: noProject || !state.canRedo,
          onSelect: actions.redo,
        },
      ],
    },
    {
      id: "view",
      label: t("shell.menu.view"),
      items: [
        ...viewItems,
        "separator",
        ...themeItems,
        "separator",
        {
          // Submenu com rótulo bilíngue e globo: achável mesmo num idioma que não se lê.
          id: "view.language",
          label: languageMenuLabel(t, state.language),
          icon: createElement(Globe, { className: "h-3.5 w-3.5", strokeWidth: 1.75, "aria-hidden": true }),
          items: languageItems,
        },
      ],
    },
    ...(state.hasProject && state.view === "recortes"
      ? [{ id: "recortes", label: t("shell.view.recortes"), items: recortesMenuItems(state.recortes, actions, t) }]
      : []),
    {
      id: "help",
      label: t("shell.menu.help"),
      items: [
        { id: "help.openExample", label: t("shell.help.openExample"), onSelect: actions.openExample },
        { id: "help.website", label: t("shell.help.website"), onSelect: actions.openWebsite },
        { id: "help.reportIssue", label: t("shell.help.reportIssue"), onSelect: actions.reportIssue },
      ],
    },
  ];
}
