// src/renderer/components/slice-editor/SourceSidebar.tsx

import type { ManuscriptSource } from '../../lib/models';

// ── Props ─────────────────────────────────────────────────────────────────────

interface SourceSidebarProps {
  sources: ManuscriptSource[];
  activeSourceId: string | null;
  totalSyllableCount: number;   // flattenSyllables(project.text.words).length
  onSelectSource: (sourceId: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SourceSidebar({
  sources,
  activeSourceId,
  totalSyllableCount,
  onSelectSource,
}: SourceSidebarProps) {
  return (
    <div className="w-56 flex-shrink-0 flex flex-col border-r border-rule-soft bg-parchment">
      <div className="px-3 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide border-b border-rule-soft">
        Fontes
      </div>
      <ul className="flex-1 overflow-y-auto">
        {sources.map(source => {
          const completedCount = Object.keys(source.syllableCuts).length;
          const isActive = source.id === activeSourceId;
          const thumbnailUrl = source.lines[0]?.image.dataUrl;
          const progressPct = Math.round(
            (completedCount / Math.max(1, totalSyllableCount)) * 100,
          );

          return (
            <li key={source.id}>
              <button
                type="button"
                className={[
                  'w-full px-3 py-2 flex flex-row items-center text-left',
                  'border-l-2',
                  isActive
                    ? 'bg-rubric-wash border-rubric'
                    : 'hover:bg-ink-wash border-transparent',
                ].join(' ')}
                onClick={() => onSelectSource(source.id)}
              >
                {/* Thumbnail */}
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt={source.metadata.siglum}
                    className="w-8 h-8 object-cover rounded flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 bg-rule-soft rounded flex-shrink-0 flex items-center justify-center">
                    <span className="text-xs text-ink-muted">?</span>
                  </div>
                )}

                {/* Text column */}
                <div className="ml-2 flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink truncate">
                    {source.metadata.siglum || '—'}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {completedCount}/{totalSyllableCount}
                  </div>
                  <div className="mt-1 h-1 bg-rule-soft rounded">
                    <div
                      className="h-1 bg-rubric-soft rounded"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
