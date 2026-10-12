// src/renderer/components/analysis/BarRow.tsx
//
// Horizontal SVG bars of the Análise view (Parchment pigments, no axes). Widths are
// percentages of the SVG, so the bars follow the column width without measuring.
// Marks follow the dataviz specs: thin bars, rounded data end, 2px surface gap
// between touching fills, values as text outside the bar, hover title.
import { useId, type ReactNode } from "react";

export interface BarSegment {
  value: number;
  /** Fill utility (fill-lapis, fill-orpiment…). */
  className: string;
}

const GAP = 2;

/** A stacked bar on a track; `max` is the full length (the track). */
export function StackedBar({
  segments,
  max,
  title,
  height = 8,
  trackClassName = "fill-parchment-deep",
}: {
  segments: BarSegment[];
  max: number;
  title: string;
  height?: number;
  trackClassName?: string;
}) {
  const clip = `bar${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const pct = (v: number) => (max <= 0 ? 0 : (100 * v) / max);
  let x = 0;
  const parts = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const part = { ...s, x: pct(x), w: pct(s.value) };
      x += s.value;
      return part;
    });
  const end = pct(x);
  // Gaps at every boundary between two fills (segment/segment and segment/track).
  const gaps = parts.map((p) => p.x + p.w).filter((b) => b > 0 && b < 100);
  return (
    <svg role="img" aria-label={title} width="100%" height={height} className="block">
      <title>{title}</title>
      <clipPath id={clip}>
        <rect x="0" y="0" width="100%" height={height} rx={height / 2} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect x={`${end}%`} y="0" width={`${100 - end}%`} height={height} className={trackClassName} />
        {parts.map((p, i) => (
          <rect key={i} x={`${p.x}%`} y="0" width={`${p.w}%`} height={height} className={p.className} />
        ))}
        {gaps.map((b, i) => (
          <rect key={`g${i}`} x={`${b}%`} y="0" width={GAP} height={height} transform={`translate(${-GAP / 2} 0)`} className="fill-surface" />
        ))}
      </g>
    </svg>
  );
}

/** One bar from the left baseline: square at the baseline, rounded data end. */
export function ValueBar({ value, max, height = 6, className = "fill-lapis" }: { value: number; max: number; height?: number; className?: string }) {
  const w = max <= 0 ? 0 : (100 * value) / max;
  if (w <= 0) return <svg width="100%" height={height} className="block" aria-hidden="true" />;
  return (
    <svg width="100%" height={height} className="block" aria-hidden="true">
      <rect x="0" y="0" width={`${w}%`} height={height} rx={2} className={className} />
      <rect x="0" y="0" width={`${w / 2}%`} height={height} className={className} />
    </svg>
  );
}

/** Grid that aligns the bars of its BarRows (label | bar | value). */
export const BAR_GRID = "grid grid-cols-[minmax(4rem,max-content)_1fr_3.5rem] items-center gap-x-3 gap-y-2";

/** A labelled row of a BAR_GRID: label at the left, the bar, the value at the right (outside the bar). */
export function BarRow({ label, bar, value }: { label: ReactNode; bar: ReactNode; value: ReactNode }) {
  return (
    <div className="contents">
      <div className="truncate">{label}</div>
      <div>{bar}</div>
      <div className="text-right font-sans text-sm">{value}</div>
    </div>
  );
}
