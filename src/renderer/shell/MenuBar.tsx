import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { MenuItem, MenuSeparator, MenuSubmenu, MenuSurface, type MenuCloseReason } from "../ui/Menu";
import { formatAccelerator } from "./accelerator";
import { isSubmenu, type MenuCommand, type MenuDefinition } from "./menuTypes";

export interface MenuBarProps {
  menus: MenuDefinition[];
  /** Título do projeto (ou "Mocquereau" sem projeto), centralizado. */
  title: string;
  /** Mostra "— Editado" depois do título. */
  edited: boolean;
  platform: string;
}

/**
 * Faixa de 30px no topo da janela (sc-menubar): arrastável, com os menus e o título.
 * No Windows/Linux substitui o menu nativo. No macOS (onda A1) também mostra os menus,
 * deslocados para depois dos semáforos, até o menu nativo vir do registro de comandos.
 */
export function MenuBar({ menus, title, edited, platform }: MenuBarProps) {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [focusMode, setFocusMode] = useState<"first" | "last">("first");
  const topRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const count = menus.length;
  const isMac = platform === "darwin";

  function openMenu(index: number, focus: "first" | "last" = "first") {
    setFocusMode(focus);
    setOpenIndex(index);
  }

  // Elemento focado antes de o foco entrar na menubar (Alt, clique, Tab): recebe o
  // foco de volta quando um item é escolhido ou o menu é fechado com Esc.
  const returnFocus = useRef<HTMLElement | null>(null);
  function onFocusIn(e: FocusEvent<HTMLDivElement>) {
    const from = e.relatedTarget;
    if (from instanceof HTMLElement && !e.currentTarget.contains(from)) returnFocus.current = from;
  }

  function closeMenu(index: number, reason: MenuCloseReason) {
    setOpenIndex(null);
    const back = returnFocus.current;
    returnFocus.current = null;
    if (reason !== "escape" && reason !== "select") return;
    if (back && back.isConnected && back !== document.body) back.focus();
    else if (reason === "escape") topRefs.current[index]?.focus();
    else (document.activeElement as HTMLElement | null)?.blur();
  }

  function onTopKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (e.key) {
      case "ArrowDown":
      case "Enter":
      case " ":
        openMenu(index, "first");
        break;
      case "ArrowUp":
        openMenu(index, "last");
        break;
      case "ArrowRight":
        topRefs.current[(index + 1) % count]?.focus();
        break;
      case "ArrowLeft":
        topRefs.current[(index - 1 + count) % count]?.focus();
        break;
      case "Escape":
        e.currentTarget.blur();
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  function renderCommand(item: MenuCommand) {
    return (
      <MenuItem
        key={item.id}
        label={item.label}
        shortcut={item.accelerator ? formatAccelerator(item.accelerator, platform) : undefined}
        checked={item.checked}
        disabled={item.disabled}
        onSelect={item.onSelect}
      />
    );
  }

  // Alt sozinho (Windows/Linux) leva o foco ao primeiro menu.
  useEffect(() => {
    if (isMac) return;
    let altAlone = false;
    function onDown(e: globalThis.KeyboardEvent) {
      altAlone = e.key === "Alt" && !e.ctrlKey && !e.shiftKey && !e.metaKey;
    }
    function onUp(e: globalThis.KeyboardEvent) {
      if (e.key === "Alt" && altAlone) {
        e.preventDefault();
        topRefs.current[0]?.focus();
      }
      altAlone = false;
    }
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [isMac]);

  return (
    <div
      role="menubar"
      aria-label={t("shell.menubar")}
      onFocus={onFocusIn}
      className={["sc-menubar shrink-0 select-none [-webkit-app-region:drag]", isMac ? "pl-[78px]" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {!isMac && (
        <span className="sc-menubar__brand" aria-hidden="true">
          M
        </span>
      )}
      {menus.map((menu, index) => (
        <div key={menu.id} className="relative [-webkit-app-region:no-drag]">
          <button
            ref={(el) => {
              topRefs.current[index] = el;
            }}
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openIndex === index}
            className="sc-menubar__top"
            onClick={() => (openIndex === index ? setOpenIndex(null) : openMenu(index))}
            onMouseEnter={() => {
              if (openIndex !== null && openIndex !== index) openMenu(index);
            }}
            onKeyDown={(e) => onTopKeyDown(e, index)}
          >
            {menu.label}
          </button>
          {openIndex === index && (
            <MenuSurface
              aria-label={menu.label}
              anchor={topRefs.current[index]}
              autoFocus={focusMode}
              className="absolute left-0 top-full z-[120] mt-1"
              onClose={(reason) => closeMenu(index, reason)}
              onNavigateOut={(direction) => openMenu((index + (direction === "right" ? 1 : -1) + count) % count)}
            >
              {menu.items.map((item, k) =>
                item === "separator" ? (
                  <MenuSeparator key={`sep-${k}`} />
                ) : isSubmenu(item) ? (
                  <MenuSubmenu key={item.id} label={item.label} icon={item.icon}>
                    {item.items.map((sub, j) =>
                      sub === "separator" ? <MenuSeparator key={`sep-${j}`} /> : renderCommand(sub),
                    )}
                  </MenuSubmenu>
                ) : (
                  renderCommand(item)
                ),
              )}
            </MenuSurface>
          )}
        </div>
      ))}
      <span className="sc-menubar__title">
        <span className="font-serif">{title}</span>
        {edited && <span className="sc-menubar__state">{t("shell.edited")}</span>}
      </span>
    </div>
  );
}
