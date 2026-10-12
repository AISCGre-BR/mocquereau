// src/renderer/components/analysis/DrillNumber.tsx
import type { ReactNode } from "react";

export interface DrillNumberProps {
  children: ReactNode;
  /** Absent: plain text (nothing to drill into, e.g. a zero). */
  onClick?: () => void;
  "aria-label"?: string;
}

/** A number of the Análise view: a button with a dotted underline that opens its occurrences. */
export function DrillNumber({ children, onClick, "aria-label": ariaLabel }: DrillNumberProps) {
  if (!onClick) return <span className="tabular-nums text-ink-muted">{children}</span>;
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="cursor-pointer border-b border-dotted border-rule-strong tabular-nums text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
