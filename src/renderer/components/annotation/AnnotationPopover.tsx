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

export interface PopoverPlacement {
  left: number;
  top: number;
  /** Arrow offset from the popover's left edge. */
  arrow: number;
  /** Side of the popover the arrow is on; null when it fits neither below nor above the cell. */
  side: "top" | "bottom" | null;
}

/**
 * Below the cell when it fits, above when only that fits; otherwise kept inside the viewport
 * (bottom edge at the margin) without an arrow, so it never runs off the window.
 */
export function placePopover(
  cell: { left: number; top: number; bottom: number; width: number },
  height: number,
  viewport: { width: number; height: number },
): PopoverPlacement {
  const center = cell.left + cell.width / 2;
  const left = Math.max(MARGIN, Math.min(viewport.width - WIDTH - MARGIN, center - WIDTH / 2));
  const arrow = Math.max(16, Math.min(WIDTH - 16, center - left));
  const below = cell.bottom + GAP;
  if (below + height <= viewport.height - MARGIN) return { left, top: below, arrow, side: "top" };
  const above = cell.top - GAP - height;
  if (above >= MARGIN) return { left, top: above, arrow, side: "bottom" };
  return { left, top: Math.max(MARGIN, viewport.height - MARGIN - height), arrow, side: null };
}

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
  const [pos, setPos] = useState<PopoverPlacement>({ left: 0, top: 0, arrow: WIDTH / 2, side: "top" });

  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0;
    setPos(placePopover(anchor.getBoundingClientRect(), height, { width: window.innerWidth, height: window.innerHeight }));
  }, [anchor]);

  useEffect(() => {
    // Closing unmounts the fields before the browser moves focus, and an unmounted field gets
    // no blur: blur it first, so the fields that commit on leaving (Neumas, Etiquetas) do.
    function blurInside() {
      const el = document.activeElement;
      if (el instanceof HTMLElement && ref.current?.contains(el)) el.blur();
    }
    function onPointerDown(e: Event) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchor.contains(target)) return;
      blurInside();
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
      {pos.side && (
        <span
          aria-hidden="true"
          data-popover-arrow={pos.side}
          className={[
            "absolute size-2 -translate-x-1/2 rotate-45 border-rule bg-surface-high",
            pos.side === "top" ? "-top-1 border-t border-l" : "-bottom-1 border-r border-b",
          ].join(" ")}
          style={{ left: pos.arrow }}
        />
      )}
      <div className="flex items-center gap-2">
        <span className="font-serif text-body italic">{syllableLabel}</span>
        <span className="min-w-0 flex-1 truncate font-serif text-ink-muted">{sourceName}</span>
        <IconButton label={t("annotation.openInRecortes")} icon={<ExternalLink />} onClick={onOpenInRecortes} />
      </div>
      <AnnotationEditor target={{ sourceId, syllable }} variant="compact" autoFocus />
    </div>
  );
}
