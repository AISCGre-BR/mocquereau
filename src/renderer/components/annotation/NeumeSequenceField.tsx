import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "../../ui/Button";
import { filterKinds, fold, kindMap } from "@shared/annotation/vocabulary";
import type { NeumeItem, NeumeKind, NeumeVocabulary } from "@shared/annotation/types";

export interface NeumeKindDraft {
  name: string;
  categoryName: string;
  defaultNotes: number;
}

export interface NeumeSequenceFieldProps {
  vocabulary: NeumeVocabulary;
  value: NeumeItem[];
  onChange: (next: NeumeItem[]) => void;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  /** Adds the kind to the project vocabulary and returns its id. */
  onCreateKind: (draft: NeumeKindDraft) => string;
  id?: string;
}

type Option = { type: "kind"; kind: NeumeKind } | { type: "create" };

const keepFocus = (e: MouseEvent) => e.preventDefault();

/** Keys a text field consumes; stopped so the Recortes window shortcuts don't also run. */
function ownsKey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey) return false;
  return ["Backspace", "Delete", "Enter", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key);
}

const NOTES = /^\s*\d+\s*$/;

/**
 * Neume sequence as serif words in a box (D13): no chips. Focus opens the vocabulary list
 * grouped by category; Enter or click appends, repetitions allowed. A filter that names no
 * kind offers "Create «filter»" with an inline category/notes form.
 */
export function NeumeSequenceField({
  vocabulary,
  value,
  onChange,
  selectedIndex,
  onSelect,
  onCreateKind,
  id,
}: NeumeSequenceFieldProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const inputId = id ?? `${baseId}-input`;
  const listId = `${baseId}-list`;
  const wordsId = `${baseId}-words`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [form, setForm] = useState<{ category: string; notes: string } | null>(null);

  const kinds = useMemo(() => kindMap(vocabulary), [vocabulary]);
  const groups = useMemo(() => filterKinds(vocabulary, query), [vocabulary, query]);
  const name = query.trim();
  const canCreate = name !== "" && !vocabulary.kinds.some((k) => fold(k.name.trim()) === fold(name));
  const options = useMemo<Option[]>(() => {
    const list: Option[] = groups.flatMap((g) => g.kinds.map((kind) => ({ type: "kind" as const, kind })));
    if (canCreate) list.push({ type: "create" });
    return list;
  }, [groups, canCreate]);
  const activeIndex = options.length === 0 ? -1 : Math.min(active, options.length - 1);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  function append(kindId: string) {
    onChange([...value, { kind: kindId }]);
    setQuery("");
    setActive(0);
  }

  function choose(i: number) {
    const opt = options[i];
    if (!opt) return;
    setActive(i);
    if (opt.type === "kind") append(opt.kind.id);
    else setForm({ category: "", notes: "" });
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
    if (selectedIndex !== null && (selectedIndex === index || selectedIndex >= value.length - 1)) onSelect(null);
  }

  function move(delta: -1 | 1) {
    if (selectedIndex === null) return;
    const to = selectedIndex + delta;
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    [next[selectedIndex], next[to]] = [next[to], next[selectedIndex]];
    onChange(next);
    onSelect(to);
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (ownsKey(e)) e.stopPropagation();
    const empty = query === "";
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        if (options.length === 0) return;
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActive((Math.max(activeIndex, 0) + step + options.length) % options.length);
        return;
      }
      case "ArrowLeft":
      case "ArrowRight":
        if (e.altKey && empty && selectedIndex !== null) {
          e.preventDefault();
          move(e.key === "ArrowLeft" ? -1 : 1);
        }
        return;
      case "Enter":
        if (e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        if (!open) setOpen(true);
        else if (activeIndex >= 0) choose(activeIndex);
        return;
      case "Backspace":
        if (empty && value.length > 0) {
          e.preventDefault();
          remove(value.length - 1);
        }
        return;
      case "Delete":
        if (empty && selectedIndex !== null && selectedIndex < value.length) {
          e.preventDefault();
          remove(selectedIndex);
        }
        return;
      case "Escape":
        e.preventDefault();
        if (open) {
          setOpen(false);
          setForm(null);
        } else {
          inputRef.current?.blur();
        }
        return;
    }
  }

  function closeForm() {
    setForm(null);
    inputRef.current?.focus();
  }

  function submitForm() {
    if (!form || !formValid) return;
    const kindId = onCreateKind({ name, categoryName: form.category.trim(), defaultNotes: Number(form.notes) });
    setForm(null);
    append(kindId);
    inputRef.current?.focus();
  }

  function onFormKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (ownsKey(e)) e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      closeForm();
    }
  }

  const categoryName = form?.category.trim() ?? "";
  const notesValue = form && NOTES.test(form.notes) ? Number(form.notes) : 0;
  const formValid = categoryName !== "" && Number.isInteger(notesValue) && notesValue >= 1;
  const isNewCategory =
    categoryName !== "" && !vocabulary.categories.some((c) => fold(c.name.trim()) === fold(categoryName));
  const visibleCategories = vocabulary.categories.filter((c) => !c.hidden);

  let flat = -1;
  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (rootRef.current?.contains(e.relatedTarget as Node | null)) return;
        setOpen(false);
        setForm(null);
      }}
    >
      <div
        className="flex min-h-9 cursor-text flex-wrap items-baseline gap-x-1.5 gap-y-0.5 rounded border border-rule bg-surface px-2 py-1 font-serif text-ink focus-within:border-rubric"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        <span id={wordsId} className="contents">
          {value.map((item, i) => {
            const kind = kinds.get(item.kind);
            const selected = i === selectedIndex;
            return (
              <Fragment key={i}>
                {i > 0 && (
                  <span aria-hidden="true" className="text-rule-strong">
                    ·
                  </span>
                )}
                <span
                  data-neume-index={i}
                  className={[
                    "cursor-pointer rounded-sm px-0.5",
                    kind ? "" : "italic text-ink-muted",
                    selected ? "bg-rubric-wash text-rubric underline" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onMouseDown={keepFocus}
                  onClick={() => {
                    onSelect(i);
                    inputRef.current?.focus();
                  }}
                >
                  {kind ? kind.name : item.kind}
                </span>
              </Fragment>
            );
          })}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-label={id ? undefined : t("annotation.neumes")}
          aria-describedby={value.length > 0 ? wordsId : undefined}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          className="min-w-[6ch] flex-1 border-none bg-transparent p-0 font-serif text-ink outline-none"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setForm(null);
            setOpen(true);
          }}
          onKeyDown={onInputKeyDown}
        />
      </div>

      {open && (
        <div className="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-lg bg-surface-high py-1 shadow-elev-3">
          <div role="listbox" id={listId} aria-label={t("annotation.neumes")}>
            {groups.map((g) => (
              <div key={g.category.id} role="group" aria-labelledby={`${baseId}-cat-${g.category.id}`}>
                <div
                  id={`${baseId}-cat-${g.category.id}`}
                  className="px-3 pt-2 pb-0.5 font-sans text-caption font-semibold text-ink-muted"
                >
                  {g.category.name}
                </div>
                {g.kinds.map((kind) => {
                  const i = ++flat;
                  return (
                    <div
                      key={kind.id}
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === activeIndex}
                      className={[
                        "flex cursor-pointer items-baseline justify-between gap-4 px-3 py-1 font-serif text-ink",
                        i === activeIndex ? "bg-rubric-wash" : "",
                      ].join(" ")}
                      onMouseDown={keepFocus}
                      onMouseMove={() => i !== activeIndex && setActive(i)}
                      onClick={() => choose(i)}
                    >
                      <span>{kind.name}</span>
                      <span aria-hidden="true" className="font-sans text-caption text-ink-muted tabular-nums">
                        {kind.defaultNotes}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
            {groups.length === 0 && (
              <div className="px-3 py-1.5 font-sans text-sm text-ink-muted italic">{t("annotation.neumes.empty")}</div>
            )}
            {canCreate && (() => {
              const i = options.length - 1;
              return (
                <>
                  {groups.length > 0 && <div role="separator" className="my-1 border-t border-rule" />}
                  <div
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    aria-expanded={form !== null}
                    className={[
                      "flex cursor-pointer items-center gap-1.5 px-3 py-1 font-sans text-sm text-rubric",
                      i === activeIndex ? "bg-rubric-wash" : "",
                    ].join(" ")}
                    onMouseDown={keepFocus}
                    onMouseMove={() => i !== activeIndex && setActive(i)}
                    onClick={() => choose(i)}
                  >
                    <Plus aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    {t("annotation.create", { name })}
                  </div>
                </>
              );
            })()}
          </div>

          {form && (
            <div
              role="group"
              aria-label={t("annotation.create", { name })}
              className="flex flex-col gap-2 px-3 pt-1 pb-2 font-sans text-sm"
              onKeyDown={onFormKeyDown}
            >
              <div className="flex flex-col gap-0.5">
                <label htmlFor={`${baseId}-category`} className="text-caption text-ink-muted">
                  {t("annotation.create.category")}
                </label>
                <input
                  id={`${baseId}-category`}
                  className="sc-input"
                  autoFocus
                  autoComplete="off"
                  list={`${baseId}-categories`}
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      document.getElementById(`${baseId}-notes`)?.focus();
                    }
                  }}
                />
                <datalist id={`${baseId}-categories`}>
                  {visibleCategories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
                {isNewCategory && <span className="text-caption text-ink-muted">{t("annotation.create.newCategory")}</span>}
              </div>
              <div className="flex items-end gap-2">
                <div className="flex w-20 flex-col gap-0.5">
                  <label htmlFor={`${baseId}-notes`} className="text-caption text-ink-muted">
                    {t("annotation.create.notes")}
                  </label>
                  <input
                    id={`${baseId}-notes`}
                    className="sc-input tabular-nums"
                    inputMode="numeric"
                    required
                    autoComplete="off"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitForm();
                      }
                    }}
                  />
                </div>
                <Button variant="filled" size="sm" disabled={!formValid} onMouseDown={keepFocus} onClick={submitForm}>
                  {t("annotation.create.submit")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
