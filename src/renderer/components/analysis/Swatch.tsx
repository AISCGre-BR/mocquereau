// src/renderer/components/analysis/Swatch.tsx
/** Legend key: a small rounded square in a pigment fill. */
export function Swatch({ className }: { className: string }) {
  return (
    <svg width="8" height="8" aria-hidden="true" className="inline-block shrink-0">
      <rect width="8" height="8" rx="2" className={className} />
    </svg>
  );
}
