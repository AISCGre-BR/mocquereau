// src/renderer/components/annotation/SuggestInput.tsx
//
// Text input with a styled suggestion list (replaces the native <datalist>, which renders as an
// unstyled popup). The list opens while typing or on ArrowDown, filters by word prefix, and is
// keyboard accessible: ArrowUp/Down move, Enter picks, Esc closes only the list.

import { useId, useLayoutEffect, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { fold } from "@shared/annotation/vocabulary";

export interface SuggestInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "list" | "role"> {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}

export function SuggestInput({ value, onChange, suggestions, onKeyDown, onBlur, ...rest }: SuggestInputProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // -1: nothing chosen yet, so Enter keeps its usual meaning
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [anchor, setAnchor] = useState<HTMLInputElement | null>(null);

  const q = fold(value.trim());
  const matches = suggestions.filter((s) => {
    const f = fold(s.trim());
    return f !== q && (q === "" || f.split(/\s+/).some((w) => w.startsWith(q)));
  });
  const shown = open && matches.length > 0;
  const activeIndex = Math.min(active, matches.length - 1);
  const optionId = (i: number) => `${listId}-${i}`;

  useLayoutEffect(() => {
    if (!shown || !anchor) return;
    const r = anchor.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: r.width });
  }, [shown, anchor, value]);

  function pick(i: number) {
    onChange(matches[i]);
    setOpen(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (matches.length > 0) {
        e.preventDefault();
        if (!shown) {
          setOpen(true);
          setActive(e.key === "ArrowDown" ? 0 : matches.length - 1);
        } else if (activeIndex < 0) {
          setActive(e.key === "ArrowDown" ? 0 : matches.length - 1);
        } else {
          const d = e.key === "ArrowDown" ? 1 : -1;
          setActive((activeIndex + d + matches.length) % matches.length);
        }
        return;
      }
    } else if (e.key === "Escape" && shown) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    } else if (e.key === "Enter" && shown && activeIndex >= 0) {
      e.preventDefault();
      e.stopPropagation();
      pick(activeIndex);
      return;
    }
    onKeyDown?.(e);
  }

  return (
    <>
      <input
        {...rest}
        ref={setAnchor}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={shown ? listId : undefined}
        aria-activedescendant={shown && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(-1);
          setOpen(e.target.value.trim() !== "");
        }}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          setOpen(false);
          onBlur?.(e);
        }}
      />
      {shown && rect && (
        <div
          role="listbox"
          id={listId}
          style={{ position: "fixed", top: rect.top, left: rect.left, minWidth: rect.width }}
          className="z-50 max-h-48 overflow-y-auto rounded-lg border border-rule bg-surface-high py-1 shadow-elev-3"
          onMouseDown={(e) => e.preventDefault()}
        >
          {matches.map((s, i) => (
            <div
              key={s}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              className={[
                "cursor-pointer px-3 py-1 font-serif text-ink",
                i === activeIndex ? "bg-rubric-wash" : "",
              ].join(" ")}
              onMouseMove={() => i !== activeIndex && setActive(i)}
              onClick={() => pick(i)}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
