import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eraser, FolderOpen, Plus } from "lucide-react";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Panel } from "../ui/Panel";

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

/** Tela sem projeto aberto. Recuperação de sessão entra na onda B. */
export function Welcome({ onNew, onOpen, onOpenRecent }: WelcomeProps) {
  const { t } = useTranslation();
  const [recent, setRecent] = useState<string[]>([]);
  const [version, setVersion] = useState("");

  useEffect(() => {
    let alive = true;
    window.mocquereau
      .getRecentFiles()
      .then((files) => alive && setRecent(files))
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
    <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-14 overflow-auto px-14 py-16 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
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
