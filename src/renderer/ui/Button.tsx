import type { ComponentProps, ReactNode } from "react";

export type ButtonVariant = "filled" | "elevated" | "tonal" | "text" | "danger";
export type ButtonSize = "md" | "sm";

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  filled: "sc-btn--filled",
  elevated: "sc-btn--elevated",
  tonal: "sc-btn--tonal",
  text: "",
  danger: "sc-btn--danger",
};

/** Botão do Parchment. Uma ação principal (filled) por região; destrutivo nunca é filled. */
export function Button({
  variant = "text",
  size = "md",
  icon,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "sc-btn",
    VARIANT_CLASS[variant],
    size === "sm" ? "h-[26px] px-2" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {icon}
      {children}
    </button>
  );
}
