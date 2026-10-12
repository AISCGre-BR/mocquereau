import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { IconButton } from "../../ui/IconButton";
import { AnnotationEditor } from "./AnnotationEditor";
import { CopyFromMenu } from "./CopyFromMenu";
import type { AnnotationTarget } from "./useAnnotation";

export interface AnnotationPanelProps {
  /** null: no active syllable. */
  target: AnnotationTarget | null;
  syllableText: string;
  sourceName: string;
  onClose: () => void;
  onNext: () => void;
}

/** Right-hand "Anotação" panel of the Recortes view. */
export function AnnotationPanel({ target, syllableText, sourceName, onClose, onNext }: AnnotationPanelProps) {
  const { t } = useTranslation();
  return (
    <aside
      aria-label={t("annotation.panel")}
      data-annotation-panel=""
      className="flex w-[320px] flex-none flex-col border-l border-rule bg-surface"
    >
      <header className="flex items-start gap-1 border-b border-rule px-4 py-3">
        <div className="min-w-0 flex-1">
          {target && (
            <>
              <div className="truncate font-serif text-[20px] leading-tight text-ink italic">{syllableText}</div>
              <div className="truncate font-serif text-sm text-ink-muted">{sourceName}</div>
            </>
          )}
        </div>
        {target && <CopyFromMenu target={target} />}
        <IconButton label={t("annotation.closePanel")} icon={<X className="h-4 w-4" aria-hidden="true" />} onClick={onClose} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {target ? (
          <AnnotationEditor key={`${target.sourceId}:${target.syllable}`} target={target} variant="full" onNext={onNext} />
        ) : (
          <p className="font-sans text-sm text-ink-muted">{t("annotation.chooseSyllable")}</p>
        )}
      </div>
    </aside>
  );
}
