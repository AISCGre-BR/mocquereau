import { useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Liquescence, NeumeItem, NeumeVocabulary, SignificantLetter, Tag } from "@shared/annotation/types";
import { ChoiceGroup } from "./ChoiceGroup";
import { NotesInput } from "./NotesInput";
import { TagsField } from "./TagsField";
import { stopOwnedKeys } from "./keys";

export interface NeumeDetailProps {
  item: NeumeItem;
  vocabulary: NeumeVocabulary;
  tags: Tag[];
  /** `field` names the edited property (coalesces typing into one undo step). */
  onChange: (next: NeumeItem, field: string) => void;
  onTagNames: (names: string[]) => void;
}

type YesNo = "yes" | "no";

/** Sets or removes an optional property (undefined = absent, never presumed). */
function withField<K extends keyof NeumeItem>(item: NeumeItem, key: K, value: NeumeItem[K] | undefined): NeumeItem {
  const next = { ...item };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

function sameIds(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Resolves abbreviations ("c x", "c, x") against the letters; unknown ones are reported, not kept. */
function resolveLetters(text: string, letters: SignificantLetter[], current: string[]) {
  const ids: string[] = [];
  let invalid = false;
  for (const token of text.split(/[\s,]+/).filter(Boolean)) {
    const lower = token.toLowerCase();
    const letter =
      letters.find((l) => !l.hidden && l.abbr === token) ??
      letters.find((l) => l.abbr === token) ??
      letters.find((l) => l.abbr.toLowerCase() === lower);
    const id = letter?.id ?? (current.includes(token) ? token : undefined);
    if (id === undefined) invalid = true;
    else if (!ids.includes(id)) ids.push(id);
  }
  return { ids, invalid };
}

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="font-sans text-caption text-ink-muted">
          {label}
        </label>
      ) : (
        <span className="font-sans text-caption text-ink-muted">{label}</span>
      )}
      <div className="min-w-0">{children}</div>
    </>
  );
}

function LettersInput({
  id,
  value,
  letters,
  onChange,
}: {
  id: string;
  value: string[];
  letters: SignificantLetter[];
  onChange: (ids: string[]) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const formatted = value.map((lid) => letters.find((l) => l.id === lid)?.abbr ?? lid).join(" ");
  // The draft stays (with its unknown abbreviations flagged) while it still matches what is stored;
  // an outside change (undo, another neume) shows the stored letters again.
  const shown = draft !== null && sameIds(resolveLetters(draft, letters, value).ids, value) ? draft : formatted;
  const { invalid } = resolveLetters(shown, letters, value);
  return (
    <input
      id={id}
      type="text"
      autoComplete="off"
      spellCheck={false}
      className="sc-input w-full"
      aria-invalid={invalid ? true : undefined}
      value={shown}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const { ids } = resolveLetters(text, letters, value);
        if (!sameIds(ids, value)) onChange(ids);
      }}
      onKeyDown={stopOwnedKeys}
    />
  );
}

/** Detail of the selected neume: notes, liquescence, episema, letters, tags and note. */
export function NeumeDetail({ item, vocabulary, tags, onChange, onTagNames }: NeumeDetailProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const kind = useMemo(() => vocabulary.kinds.find((k) => k.id === item.kind), [vocabulary, item.kind]);
  const episema: YesNo | undefined = item.episema === undefined ? undefined : item.episema ? "yes" : "no";

  return (
    <div className="flex flex-col gap-3 rounded-md border border-rule-soft bg-parchment p-3">
      <div className={kind ? "font-serif text-ink italic" : "font-serif text-ink-muted italic"}>
        {kind ? kind.name : item.kind}
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
        <Row label={t("annotation.notes")} htmlFor={`${baseId}-notes`}>
          <NotesInput
            id={`${baseId}-notes`}
            value={item.notes}
            placeholder={kind?.defaultNotes !== undefined ? String(kind.defaultNotes) : undefined}
            onChange={(n) => onChange(withField(item, "notes", n), "notes")}
          />
        </Row>
        <Row label={t("annotation.liquescence")}>
          <ChoiceGroup<Liquescence>
            size="sm"
            label={t("annotation.liquescence")}
            options={[
              { value: "none", label: t("annotation.liquescence.none") },
              { value: "augmentative", label: t("annotation.liquescence.augmentative") },
              { value: "diminutive", label: t("annotation.liquescence.diminutive") },
            ]}
            value={item.liquescence}
            onChange={(v) => onChange(withField(item, "liquescence", v), "liquescence")}
          />
        </Row>
        <Row label={t("annotation.episema")}>
          <ChoiceGroup<YesNo>
            size="sm"
            label={t("annotation.episema")}
            options={[
              { value: "yes", label: t("annotation.yes") },
              { value: "no", label: t("annotation.no") },
            ]}
            value={episema}
            onChange={(v) => onChange(withField(item, "episema", v === undefined ? undefined : v === "yes"), "episema")}
          />
        </Row>
        <Row label={t("annotation.letters")} htmlFor={`${baseId}-letters`}>
          <LettersInput
            id={`${baseId}-letters`}
            value={item.letters ?? []}
            letters={vocabulary.letters}
            onChange={(ids) => onChange(withField(item, "letters", ids.length > 0 ? ids : undefined), "letters")}
          />
        </Row>
        <Row label={t("annotation.tags")} htmlFor={`${baseId}-tags`}>
          <TagsField id={`${baseId}-tags`} value={item.tags ?? []} tags={tags} onCommit={onTagNames} />
        </Row>
        <Row label={t("annotation.neumeComment")} htmlFor={`${baseId}-comment`}>
          <input
            id={`${baseId}-comment`}
            type="text"
            autoComplete="off"
            className="sc-input w-full"
            value={item.comment ?? ""}
            onChange={(e) => onChange(withField(item, "comment", e.target.value || undefined), "comment")}
            onKeyDown={stopOwnedKeys}
          />
        </Row>
      </div>
    </div>
  );
}
