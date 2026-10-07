// src/renderer/components/slice-editor/RealignBoxesDialog.tsx
//
// "Realinhar caixas…": lists the frames the line's boxes may have been drawn
// in, scored by the ink inside them (box-frame-detect). Choosing one previews
// it live on the canvas by setting boxFrame outside the history; Cancel puts
// the exact previous project back (so "Editado" is untouched) and Apply
// records one undoable SET_LINE_BOX_FRAME.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BoxFrame } from "@shared/project-schema";
import { framesEqual } from "@shared/box-frame";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { useProject } from "../../hooks/useProject";
import type { ManuscriptLine, MocquereauProject } from "../../lib/models";
import type { FrameScore } from "../../lib/box-frame-detect";
import { loadRasterForInk, scoreLine, storedBoxFrame, type RasterLoader } from "../../lib/box-frame-realign";

interface Props {
  open: boolean;
  line: ManuscriptLine | null;
  onClose: () => void;
  /** Tests inject a fake decoder. */
  loadRaster?: RasterLoader;
}

const frameKey = (f: BoxFrame) => `${f.rotation}|${f.flipH}|${f.flipV}`;

function formatRotation(deg: number): string {
  const signed = deg > 180 ? deg - 360 : deg;
  return `${Number.isInteger(signed) ? signed : signed.toFixed(1)}°`;
}

export function RealignBoxesDialog({ open, line, onClose, loadRaster = loadRasterForInk }: Props) {
  const { t } = useTranslation();
  const { state, dispatch } = useProject();
  const [scores, setScores] = useState<FrameScore[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<BoxFrame | null>(null);
  /** Project as it was when the dialog opened: Cancel restores this exact object. */
  const original = useRef<MocquereauProject | null>(null);
  const stored = useRef<BoxFrame | null>(null);
  const lineId = line?.id ?? null;

  useEffect(() => {
    if (!open || !line) return;
    original.current = state.project;
    stored.current = storedBoxFrame(line);
    setSelected(stored.current);
    setScores(null);
    setFailed(false);
    let alive = true;
    scoreLine(line, loadRaster)
      .then((result) => {
        if (!alive) return;
        if (!result) setFailed(true);
        else setScores([...result].sort((a, b) => b.score - a.score));
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // Scored once per opening, on the line as it was then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lineId]);

  function restore() {
    // Same object as present is a no-op in the history reducer.
    if (original.current) {
      dispatch({ type: "REPLACE_PROJECT", payload: original.current, meta: { undoable: false } });
    }
  }

  function preview(frame: BoxFrame) {
    if (!lineId || !original.current) return;
    setSelected(frame);
    restore();
    if (stored.current && !framesEqual(frame, stored.current)) {
      dispatch({ type: "SET_LINE_BOX_FRAME", payload: { lineId, frame }, meta: { undoable: false } });
    }
  }

  function cancel() {
    restore();
    onClose();
  }

  function apply() {
    restore();
    if (lineId && selected && stored.current && !framesEqual(selected, stored.current)) {
      dispatch({ type: "SET_LINE_BOX_FRAME", payload: { lineId, frame: selected } });
    }
    onClose();
  }

  const best = scores?.[0];
  const label = (f: BoxFrame) =>
    [formatRotation(f.rotation), f.flipH ? t("realign.flipH") : null, f.flipV ? t("realign.flipV") : null]
      .filter(Boolean)
      .join(" · ");

  return (
    <Dialog
      open={open}
      title={t("realign.title")}
      onClose={cancel}
      onConfirm={apply}
      className="justify-self-end"
      actions={
        <>
          <Button variant="elevated" onClick={cancel}>
            {t("realign.cancel")}
          </Button>
          <Button variant="filled" onClick={apply} disabled={!scores} data-autofocus>
            {t("realign.apply")}
          </Button>
        </>
      }
    >
      <p className="mb-3">{t("realign.hint")}</p>
      {failed ? (
        <p className="sc-note">{t("realign.failed")}</p>
      ) : !scores ? (
        <p aria-live="polite">{t("realign.scoring")}</p>
      ) : (
        <div role="radiogroup" aria-label={t("realign.candidates")} className="flex flex-col gap-1">
          {scores.map((s) => {
            const isSelected = !!selected && framesEqual(s.frame, selected);
            const percent = Math.round(s.score * 1000) / 10;
            const width = best && best.score > 0 ? (s.score / best.score) * 100 : 0;
            return (
              <label
                key={frameKey(s.frame)}
                className={[
                  "flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer",
                  isSelected ? "bg-ink-wash text-ink" : "hover:bg-ink-wash",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="realign-frame"
                  className="accent-rubric"
                  checked={isSelected}
                  onChange={() => preview(s.frame)}
                />
                <span className="w-32 shrink-0 tabular-nums">{label(s.frame)}</span>
                <span className="relative h-1.5 flex-1 rounded bg-rule-soft" aria-hidden="true">
                  <span className="absolute inset-y-0 left-0 rounded bg-rubric" style={{ width: `${width}%` }} />
                </span>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-soft">
                  {t("realign.score", { percent })}
                </span>
                <span className="w-16 shrink-0 text-xs text-ink-muted">
                  {s === best
                    ? t("realign.best")
                    : stored.current && framesEqual(s.frame, stored.current)
                      ? t("realign.current")
                      : ""}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}

export default RealignBoxesDialog;
