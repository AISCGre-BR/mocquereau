import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export const TOOLTIP_DELAY_MS = 500;

export interface TooltipAnchorProps<T extends HTMLElement> {
  ref: RefObject<T | null>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onPointerDown: () => void;
  "aria-describedby"?: string;
}

/**
 * Tooltip sem elemento extra: espalhe `anchorProps` no elemento-âncora e renderize
 * `tooltip` ao lado (é um portal em document.body). Atraso de 500 ms; mostra o atalho.
 */
export function useTooltip<T extends HTMLElement>(
  label: string,
  shortcut?: string,
): { anchorProps: TooltipAnchorProps<T>; tooltip: ReactNode } {
  const id = useId();
  const ref = useRef<T | null>(null);
  const timer = useRef<number | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }
  function show() {
    clearTimer();
    timer.current = window.setTimeout(() => {
      const rect = ref.current?.getBoundingClientRect();
      if (rect) setPosition({ left: rect.left + rect.width / 2, top: rect.bottom + 6 });
    }, TOOLTIP_DELAY_MS);
  }
  function hide() {
    clearTimer();
    setPosition(null);
  }
  useEffect(() => clearTimer, []);

  const tooltip = position
    ? createPortal(
        <div
          id={id}
          role="tooltip"
          className="pointer-events-none fixed z-[200] -translate-x-1/2 whitespace-nowrap rounded-sm bg-ink px-2 py-1 text-caption text-parchment shadow-elev-3"
          style={{ left: position.left, top: position.top }}
        >
          {label}
          {shortcut && <span className="sc-num ml-2 opacity-70">{shortcut}</span>}
        </div>,
        document.body,
      )
    : null;

  return {
    anchorProps: {
      ref,
      onMouseEnter: show,
      onMouseLeave: hide,
      onFocus: show,
      onBlur: hide,
      onPointerDown: hide,
      "aria-describedby": position ? id : undefined,
    },
    tooltip,
  };
}

export interface TooltipProps {
  label: string;
  shortcut?: string;
  children: ReactNode;
}

/** Envolve qualquer conteúdo num <span inline-flex> que serve de âncora. */
export function Tooltip({ label, shortcut, children }: TooltipProps) {
  const { anchorProps, tooltip } = useTooltip<HTMLSpanElement>(label, shortcut);
  return (
    <span className="inline-flex" {...anchorProps}>
      {children}
      {tooltip}
    </span>
  );
}
