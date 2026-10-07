import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, ChevronRight } from "lucide-react";

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

/** Itens habilitados deste menu (os de um submenu aberto pertencem ao submenu). */
function enabledItems(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("[data-menu-item]:not(:disabled)")).filter(
    (el) => el.closest('[role="menu"]') === root,
  );
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

export interface MenuSubmenuProps {
  label: string;
  /** Vai na coluna da marca de seleção (ex.: globo do Idioma). */
  icon?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}

/**
 * Item que abre um submenu à direita. Teclado: seta para a direita, Enter ou espaço
 * abrem e focam o primeiro item; seta para a esquerda ou Esc fecham e devolvem o
 * foco ao gatilho. Escolher um item fecha o menu inteiro. Mouse: passar por cima abre.
 */
export function MenuSubmenu({ label, icon, disabled, children }: MenuSubmenuProps) {
  const ctx = useContext(MenuContext);
  const [open, setOpen] = useState<false | "keyboard" | "pointer">(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close(reason: MenuCloseReason) {
    setOpen(false);
    if (reason === "select" || reason === "tab") ctx?.close(reason);
    else if (reason === "escape") triggerRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowRight" && e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    setOpen("keyboard");
  }

  return (
    <div role="none" className="relative" onMouseLeave={() => open === "pointer" && setOpen(false)}>
      <button
        ref={triggerRef}
        type="button"
        data-menu-item
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open !== false}
        className="sc-menu__item"
        disabled={disabled}
        tabIndex={-1}
        onClick={() => setOpen((o) => (o ? false : "keyboard"))}
        onMouseEnter={() => setOpen((o) => o || "pointer")}
        onKeyDown={onKeyDown}
      >
        <span className="sc-menu__check flex items-center justify-center" aria-hidden="true">
          {icon}
        </span>
        <span>{label}</span>
        <span className="sc-menu__kbd" aria-hidden="true">
          <ChevronRight className="h-3 w-3" strokeWidth={2} />
        </span>
      </button>
      {open && (
        <MenuSurface
          aria-label={label}
          anchor={triggerRef.current}
          autoFocus={open === "keyboard" ? "first" : false}
          className="absolute left-full top-[-6px] z-[130] ml-1"
          onClose={close}
          onNavigateOut={(direction) => {
            if (direction === "left") close("escape");
          }}
        >
          {children}
        </MenuSurface>
      )}
    </div>
  );
}
