// src/renderer/components/analysis/OccurrencesDialog.tsx
//
// Drill-down: the cells behind a number, each with its crop, siglum and syllable.
// Choosing one closes the dialog and opens it in Recortes.
import { useMemo } from "react";
import type { Occurrence } from "@shared/analysis";
import { Dialog } from "../../ui/Dialog";
import { CellCrop, cropAspect, cropDrawable } from "../table-preview/CellCrop";
import { resolveCellLine, resolveCellState } from "../../lib/tableUtils";
import type { ManuscriptSource, MocquereauProject } from "../../lib/models";
import { syllableTexts } from "./format";

export interface OccurrencesDialogProps {
  project: MocquereauProject;
  title: string;
  occurrences: Occurrence[];
  onClose: () => void;
  onOpen: (sourceId: string, syllable: number) => void;
}

const THUMB_W = 80;
const THUMB_H = 48;

/** The crop fitted inside the thumbnail box, keeping its aspect ratio (like object-fit: contain). */
function Thumb({ source, syllable }: { source: ManuscriptSource; syllable: number }) {
  const state = resolveCellState(source, syllable);
  const hit = resolveCellLine(source, syllable);
  const adjustments = hit?.kind === "filled" ? hit.line.imageAdjustments : undefined;
  const aspect = state.kind === "filled" && cropDrawable(state.image, state.box) ? cropAspect(state.image, state.box, adjustments) : null;
  const wide = aspect !== null && aspect >= THUMB_W / THUMB_H;
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-rule-soft bg-parchment"
      style={{ width: THUMB_W, height: THUMB_H }}
    >
      {state.kind === "filled" && aspect !== null && Number.isFinite(aspect) ? (
        <span
          className="block"
          style={{ aspectRatio: aspect, width: wide ? "100%" : "auto", height: wide ? "auto" : "100%" }}
        >
          <CellCrop image={state.image} box={state.box} adjustments={adjustments} />
        </span>
      ) : state.kind === "gap" ? (
        <span className="text-sm text-ink-muted">—</span>
      ) : null}
    </span>
  );
}

export function OccurrencesDialog({ project, title, occurrences, onClose, onOpen }: OccurrencesDialogProps) {
  const sources = useMemo(() => new Map(project.sources.map((s) => [s.id, s])), [project.sources]);
  const texts = useMemo(() => syllableTexts(project.text.words), [project.text.words]);
  return (
    <Dialog open title={title} onClose={onClose} className="w-[560px] max-w-[calc(100vw-32px)]">
      <ul className="-mx-2 grid max-h-[60vh] grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-1 overflow-y-auto">
        {occurrences.map((o) => {
          const source = sources.get(o.sourceId);
          if (!source) return null;
          const siglum = source.metadata.siglum || source.id;
          const text = texts[o.syllable] ?? String(o.syllable + 1);
          return (
            <li key={`${o.sourceId}:${o.syllable}`}>
              <button
                type="button"
                aria-label={`${siglum} ${text}`}
                className="flex w-full items-center gap-2 rounded-sm p-2 text-left hover:bg-ink-wash focus-visible:outline-2 focus-visible:outline-focus"
                onClick={() => {
                  onClose();
                  onOpen(o.sourceId, o.syllable);
                }}
              >
                <Thumb source={source} syllable={o.syllable} />
                <span className="min-w-0">
                  <span title={siglum} className="block truncate font-serif text-sm text-ink-soft">{siglum}</span>
                  <span title={text} className="block truncate font-serif text-body italic text-ink">{text}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
