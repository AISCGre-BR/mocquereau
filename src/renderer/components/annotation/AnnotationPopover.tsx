// src/renderer/components/annotation/AnnotationPopover.tsx
//
// Compact annotation editor opened from a Tabela cell (spec §3). Same pattern as
// the Recortes ImagePanel: role=dialog, closes on outside pointerdown and Esc
// (giving the focus back to the cell). Fixed below the cell, with an arrow.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { IconButton } from "../../ui/IconButton";
import { AnnotationEditor } from "./AnnotationEditor";

export interface AnnotationPopoverProps {
  sourceId: string;
  syllable: number;
  /** Syllable text shown in the header. */
  syllableLabel: string;
  /** Source siglum shown in the header. */
  sourceName: string;
  /** The cell that opened it: a click on it is not "outside"; it gets the focus back. */
  anchor: HTMLElement;
  onOpenInRecortes: () => void;
  onClose: () => void;
}

const WIDTH = 320;
const GAP = 8;
const MARGIN = 8;

export function AnnotationPopover({
  sourceId,
  syllable,
  syllableLabel,
  sourceName,
  anchor,
  onOpenInRecortes,
  onClose,
}: AnnotationPopoverProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number }>({ left: 0, top: 0, arrow: WIDTH / 2 });

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const height = ref.current?.offsetHeight ?? 0;
    const center = r.left + r.width / 2;
    const left = Math.max(MARGIN, Math.min(window.innerWidth - WIDTH - MARGIN, center - WIDTH / 2));
    const below = r.bottom + GAP;
    const top = below + height > window.innerHeight && r.top - GAP - height > 0 ? r.top - GAP - height : below;
    setPos({ left, top, arrow: Math.max(16, Math.min(WIDTH - 16, center - left)) });
  }, [anchor]);

  useEffect(() => {
    function onPointerDown(e: Event) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchor.contains(target)) return;
      onCloseRef.current();
    }
    function onKeyDown(e: KeyboardEvent) {
      // An inner control (a select's list, a menu) that handled Escape keeps it.
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onCloseRef.current();
      anchor.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [anchor]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t("annotation.popoverTitle", { syllable: syllableLabel, siglum: sourceName })}
      data-annotation-popover
      className="fixed z-[120] flex flex-col gap-3 rounded-lg border border-rule bg-surface-high p-3 text-ink shadow-elev-3"
      style={{ width: WIDTH, left: pos.left, top: pos.top }}
    >
      <span
        aria-hidden="true"
        className="absolute -top-1 size-2 -translate-x-1/2 rotate-45 border-t border-l border-rule bg-surface-high"
        style={{ left: pos.arrow }}
      />
      <div className="flex items-center gap-2">
        <span className="font-serif text-body italic">{syllableLabel}</span>
        <span className="min-w-0 flex-1 truncate font-serif text-ink-muted">{sourceName}</span>
        <IconButton label={t("annotation.openInRecortes")} icon={<ExternalLink />} onClick={onOpenInRecortes} />
      </div>
      <AnnotationEditor target={{ sourceId, syllable }} variant="compact" autoFocus />
    </div>
  );
}
