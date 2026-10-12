import { useId, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { fold } from "@shared/annotation/vocabulary";
import type { Tag } from "@shared/annotation/types";
import { isCtrlEnter, ownsKey } from "./keys";

export interface TagsFieldProps {
  id?: string;
  /** aria-label when no external <label> points at the field. */
  label?: string;
  /** Tag ids applied. */
  value: string[];
  tags: Tag[];
  /** Called with the typed names (only when they differ from the current ones). */
  onCommit: (names: string[]) => void;
}

const SEP = "; ";
const MAX_SUGGESTIONS = 8;
const keepFocus = (e: MouseEvent) => e.preventDefault();

function splitNames(text: string): string[] {
  return text
    .split(";")
    .map((n) => n.trim())
    .filter(Boolean);
}

/**
 * Tag names separated by "; ". Suggests existing names that start with the part after the
 * last ";". Enter or blur applies (unknown names become new tags). A referenced tag that no
 * longer exists shows by its id and is kept.
 */
export function TagsField({ id, label, value, tags, onCommit }: TagsFieldProps) {
  const baseId = useId();
  const inputId = id ?? `${baseId}-input`;
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const currentNames = useMemo(
    () => value.map((tagId) => tags.find((t) => t.id === tagId)?.name ?? tagId),
    [value, tags],
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const text = draft ?? currentNames.join(SEP);

  const suggestions = useMemo(() => {
    if (draft === null) return [];
    const cut = draft.lastIndexOf(";");
    const fragment = fold(draft.slice(cut + 1));
    if (fragment === "") return [];
    const taken = new Set(splitNames(draft.slice(0, cut + 1)).map(fold));
    return tags
      .filter((t) => fold(t.name).startsWith(fragment) && fold(t.name) !== fragment && !taken.has(fold(t.name)))
      .slice(0, MAX_SUGGESTIONS);
  }, [draft, tags]);
  const open = focused && !dismissed && suggestions.length > 0;
  const activeIndex = open && active < suggestions.length ? active : -1;

  function commit() {
    if (draft === null) return;
    const names = splitNames(draft);
    setDraft(null);
    setActive(-1);
    if (names.join("\n") !== currentNames.join("\n")) onCommit(names);
  }

  function complete(name: string) {
    const cut = (draft ?? "").lastIndexOf(";");
    const head = cut >= 0 ? `${(draft ?? "").slice(0, cut + 1)} ` : "";
    setDraft(`${head}${name}${SEP}`);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (isCtrlEnter(e)) {
      commit(); // then bubbles to the editor, which goes to the next syllable
      return;
    }
    if (ownsKey(e)) e.stopPropagation();
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
        if (!open) return;
        e.preventDefault();
        {
          const n = suggestions.length;
          const from = activeIndex < 0 ? (e.key === "ArrowDown" ? -1 : n) : activeIndex;
          setActive((from + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
        }
        return;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0) complete(suggestions[activeIndex].name);
        else commit();
        return;
      case "Escape":
        e.preventDefault();
        if (open) setDismissed(true);
        else {
          setDraft(null);
          setActive(-1);
        }
        return;
    }
  }

  return (
    <div className="relative">
      <input
        id={inputId}
        type="text"
        role="combobox"
        className="sc-input w-full"
        autoComplete="off"
        spellCheck={false}
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          setActive(-1);
          setDismissed(false);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div
          role="listbox"
          id={listId}
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-lg bg-surface-high py-1 shadow-elev-3"
        >
          {suggestions.map((tag, i) => (
            <div
              key={tag.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              className={[
                "cursor-pointer px-3 py-1 font-sans text-sm text-ink",
                i === activeIndex ? "bg-rubric-wash" : "",
              ].join(" ")}
              onMouseDown={keepFocus}
              onMouseMove={() => i !== activeIndex && setActive(i)}
              onClick={() => complete(tag.name)}
            >
              {tag.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
