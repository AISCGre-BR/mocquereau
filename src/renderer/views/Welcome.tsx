import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Eraser, FolderOpen, Globe, Plus } from "lucide-react";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Panel } from "../ui/Panel";
import { MenuItem, MenuSurface, type MenuCloseReason } from "../ui/Menu";
import { LANG_META, SUPPORTED_LANGS, languageMenuLabel, toSupportedLang } from "../i18n";

export interface WelcomeProps {
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (filePath: string) => void;
}

/** Nome do projeto a partir do caminho: sem pasta e sem .mocquereau(.json). */
export function displayName(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() ?? filePath;
  return base.replace(/\.mocquereau(\.json)?$/i, "");
}

/**
 * Seletor de idioma da tela inicial: troca o idioma antes de abrir qualquer projeto.
 * Rótulo bilíngue ("言語 / Language") para ser achado mesmo num idioma que não se lê.
 */
export function LanguagePicker() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = toSupportedLang(i18n.language);
  const label = languageMenuLabel(t, current);

  function close(reason: MenuCloseReason) {
    setOpen(false);
    if (reason === "escape") buttonRef.current?.focus();
  }

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        size="sm"
        icon={<Globe aria-hidden="true" />}
        aria-label={`${label}: ${LANG_META[current].label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((o) => !o)}
      >
        {LANG_META[current].label}
        <ChevronDown aria-hidden="true" className="h-3 w-3" />
      </Button>
      {open && (
        <MenuSurface
          aria-label={label}
          anchor={buttonRef.current}
          className="absolute right-0 top-full z-[120] mt-1"
          onClose={close}
        >
          {SUPPORTED_LANGS.map((lng) => (
            <MenuItem
              key={lng}
              label={LANG_META[lng].label}
              checked={lng === current}
              onSelect={() => void i18n.changeLanguage(lng)}
            />
          ))}
        </MenuSurface>
      )}
    </div>
  );
}

/** Tela sem projeto aberto. Recuperação de sessão entra na onda B. */
export function Welcome({ onNew, onOpen, onOpenRecent }: WelcomeProps) {
  const { t } = useTranslation();
  const [recent, setRecent] = useState<string[]>([]);
  const [version, setVersion] = useState("");

  useEffect(() => {
    let alive = true;
    window.mocquereau
      .getRecent()
      .then((entries) => alive && setRecent(entries.map((e) => e.path)))
      .catch(() => undefined);
    window.mocquereau
      .getAppVersion()
      .then((v) => alive && setVersion(v))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function clearRecent() {
    if (!window.confirm(t("welcome.clearRecentConfirm"))) return;
    await window.mocquereau.clearRecentFiles();
    setRecent([]);
  }

  return (
    <div className="relative grid min-h-0 flex-1 grid-cols-1 items-start gap-14 overflow-auto px-14 py-16 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="absolute right-4 top-3">
        <LanguagePicker />
      </div>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3.5">
          <span className="sc-menubar__brand m-0 h-11 w-11 rounded-[11px] text-[26px]" aria-hidden="true">
            M
          </span>
          <div className="flex flex-col">
            <h1 className="m-0 font-serif text-wordmark font-semibold">Mocquereau</h1>
            {version && <span className="sc-num text-caption text-ink-muted">{version}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="filled" icon={<Plus aria-hidden="true" />} onClick={onNew}>
            {t("welcome.new")}
          </Button>
          <Button variant="elevated" icon={<FolderOpen aria-hidden="true" />} onClick={onOpen}>
            {t("welcome.open")}
          </Button>
        </div>
      </div>
      <Panel
        title={t("welcome.recent")}
        action={
          recent.length > 0 ? (
            <IconButton label={t("welcome.clearRecent")} icon={<Eraser aria-hidden="true" />} onClick={() => void clearRecent()} />
          ) : undefined
        }
      >
        {recent.length === 0 ? (
          <p className="sc-empty m-0">{t("welcome.noRecent")}</p>
        ) : (
          <ul className="sc-list">
            {recent.map((filePath) => (
              <li key={filePath}>
                <button
                  type="button"
                  className="sc-list__row w-full border-0 bg-transparent text-left text-ink"
                  title={filePath}
                  onClick={() => onOpenRecent(filePath)}
                >
                  <span className="sc-list__name truncate">{displayName(filePath)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
