import { useTranslation } from "react-i18next";
import type { RecentEntry } from "../../../shared/recent";
import { Button } from "../../ui/Button";
import { displayName, formatRecentDate } from "./format";

const MAX_SOURCES = 6;

/** Destaque do projeto mais recente: miniatura, título, autor · data, progresso por fonte e Continuar. */
export function RecentHero({ entry, onContinue }: { entry: RecentEntry; onContinue: () => void }) {
  const { t, i18n } = useTranslation();
  const meta = entry.meta;
  const title = meta?.title.trim() || displayName(entry.path);
  const caption = [meta?.author.trim(), meta && formatRecentDate(meta.updatedAt, i18n.language)]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      aria-label={title}
      className="grid max-h-[380px] min-h-[240px] flex-1 grid-cols-[minmax(0,1fr)_360px] grid-rows-[minmax(0,1fr)] overflow-hidden rounded-lg bg-surface shadow-[var(--elev-2),var(--highlight)]"
    >
      {meta?.thumb ? (
        <img src={meta.thumb} alt="" className="block h-full w-full object-cover" />
      ) : (
        <div className="h-full bg-parchment-deep shadow-inset" />
      )}
      <div className="flex min-w-0 flex-col gap-1.5 px-7 pt-7 pb-6">
        <h2 className="m-0 font-serif text-doc-title font-semibold">{title}</h2>
        {caption && <p className="m-0 text-caption text-ink-muted">{caption}</p>}
        {meta && meta.sources.length > 0 && (
          <ul className="m-0 mt-6 flex min-h-0 list-none flex-col gap-3.5 overflow-hidden p-0">
            {meta.sources.slice(0, MAX_SOURCES).map((s, i) => (
              <li key={i} className="flex flex-col gap-1.5">
                <span className="truncate font-serif text-source font-medium">{s.siglum}</span>
                <div className="sc-progress w-full">
                  <i className="bg-verdigris" style={{ width: `${Math.round(Math.min(1, Math.max(0, s.progress)) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex-1" />
        <div className="flex justify-end">
          <Button variant="filled" onClick={onContinue}>
            {t("welcome.continue")}
          </Button>
        </div>
      </div>
    </section>
  );
}
