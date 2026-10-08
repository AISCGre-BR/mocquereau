// src/renderer/components/recortes/SyllableStrip.tsx
//
// Faixa de sílabas da vista Recortes: o texto corrido da peça, com o estado de
// cada sílaba na página ativa (caixa, ativa, gap, fora do intervalo, coberta por
// outra página) e duas alças que ajustam o intervalo da página.

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ManuscriptLine, SyllabifiedWord } from "../../lib/models";
import { pigmentOf } from "../../ui/pigment";
import { useTooltip } from "../../ui/Tooltip";
import { MenuItem, MenuSurface } from "../../ui/Menu";
import { belowElement } from "../texto/SyllableText";

export interface SyllableRange {
  start: number;
  end: number;
}

export interface SyllableStripProps {
  words: SyllabifiedWord[];
  line: ManuscriptLine;
  activeSyllable: number | null;
  /** Sílabas confirmadas por outra página da mesma fonte → rótulo dessa página. */
  coveredByOthers: ReadonlyMap<number, string>;
  onActivate(i: number): void;
  onRangeChange(range: SyllableRange): void;
  onToggleGap(i: number): void;
  onRemoveBox(i: number): void;
}

type Edge = "start" | "end";
type Menu = { index: number; x: number; y: number };

export function SyllableStrip({
  words,
  line,
  activeSyllable,
  coveredByOthers,
  onActivate,
  onRangeChange,
  onToggleGap,
  onRemoveBox,
}: SyllableStripProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const range = line.syllableRange;
  const last = words.reduce((n, w) => n + w.syllables.length, 0) - 1;

  // The latest range for the drag listeners, which outlive the render that started them.
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const onRangeChangeRef = useRef(onRangeChange);
  onRangeChangeRef.current = onRangeChange;
  const stopDragRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDragRef.current?.(), []);

  useEffect(() => {
    if (activeSyllable === null) return;
    scrollRef.current
      ?.querySelector(`[data-syllable="${activeSyllable}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeSyllable]);

  /** Moves one edge, never past the other one nor out of the text. */
  function moveEdge(edge: Edge, to: number) {
    const r = rangeRef.current;
    const next =
      edge === "start"
        ? { start: Math.max(0, Math.min(to, r.end)), end: r.end }
        : { start: r.start, end: Math.min(last, Math.max(to, r.start)) };
    if (next.start === r.start && next.end === r.end) return;
    onRangeChangeRef.current(next);
  }

  /**
   * Syllable an edge lands on for a pointer at x: the start sits before the
   * first syllable whose centre is right of x, the end after the last syllable
   * whose centre is left of it.
   */
  function edgeAt(edge: Edge, x: number): number {
    const els = scrollRef.current?.querySelectorAll<HTMLElement>("[data-syllable]") ?? [];
    const centres = Array.from(els, (el) => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    if (edge === "start") {
      const i = centres.findIndex((c) => c > x);
      return i < 0 ? last : i;
    }
    let i = -1;
    centres.forEach((c, k) => {
      if (c < x) i = k;
    });
    return i;
  }

  function startDrag(edge: Edge, e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    // preventDefault also keeps focus where it was: a mouse drag doesn't pull
    // the Tab/Enter flow of the editor into the strip.
    e.preventDefault();
    // Window listeners, not pointer capture: the handle moves in the DOM as the range changes.
    const move = (ev: globalThis.MouseEvent) => moveEdge(edge, edgeAt(edge, ev.clientX));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      stopDragRef.current = null;
    };
    stopDragRef.current?.();
    stopDragRef.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function handleKey(edge: Edge, e: KeyboardEvent<HTMLDivElement>) {
    const at = edge === "start" ? range.start : range.end;
    let to: number;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") to = at - 1;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") to = at + 1;
    else if (e.key === "Home") to = edge === "start" ? 0 : range.start;
    else if (e.key === "End") to = edge === "start" ? range.end : last;
    else return;
    // The window shortcuts would move the active box with the same arrows.
    e.preventDefault();
    e.stopPropagation();
    moveEdge(edge, to);
  }

  function handle(edge: Edge) {
    return (
      <div
        key={`handle-${edge}`}
        role="slider"
        tabIndex={0}
        aria-label={t(edge === "start" ? "syllableStrip.rangeStart" : "syllableStrip.rangeEnd")}
        aria-orientation="horizontal"
        aria-valuemin={edge === "start" ? 0 : range.start}
        aria-valuemax={edge === "start" ? range.end : last}
        aria-valuenow={edge === "start" ? range.start : range.end}
        className={[
          "mb-[9px] h-[26px] w-[3px] flex-none cursor-ew-resize rounded-xs bg-ink-soft",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          edge === "start" ? "mr-2" : "ml-1 mr-3",
        ].join(" ")}
        onPointerDown={(e) => startDrag(edge, e)}
        onKeyDown={(e) => handleKey(edge, e)}
      />
    );
  }

  function activate(i: number) {
    if (i < range.start) onRangeChange({ start: i, end: range.end });
    else if (i > range.end) onRangeChange({ start: range.start, end: i });
    onActivate(i);
  }

  function openMenu(i: number, e: MouseEvent<HTMLElement>) {
    e.preventDefault();
    setMenu({ index: i, ...(e.clientX === 0 && e.clientY === 0 ? belowElement(e.currentTarget) : { x: e.clientX, y: e.clientY }) });
  }

  // Roving focus: the strip is one tab stop; arrows move between syllables.
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const tabStop = Math.min(last, Math.max(0, focusIdx ?? activeSyllable ?? range.start));
  const isInert = (i: number) => coveredByOthers.has(i) && (i < range.start || i > range.end);

  function focusSyllable(i: number) {
    const to = Math.max(0, Math.min(last, i));
    setFocusIdx(to);
    scrollRef.current?.querySelector<HTMLElement>(`[data-syllable="${to}"]`)?.focus();
  }

  function syllableKey(i: number, e: KeyboardEvent<HTMLElement>) {
    if (e.key === "ArrowLeft") focusSyllable(i - 1);
    else if (e.key === "ArrowRight") focusSyllable(i + 1);
    else if (e.key === "Home") focusSyllable(0);
    else if (e.key === "End") focusSyllable(last);
    else if (e.key === "Enter" || e.key === " ") {
      if (!isInert(i)) activate(i);
    } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      if (!isInert(i)) setMenu({ index: i, ...belowElement(e.currentTarget) });
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }

  const items: ReactNode[] = [];
  let index = 0;
  for (const [w, word] of words.entries()) {
    word.syllables.forEach((text, s) => {
      const i = index++;
      if (i === range.start) items.push(handle("start"));
      items.push(
        <Syllable
          key={i}
          index={i}
          text={text}
          wordEnd={s === word.syllables.length - 1 && w < words.length - 1}
          active={i === activeSyllable}
          inRange={i >= range.start && i <= range.end}
          hasBox={line.syllableBoxes?.[i] != null}
          gap={line.gaps.includes(i)}
          coveredBy={coveredByOthers.get(i)}
          tabStop={i === tabStop}
          onClick={() => activate(i)}
          onContextMenu={(e) => openMenu(i, e)}
          onKeyDown={(e) => syllableKey(i, e)}
          onFocus={() => setFocusIdx(i)}
        />,
      );
      if (i === range.end) items.push(handle("end"));
    });
  }

  const menuIndex = menu?.index ?? -1;
  return (
    <>
      <div
        ref={scrollRef}
        role="toolbar"
        aria-orientation="horizontal"
        aria-label={t("syllableStrip.label")}
        className="flex h-11 items-end overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-lg bg-surface px-3.5 shadow-elev-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={(e) => {
          if (scrollRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) scrollRef.current.scrollLeft += e.deltaY;
        }}
      >
        {items}
      </div>
      {menu && (
        <MenuSurface
          aria-label={t("syllableStrip.menuLabel")}
          className="fixed z-[130]"
          style={{ left: menu.x, top: menu.y }}
          onClose={() => setMenu(null)}
        >
          <MenuItem
            label={t("syllableStrip.noNeume")}
            checked={line.gaps.includes(menuIndex)}
            disabled={menuIndex < range.start || menuIndex > range.end}
            onSelect={() => onToggleGap(menuIndex)}
          />
          {line.syllableBoxes?.[menuIndex] != null && (
            <MenuItem label={t("syllableStrip.removeBox")} onSelect={() => onRemoveBox(menuIndex)} />
          )}
        </MenuSurface>
      )}
    </>
  );
}

// ── Syllable ──────────────────────────────────────────────────────────────────

interface SyllableProps {
  index: number;
  text: string;
  wordEnd: boolean;
  active: boolean;
  inRange: boolean;
  hasBox: boolean;
  gap: boolean;
  coveredBy: string | undefined;
  tabStop: boolean;
  onClick(): void;
  onContextMenu(e: MouseEvent<HTMLElement>): void;
  onKeyDown(e: KeyboardEvent<HTMLElement>): void;
  onFocus(): void;
}

function Syllable({
  index,
  text,
  wordEnd,
  active,
  inRange,
  hasBox,
  gap,
  coveredBy,
  tabStop,
  onClick,
  onContextMenu,
  onKeyDown,
  onFocus,
}: SyllableProps) {
  const { t } = useTranslation();
  const { anchorProps, tooltip } = useTooltip<HTMLSpanElement>(t("syllableStrip.coveredBy", { folio: coveredBy ?? "" }));
  // Also confirmed by another page of the source: shown as taken everywhere,
  // but inert only outside this page's range (overlapping pages are allowed).
  const covered = coveredBy !== undefined;
  const inert = covered && !inRange;

  const className = [
    "relative mb-1.5 flex-none select-none rounded-sm px-1 pt-1 pb-1.5 font-serif text-[16px] leading-5",
    wordEnd ? "mr-3" : "",
    active ? "bg-rubric-wash italic text-rubric" : inRange && !hasBox ? "text-ink-muted" : "text-ink",
    inRange && !covered ? "" : "opacity-40",
    inert ? "cursor-default" : "cursor-pointer",
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
  ]
    .filter(Boolean)
    .join(" ");

  let underline: ReactNode = null;
  const bar = "absolute inset-x-1 bottom-px";
  if (gap && inRange) {
    underline = <span data-underline aria-hidden className={`${bar} border-b-2 border-dashed border-rule-strong`} />;
  } else if (hasBox) {
    underline = (
      <span
        data-underline
        aria-hidden
        className={`${bar} h-[3px] rounded-xs ${active ? "bg-rubric" : `${pigmentOf(index)} bg-[var(--pig)]`}`}
      />
    );
  }

  return (
    <span
      data-syllable={index}
      role="button"
      aria-pressed={active}
      aria-disabled={inert || undefined}
      tabIndex={tabStop ? 0 : -1}
      className={className}
      {...(covered ? anchorProps : {})}
      // A click must not focus the strip, or Tab/Enter would stop driving the editor.
      onMouseDown={(e) => e.preventDefault()}
      onClick={inert ? undefined : onClick}
      onContextMenu={(e) => (inert ? e.preventDefault() : onContextMenu(e))}
      onKeyDown={onKeyDown}
      onFocus={() => {
        onFocus();
        if (covered) anchorProps.onFocus();
      }}
    >
      {text}
      {underline}
      {covered && tooltip}
    </span>
  );
}
