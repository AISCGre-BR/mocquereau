import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, FolderOpen, Plus } from "lucide-react";

interface StartChoicesProps {
  onNew: () => void;
  onOpen: () => void;
  onOpenExample: () => void;
}

function Choice({ icon, label, main, onClick }: { icon: ReactNode; label: string; main?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex h-[168px] w-[240px] flex-col items-center justify-center gap-3.5 rounded-lg border-0",
        "bg-linear-to-b from-surface-high to-surface font-sans text-title font-medium text-ink",
        "shadow-[var(--elev-2),var(--highlight)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "[&>svg]:h-7 [&>svg]:w-7 [&>svg]:stroke-[1.5]",
        main ? "ring-2 ring-rubric [&>svg]:text-rubric" : "ring-1 ring-rule-soft",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

/** Início sem projetos recentes: nome do app e três caminhos para começar. */
export function StartChoices({ onNew, onOpen, onOpenExample }: StartChoicesProps) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-10 pb-[60px]">
      <h1 className="m-0 font-serif text-wordmark font-semibold">Mocquereau</h1>
      <div className="flex gap-6">
        <Choice main icon={<Plus aria-hidden="true" />} label={t("welcome.new")} onClick={onNew} />
        <Choice icon={<FolderOpen aria-hidden="true" />} label={t("welcome.open")} onClick={onOpen} />
        <Choice icon={<BookOpen aria-hidden="true" />} label={t("welcome.example")} onClick={onOpenExample} />
      </div>
    </div>
  );
}
