import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { useTooltip } from "./Tooltip";

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<V extends string> {
  options: ReadonlyArray<SegmentOption<V>>;
  value: V | null;
  onChange: (value: V) => void;
  /** tabs: seletor de vistas (tablist, setas selecionam). toggle: grupo de ferramentas (toolbar, aria-pressed). */
  mode?: "tabs" | "toggle";
  iconOnly?: boolean;
  "aria-label": string;
  className?: string;
}

export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  mode = "tabs",
  iconOnly = false,
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps<V>) {
  const ref = useRef<HTMLDivElement>(null);
  const firstEnabled = options.find((o) => !o.disabled)?.value;
  const focusValue = options.some((o) => o.value === value && !o.disabled) ? value : firstEnabled;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (e.key === "ArrowRight") next = (current + 1) % buttons.length;
    if (e.key === "ArrowLeft") next = (current - 1 + buttons.length) % buttons.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = buttons.length - 1;
    e.preventDefault();
    e.stopPropagation();
    const target = buttons[next];
    target.focus();
    if (mode === "tabs") onChange(target.dataset.value as V);
  }

  return (
    <div
      ref={ref}
      role={mode === "tabs" ? "tablist" : "toolbar"}
      aria-label={ariaLabel}
      className={["sc-seg", className ?? ""].filter(Boolean).join(" ")}
      onKeyDown={onKeyDown}
    >
      {options.map((option) => (
        <Segment
          key={option.value}
          option={option}
          mode={mode}
          iconOnly={iconOnly}
          selected={option.value === value}
          tabIndex={option.value === focusValue ? 0 : -1}
          onSelect={() => onChange(option.value)}
        />
      ))}
    </div>
  );
}

interface SegmentProps<V extends string> {
  option: SegmentOption<V>;
  mode: "tabs" | "toggle";
  iconOnly: boolean;
  selected: boolean;
  tabIndex: number;
  onSelect: () => void;
}

function Segment<V extends string>({ option, mode, iconOnly, selected, tabIndex, onSelect }: SegmentProps<V>) {
  const { anchorProps, tooltip } = useTooltip<HTMLButtonElement>(option.label, option.shortcut);
  const withTooltip = iconOnly || option.shortcut !== undefined;
  return (
    <>
      <button
        type="button"
        data-value={option.value}
        role={mode === "tabs" ? "tab" : undefined}
        aria-selected={mode === "tabs" ? selected : undefined}
        aria-pressed={mode === "toggle" ? selected : undefined}
        aria-label={iconOnly ? option.label : undefined}
        className={iconOnly ? "is-icon" : undefined}
        disabled={option.disabled}
        tabIndex={tabIndex}
        onClick={onSelect}
        {...(withTooltip ? anchorProps : {})}
      >
        {option.icon}
        {iconOnly ? null : option.label}
      </button>
      {withTooltip && tooltip}
    </>
  );
}
