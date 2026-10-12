import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "../../ui/Button";
import { filterKinds, fold, kindMap } from "@shared/annotation/vocabulary";
import { categoryLabel } from "@shared/annotation/default-vocabulary";
import { ownsKey } from "./keys";
import type { NeumeCategory, NeumeItem, NeumeKind, NeumeVocabulary } from "@shared/annotation/types";

/** Absent category name = no category; absent notes = no default notes. */
export interface NeumeKindDraft {
  name: string;
  categoryName?: string;
  defaultNotes?: number;
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
  /** Enter (1) / Shift+Enter (-1) with no pending text and the list closed. */
  onEmptyEnter?: (direction: 1 | -1) => void;
  /**
   * Receives a function that commits the pending text (as leaving the field does) and returns
   * whether there was any. The owner calls it on unmount and before document actions.
   */
  flushRef?: MutableRefObject<(() => boolean) | null>;
}

type Option = { type: "kind"; kind: NeumeKind } | { type: "create" };

const keepFocus = (e: MouseEvent) => e.preventDefault();

const NOTES = /^\s*\d+\s*$/;

/**
 * Neume sequence as serif words in a box (D13): no chips. The vocabulary list, grouped by
 * category, opens only while typing (non-empty filter) or on ArrowDown, never on focus or on a
 * click, so it does not cover the detail below; Enter or click appends (and closes it),
 * repetitions allowed. A filter that names no
 * kind offers "Create «filter»" with an inline form (category and notes both optional).
 * Leaving the field or typing a comma commits the typed text: the kind with that (folded)
 * name, or a new kind with only that name.
 */
export function NeumeSequenceField({
  vocabulary,
  value,
  onChange,
  selectedIndex,
  onSelect,
  onCreateKind,
  id,
  onEmptyEnter,
  flushRef,
}: NeumeSequenceFieldProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const inputId = id ?? `${baseId}-input`;
  const listId = `${baseId}-list`;
  const wordsId = `${baseId}-words`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQueryState] = useState("");
  // Mirrors `query` synchronously, so a commit right after another (comma then blur) sees it.
  const queryRef = useRef("");
  const setQuery = (q: string) => {
    queryRef.current = q;
    setQueryState(q);
  };
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
    setForm(null);
    setOpen(false);
  }

  /**
   * Appends each name (trimmed; blanks ignored): the kind with that folded name, visible or
   * hidden, or a new kind with only the name (no category, no default notes). Creating and
   * appending share the sequence's undo step.
   */
  function commitNames(names: string[]) {
    const ids = new Map(vocabulary.kinds.map((k) => [fold(k.name.trim()), k.id]));
    const added: NeumeItem[] = [];
    for (const raw of names) {
      const typed = raw.trim();
      if (typed === "") continue;
      const key = fold(typed);
      let kindId = ids.get(key);
      if (kindId === undefined) {
        kindId = onCreateKind({ name: typed });
        ids.set(key, kindId);
      }
      added.push({ kind: kindId });
    }
    if (added.length > 0) onChange([...value, ...added]);
  }

  /** Commits the pending filter text (leaving the field, comma) and clears it. */
  function commitPending() {
    const pending = queryRef.current;
    if (pending.trim() === "") return;
    setQuery("");
    setActive(0);
    setForm(null);
    setOpen(false);
    commitNames([pending]);
  }

  // Unmounting gives the field no blur (and React ignores focus events during a commit): the
  // owner flushes the pending text through this, guarded against a swapped document.
  if (flushRef) {
    flushRef.current = () => {
      const had = queryRef.current.trim() !== "";
      commitPending();
      return had;
    };
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
          // ArrowDown (or Alt+ArrowDown) opens the list; ArrowUp does not.
          if (e.key === "ArrowDown") setOpen(true);
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
        if (empty && !open && onEmptyEnter) {
          onEmptyEnter(e.shiftKey ? -1 : 1);
          return;
        }
        // Closed list (after Esc): Enter commits the typed text, as a comma does.
        if (!open) commitPending();
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
      case ",":
        if (e.nativeEvent.isComposing) return;
        e.preventDefault();
        commitPending();
        return;
      case "Escape":
        // Consumed only when it closes the list; otherwise it reaches the popover (closes it).
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          setForm(null);
        } else {
          // Esc cancels: the pending text is discarded, not committed by the blur.
          setQuery("");
          setActive(0);
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
    const category = form.category.trim();
    const kindId = onCreateKind({
      name,
      ...(category !== "" ? { categoryName: category } : {}),
      ...(form.notes.trim() !== "" ? { defaultNotes: Number(form.notes) } : {}),
    });
    setForm(null);
    append(kindId);
    inputRef.current?.focus();
  }

  function onFormKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (ownsKey(e)) e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeForm();
    }
  }

  const categoryName = form?.category.trim() ?? "";
  // Both optional (nothing is presumed); typed notes must be an integer >= 1.
  const notesOk = !form || form.notes.trim() === "" || (NOTES.test(form.notes) && Number(form.notes) >= 1);
  const formValid = name !== "" && notesOk;
  const isNewCategory =
    categoryName !== "" && !vocabulary.categories.some((c) => fold(categoryLabel(c, t).trim()) === fold(categoryName));
  const visibleCategories = vocabulary.categories.filter((c) => !c.hidden);

  const groupLabelId = (c: NeumeCategory | null) => (c ? `${baseId}-cat-${c.id}` : `${baseId}-nocat`);

  let flat = -1;
  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (rootRef.current?.contains(e.relatedTarget as Node | null)) return;
        // The window lost focus (Alt-Tab, DevTools): not a leave. The field stays the active
        // element; the text stays and is committed on the next real leave.
        if (!document.hasFocus() && document.activeElement === e.target) return;
        setOpen(false);
        setForm(null);
        commitPending();
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
                    // Selecting a word shows its detail; the list stays out of the way.
                    onSelect(i);
                    setOpen(false);
                    setForm(null);
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
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          className="min-w-[6ch] flex-1 border-none bg-transparent p-0 font-serif text-ink outline-none"
          value={query}
          onChange={(e) => {
            // Pasted (or IME) commas: every complete name is committed, the rest stays.
            const parts = e.target.value.split(",");
            const rest = parts.pop()!;
            if (parts.length > 0) commitNames(parts);
            const next = parts.length > 0 ? rest.trimStart() : rest;
            setQuery(next);
            setActive(0);
            setForm(null);
            setOpen(next !== "");
          }}
          onKeyDown={onInputKeyDown}
        />
      </div>

      {open && (
        <div
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-lg bg-surface-high py-1 shadow-elev-3"
          onMouseDown={(e) => {
            // A press on a part that takes no focus (group label, separator, padding,
            // scrollbar, gaps of the form) must not blur the field: that would commit.
            if ((e.target as Element).closest("input, textarea, select")) return;
            e.preventDefault();
          }}
        >
          {groups.length === 0 && (
            <div className="px-3 py-1.5 font-sans text-sm text-ink-muted italic">{t("annotation.neumes.empty")}</div>
          )}
          <div role="listbox" id={listId} aria-label={t("annotation.neumes")}>
            {groups.map((g) => (
              <div key={g.category?.id ?? ""} role="group" aria-labelledby={groupLabelId(g.category)}>
                <div
                  id={groupLabelId(g.category)}
                  className="px-3 pt-2 pb-0.5 font-sans text-caption font-semibold text-ink-muted"
                >
                  {g.category ? categoryLabel(g.category, t) : t("annotation.noCategory")}
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
                      {kind.defaultNotes !== undefined && (
                        <span aria-hidden="true" className="font-sans text-caption text-ink-muted tabular-nums">
                          {kind.defaultNotes}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {canCreate && (() => {
              const i = options.length - 1;
              return (
                <>
                  {groups.length > 0 && <div role="presentation" className="my-1 border-t border-rule" />}
                  <div
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === activeIndex}
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
                    <option key={c.id} value={categoryLabel(c, t)} />
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
                    aria-invalid={notesOk ? undefined : true}
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
