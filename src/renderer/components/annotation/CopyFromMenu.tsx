import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import { IconButton } from "../../ui/IconButton";
import { MenuItem, MenuSurface, type MenuCloseReason } from "../../ui/Menu";
import { useProject } from "../../hooks/useProject";
import { useAnnotation, type AnnotationTarget } from "./useAnnotation";

/** "Copy from…": brings the neumes of the same syllable from another source (listed by siglum). */
export function CopyFromMenu({ target }: { target: AnnotationTarget }) {
  const { t } = useTranslation();
  const { state } = useProject();
  const { copyNeumesFrom } = useAnnotation(target);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const sources = (state.project?.sources ?? []).filter(
    (s) => s.id !== target.sourceId && (s.annotations?.[target.syllable]?.neumes.length ?? 0) > 0,
  );

  function close(reason: MenuCloseReason) {
    setOpen(false);
    if (reason === "escape") wrapRef.current?.querySelector("button")?.focus();
  }

  return (
    <div ref={wrapRef} className="relative">
      <IconButton
        label={t("annotation.copyFrom")}
        icon={<Copy className="h-4 w-4" aria-hidden="true" />}
        disabled={sources.length === 0}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open && sources.length > 0 && (
        <MenuSurface
          aria-label={t("annotation.copyFrom")}
          anchor={wrapRef.current}
          className="absolute top-full right-0 z-30 mt-1"
          onClose={close}
        >
          {sources.map((s) => (
            <MenuItem key={s.id} label={s.metadata.siglum || s.id} onSelect={() => copyNeumesFrom(s.id)} />
          ))}
        </MenuSurface>
      )}
    </div>
  );
}
