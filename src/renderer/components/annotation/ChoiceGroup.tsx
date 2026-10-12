import { SegmentedControl } from "../../ui/SegmentedControl";

export interface ChoiceGroupProps<V extends string> {
  /** aria-label of the group. */
  label: string;
  options: ReadonlyArray<{ value: V; label: string }>;
  value: V | undefined;
  onChange: (v: V | undefined) => void;
  size?: "sm" | "md";
}

/** Choice control that starts unselected and clears when the selected option is clicked again. */
export function ChoiceGroup<V extends string>({ label, options, value, onChange, size = "md" }: ChoiceGroupProps<V>) {
  return (
    <SegmentedControl
      mode="toggle"
      aria-label={label}
      options={options}
      value={value ?? null}
      onChange={(v) => onChange(v === value ? undefined : v)}
      className={size === "sm" ? "text-xs" : undefined}
    />
  );
}
