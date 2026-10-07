import type { ReactNode } from "react";

export interface PanelProps {
  title?: string;
  /** No máximo um botão de ícone. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: "section" | "aside" | "div";
}

/** Cartão surface pousado na mesa, com cabeçalho de 40px opcional. */
export function Panel({ title, action, children, className, as: Tag = "section" }: PanelProps) {
  return (
    <Tag className={["sc-panel", className ?? ""].filter(Boolean).join(" ")}>
      {(title || action) && (
        <header className="sc-panel__head">
          {title ? <h3 className="sc-panel__title">{title}</h3> : <span />}
          {action}
        </header>
      )}
      {children}
    </Tag>
  );
}
