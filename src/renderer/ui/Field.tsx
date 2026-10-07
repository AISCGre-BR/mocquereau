import type { ComponentProps, ReactNode } from "react";

interface FieldFrameProps {
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

function FieldFrame({ label, error, className, children }: FieldFrameProps) {
  return (
    <label className={["sc-field", error ? "sc-field--error" : "", className ?? ""].filter(Boolean).join(" ")}>
      <span>{label}</span>
      {children}
      {error && <small>{error}</small>}
    </label>
  );
}

export type InputProps = Omit<ComponentProps<"input">, "className"> & {
  label: string;
  error?: string;
  className?: string;
};

export function Input({ label, error, className, ...rest }: InputProps) {
  return (
    <FieldFrame label={label} error={error} className={className}>
      <input className="sc-input" aria-invalid={error ? true : undefined} {...rest} />
    </FieldFrame>
  );
}

export type SelectProps = Omit<ComponentProps<"select">, "className"> & {
  label: string;
  error?: string;
  className?: string;
};

/** Select nativo (orientação do Parchment). */
export function Select({ label, error, className, children, ...rest }: SelectProps) {
  return (
    <FieldFrame label={label} error={error} className={className}>
      <select className="sc-select" aria-invalid={error ? true : undefined} {...rest}>
        {children}
      </select>
    </FieldFrame>
  );
}

export type TextareaProps = Omit<ComponentProps<"textarea">, "className"> & {
  label: string;
  error?: string;
  className?: string;
  /** Texto litúrgico é conteúdo: serifa 16/24. Sem a flag, usa a fonte da interface. */
  liturgical?: boolean;
};

export function Textarea({ label, error, className, liturgical = false, ...rest }: TextareaProps) {
  return (
    <FieldFrame label={label} error={error} className={className}>
      <textarea
        className={liturgical ? "sc-textarea" : "sc-textarea font-sans text-body"}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </FieldFrame>
  );
}
