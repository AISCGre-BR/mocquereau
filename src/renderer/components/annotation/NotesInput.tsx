import { stopOwnedKeys } from "./keys";

export interface NotesInputProps {
  id: string;
  value: number | undefined;
  placeholder?: string;
  /** undefined = cleared (field absent). Only called when the value changes. */
  onChange: (n: number | undefined) => void;
}

const COUNT = /^[1-9]\d*$/;

/** Small number-of-notes field: empty means "not given"; anything but a positive integer is ignored. */
export function NotesInput({ id, value, placeholder, onChange }: NotesInputProps) {
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className="sc-input w-16 tabular-nums"
      placeholder={placeholder}
      value={value === undefined ? "" : String(value)}
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (raw !== "" && !COUNT.test(raw)) return;
        const next = raw === "" ? undefined : Number(raw);
        if (next !== value) onChange(next);
      }}
      onKeyDown={stopOwnedKeys}
    />
  );
}
