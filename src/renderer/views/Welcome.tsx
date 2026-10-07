import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, FolderOpen, Globe, Plus } from "lucide-react";
import type { RecentEntry } from "../../shared/recent";
import { Button } from "../ui/Button";
import { MenuItem, MenuSurface, type MenuCloseReason } from "../ui/Menu";
import { LANG_META, SUPPORTED_LANGS, languageMenuLabel, toSupportedLang } from "../i18n";
import { RecentCard } from "./welcome/RecentCard";
import { RecentHero } from "./welcome/RecentHero";
import { StartChoices } from "./welcome/StartChoices";

export { displayName } from "./welcome/format";

export interface WelcomeProps {
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (filePath: string) => void;
  onOpenExample: () => void;
}

const MAX_CARDS = 6;

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
        className="text-ink-muted"
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
          className="absolute bottom-full right-0 z-[120] mb-1"
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

/**
 * Tela sem projeto aberto. Com recentes: o mais recente em destaque e os demais em cartões;
 * sem recentes: três caminhos para começar. Nada aparece até a lista chegar, para não
 * piscar a versão vazia.
 */
export function Welcome({ onNew, onOpen, onOpenRecent, onOpenExample }: WelcomeProps) {
  const { t } = useTranslation();
  const [recent, setRecent] = useState<RecentEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    window.mocquereau
      .getRecent()
      .then((entries) => alive && setRecent(entries))
      .catch(() => alive && setRecent([]));
    return () => {
      alive = false;
    };
  }, []);

  if (recent === null) return <div className="min-h-0 flex-1" />;

  const [latest, ...older] = recent;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {latest ? (
          <div className="mx-auto flex w-full max-w-[1080px] min-h-0 flex-1 flex-col gap-8 px-8 pt-14 pb-16">
            <div className="flex items-center gap-2.5">
              <h1 className="m-0 flex-1 font-serif text-wordmark font-semibold">Mocquereau</h1>
              <Button variant="elevated" icon={<FolderOpen aria-hidden="true" />} onClick={onOpen}>
                {t("welcome.open")}
              </Button>
              <Button variant="elevated" icon={<Plus aria-hidden="true" />} onClick={onNew}>
                {t("welcome.new")}
              </Button>
            </div>
            <RecentHero entry={latest} onContinue={() => onOpenRecent(latest.path)} />
            {older.length > 0 && (
              <div className="grid grid-cols-3 gap-6">
                {older.slice(0, MAX_CARDS).map((entry) => (
                  <RecentCard key={entry.path} entry={entry} onOpen={() => onOpenRecent(entry.path)} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <StartChoices onNew={onNew} onOpen={onOpen} onOpenExample={onOpenExample} />
        )}
      </div>
      <div className="absolute right-5 bottom-4">
        <LanguagePicker />
      </div>
    </div>
  );
}
