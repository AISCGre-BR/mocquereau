import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check } from "lucide-react";

export type MenuCloseReason = "escape" | "select" | "outside" | "tab";

const MenuContext = createContext<{ close: (reason: MenuCloseReason) => void } | null>(null);

export interface MenuSurfaceProps {
  children: ReactNode;
  onClose: (reason: MenuCloseReason) => void;
  onNavigateOut?: (direction: "left" | "right") => void;
  autoFocus?: "first" | "last" | false;
  /** Elemento cujo clique não conta como "fora" (ex.: o botão que abriu o menu). */
  anchor?: HTMLElement | null;
  "aria-label"?: string;
  className?: string;
  style?: CSSProperties;
}

function enabledItems(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("[data-menu-item]:not(:disabled)"));
}

/** Placa do menu (sc-menu). Serve à menubar e a menus de contexto. */
export function MenuSurface({
  children,
  onClose,
  onNavigateOut,
  autoFocus = "first",
  anchor,
  className,
  style,
  "aria-label": ariaLabel,
}: MenuSurfaceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!autoFocus || !ref.current) return;
    const list = enabledItems(ref.current);
    (autoFocus === "first" ? list[0] : list[list.length - 1])?.focus();
  }, [autoFocus]);

  useEffect(() => {
    function onPointerDown(e: Event) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      onCloseRef.current("outside");
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [anchor]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const root = ref.current;
    if (!root) return;
    const list = enabledItems(root);
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (n: number) => list[(n + list.length) % list.length]?.focus();
    switch (e.key) {
      case "ArrowDown":
        focusAt(index < 0 ? 0 : index + 1);
        break;
      case "ArrowUp":
        focusAt(index < 0 ? list.length - 1 : index - 1);
        break;
      case "Home":
        focusAt(0);
        break;
      case "End":
        focusAt(list.length - 1);
        break;
      case "Enter":
      case " ":
        if (index >= 0) list[index].click();
        break;
      case "Escape":
        onClose("escape");
        break;
      case "Tab":
        onClose("tab");
        break;
      case "ArrowLeft":
      case "ArrowRight":
        if (!onNavigateOut) return;
        onNavigateOut(e.key === "ArrowLeft" ? "left" : "right");
        break;
      default:
        // Menu aberto é modal para o teclado: teclas que ele não usa (Ctrl+N,
        // Delete…) também não chegam aos atalhos globais nem ao editor.
        e.stopPropagation();
        return;
    }
    // Nada que o menu trate chega aos atalhos globais (ex.: Enter/setas do editor).
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <MenuContext.Provider value={{ close: onClose }}>
      <div
        ref={ref}
        role="menu"
        aria-label={ariaLabel}
        className={["sc-menu", className ?? ""].filter(Boolean).join(" ")}
        style={style}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </MenuContext.Provider>
  );
}

export interface MenuItemProps {
  label: string;
  shortcut?: string;
  /** Definido = item de alternância (menuitemcheckbox). */
  checked?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export function MenuItem({ label, shortcut, checked, disabled, onSelect }: MenuItemProps) {
  const ctx = useContext(MenuContext);
  const isToggle = checked !== undefined;
  return (
    <button
      type="button"
      data-menu-item
      role={isToggle ? "menuitemcheckbox" : "menuitem"}
      aria-checked={isToggle ? checked : undefined}
      className="sc-menu__item"
      disabled={disabled}
      tabIndex={-1}
      onClick={() => {
        ctx?.close("select");
        onSelect();
      }}
    >
      <span className="sc-menu__check" aria-hidden="true">
        {checked ? <Check className="mx-auto h-3 w-3" strokeWidth={2.25} /> : null}
      </span>
      <span>{label}</span>
      <span className="sc-menu__kbd">{shortcut ?? ""}</span>
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="sc-menu__sep" />;
}
