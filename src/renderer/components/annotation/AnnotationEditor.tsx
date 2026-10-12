import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { effectiveNotes } from "@shared/annotation/annotation";
import { findTagByName } from "@shared/annotation/tags";
import type { Certainty, NeumeItem, SyllableAnnotation } from "@shared/annotation/types";
import { Textarea } from "../../ui/Field";
import { ChoiceGroup } from "./ChoiceGroup";
import { NeumeDetail } from "./NeumeDetail";
import { NeumeSequenceField } from "./NeumeSequenceField";
import { NotesInput } from "./NotesInput";
import { TagsField } from "./TagsField";
import { isCtrlEnter, stopOwnedKeys } from "./keys";
import { useAnnotation, type AnnotationTarget } from "./useAnnotation";
import { usePendingFlush } from "../../hooks/pendingEdits";

export interface AnnotationEditorProps {
  target: AnnotationTarget;
  variant: "full" | "compact";
  /** Ctrl+Enter in any field. */
  onNext?: () => void;
  /** Shift+Enter in an empty Neumas field (Enter there goes to `onNext`). */
  onPrev?: () => void;
  autoFocus?: boolean;
}

/** A hashtag at the very end of the comment, which live typing leaves unapplied. */
const TRAILING_TAG = /(?:^|[\s(])#([\p{L}\p{N}_-]+)$/u;

const labelClass = "font-sans text-caption text-ink-muted";

/** Each part of the editor is its own block, so the neume list never hides another part. */
const blockClass = "flex flex-col rounded-md border border-rule bg-surface p-3";

/**
 * Syllable annotation fields (spec §3), in separate blocks: the neume sequence, the selected
 * neume (only `full`, the Recortes panel, and only while a word is selected) and the syllable.
 * `compact` (Tabela) has the first and last. Every edit is written at once; nothing is presumed (D12).
 */
export function AnnotationEditor({ target, variant, onNext, onPrev, autoFocus }: AnnotationEditorProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const { annotation, vocabulary, tags, update, createKind, setTagNames, setComment } = useAnnotation(target);

  const targetKey = `${target.sourceId}:${target.syllable}`;
  const [selection, setSelection] = useState<{ key: string; index: number | null }>({ key: targetKey, index: null });
  const selected =
    selection.key === targetKey && selection.index !== null && selection.index < annotation.neumes.length
      ? selection.index
      : null;
  const select = (index: number | null) => setSelection({ key: targetKey, index });

  const rootRef = useRef<HTMLDivElement>(null);
  /**
   * Ctrl+Enter: blur the focused field first, so the fields that commit on leaving (Neumas,
   * Etiquetas) do it for this syllable before the editor moves on.
   */
  const blurInside = () => {
    const el = document.activeElement;
    if (el instanceof HTMLElement && rootRef.current?.contains(el)) el.blur();
  };

  // Text typed in Neumas and not yet committed: flushed before document actions (save, new,
  // open, close, undo) and on unmount (panel closed, next syllable, popover closed). The unmount
  // flush is skipped only when the document was replaced since mount (new, open, close), so the
  // text never lands in another project; an undo meanwhile (panel kept mounted) does not skip it.
  const neumesFlush = useRef<(() => boolean) | null>(null);
  usePendingFlush(() => neumesFlush.current?.() ?? false, "document");

  const neumesId = `${baseId}-neumes`;
  useEffect(() => {
    if (autoFocus) document.getElementById(neumesId)?.focus();
  }, [autoFocus, neumesId]);

  const total = effectiveNotes(annotation, vocabulary);
  const comment = annotation.comment ?? "";

  function patch(fields: Partial<SyllableAnnotation>, field: string) {
    const next: SyllableAnnotation = { ...annotation, ...fields };
    for (const key of Object.keys(fields) as Array<keyof SyllableAnnotation>) {
      if (fields[key] === undefined) delete next[key];
    }
    update(next, field);
  }

  function changeNeume(index: number, item: NeumeItem, field: string) {
    const neumes = annotation.neumes.map((n, i) => (i === index ? item : n));
    update({ ...annotation, neumes }, `neume.${index}.${field}`);
  }

  /** Applies a hashtag still open at the end of the comment (blur, Ctrl+Enter). */
  function finishComment(text: string) {
    const open = text.match(TRAILING_TAG);
    if (!open) return;
    const tag = findTagByName(tags, open[1]);
    if (tag && annotation.tags.includes(tag.id)) return;
    setComment(text, { final: true });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!isCtrlEnter(e)) return;
    e.preventDefault();
    e.stopPropagation();
    blurInside();
    onNext?.();
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-3" onKeyDown={onKeyDown}>
      <div data-annotation-block="neumes" className={`${blockClass} gap-1`}>
        <label htmlFor={neumesId} className={labelClass}>
          {t("annotation.neumes")}
        </label>
        <NeumeSequenceField
          id={neumesId}
          onEmptyEnter={
            onNext
              ? (direction) => {
                  blurInside();
                  if (direction === 1) onNext();
                  else onPrev?.();
                }
              : undefined
          }
          vocabulary={vocabulary}
          value={annotation.neumes}
          onChange={(neumes) => update({ ...annotation, neumes }, "neumes")}
          selectedIndex={selected}
          onSelect={select}
          onCreateKind={createKind}
          flushRef={neumesFlush}
        />
      </div>

      {variant === "full" && selected !== null && (
        <div data-annotation-block="neume" className={`${blockClass} gap-3`}>
          <NeumeDetail
            key={`${targetKey}:${selected}`}
            item={annotation.neumes[selected]}
            vocabulary={vocabulary}
            tags={tags}
            onChange={(item, field) => changeNeume(selected, item, field)}
            onTagNames={(names) => setTagNames(names, selected)}
          />
        </div>
      )}

      <div data-annotation-block="syllable" className={`${blockClass} gap-4`}>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={`${baseId}-total`} className={labelClass}>
            {t("annotation.totalNotes")}
          </label>
          {annotation.neumes.length === 0 ? (
            <NotesInput
              id={`${baseId}-total`}
              value={annotation.notes}
              placeholder="—"
              onChange={(n) => patch({ notes: n }, "notes")}
            />
          ) : (
            <output
              id={`${baseId}-total`}
              className={total === undefined ? "font-sans text-ink-muted" : "font-sans text-ink tabular-nums"}
            >
              {total ?? "—"}
            </output>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className={labelClass}>{t("annotation.certainty")}</span>
          <ChoiceGroup<Certainty>
            size="sm"
            label={t("annotation.certainty")}
            options={[
              { value: "secure", label: t("annotation.certainty.secure") },
              { value: "probable", label: t("annotation.certainty.probable") },
              { value: "illegible", label: t("annotation.certainty.illegible") },
            ]}
            value={annotation.certainty}
            onChange={(v) => patch({ certainty: v }, "certainty")}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${baseId}-tags`} className={labelClass}>
            {t("annotation.tags")}
          </label>
          <TagsField id={`${baseId}-tags`} value={annotation.tags} tags={tags} onCommit={(names) => setTagNames(names)} />
        </div>

        <Textarea
          label={t("annotation.comment")}
          // Same label as the editor's other fields (the .sc-field label is heavier and darker).
          className="gap-1 [&>span]:font-normal [&>span]:text-ink-muted"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={(e) => finishComment(e.target.value)}
          onKeyDown={(e) => {
            if (isCtrlEnter(e)) finishComment(e.currentTarget.value);
            else stopOwnedKeys(e);
          }}
        />
      </div>
    </div>
  );
}
