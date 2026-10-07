import { useTranslation } from "react-i18next";
import type { RecentEntry } from "../../../shared/recent";
import { displayName, formatRecentDate } from "./format";

/** Cartão de um projeto recente (não o mais recente): miniatura, título e data. */
export function RecentCard({ entry, onOpen }: { entry: RecentEntry; onOpen: () => void }) {
  const { i18n } = useTranslation();
  const meta = entry.meta;
  const title = meta?.title.trim() || displayName(entry.path);
  const date = meta ? formatRecentDate(meta.updatedAt, i18n.language) : "";

  return (
    <button
      type="button"
      title={entry.path}
      onClick={onOpen}
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border-0 bg-surface p-0 text-left text-ink shadow-[var(--elev-2),var(--highlight)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {meta?.thumb ? (
        <img src={meta.thumb} alt="" className="block h-[132px] w-full object-cover" />
      ) : (
        <div className="h-[132px] w-full bg-parchment-deep shadow-inset" />
      )}
      <div className="flex flex-col px-4 pt-3 pb-3.5">
        <span className="truncate font-serif text-source font-medium">{title}</span>
        {date && <span className="text-caption text-ink-muted">{date}</span>}
      </div>
    </button>
  );
}
