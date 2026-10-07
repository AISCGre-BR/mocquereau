import type { ComponentProps, ReactNode } from "react";
import { useTooltip } from "./Tooltip";

export type IconButtonProps = Omit<ComponentProps<"button">, "children" | "aria-label" | "ref"> & {
  /** Nome da ação: vira aria-label e o texto do tooltip. */
  label: string;
  icon: ReactNode;
  shortcut?: string;
  pressed?: boolean;
};

/** Botão só de ícone (30x30). Sempre com aria-label e tooltip com atalho. */
export function IconButton({ label, icon, shortcut, pressed, className, type = "button", ...rest }: IconButtonProps) {
  const { anchorProps, tooltip } = useTooltip<HTMLButtonElement>(label, shortcut);
  return (
    <>
      <button
        type={type}
        className={["sc-btn sc-btn--icon", className ?? ""].filter(Boolean).join(" ")}
        aria-label={label}
        aria-pressed={pressed}
        {...rest}
        {...anchorProps}
      >
        {icon}
      </button>
      {tooltip}
    </>
  );
}
