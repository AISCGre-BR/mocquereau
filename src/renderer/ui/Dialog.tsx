import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  open: boolean;
  /** Pergunta ou verbo. */
  title: string;
  onClose: () => void;
  /** Ação principal acionada por Enter (fora de botões, textarea e select). */
  onConfirm?: () => void;
  children?: ReactNode;
  /** Ordem: destrutiva à esquerda; Cancelar (elevated) e a principal (filled) à direita. */
  actions?: ReactNode;
  className?: string;
}

export function Dialog({ open, title, onClose, onConfirm, children, actions, className }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first =
      panel?.querySelector<HTMLElement>("[data-autofocus]:not(:disabled)") ??
      panel?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel;
    first?.focus();
    return () => {
      previous?.focus?.();
    };
  }, [open]);

  // Modal de verdade para o teclado: se o foco saiu do painel (botão focado ficou
  // desabilitado durante a exportação, clique fora), as teclas iriam para o body e
  // dali para os atalhos globais (Delete apaga caixa, Ctrl+N troca de projeto).
  // Um listener de captura na window barra essas teclas e devolve o foco ao painel.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusIsLost = () => {
      const active = document.activeElement as HTMLElement | null;
      return !active || !panel.contains(active) || (active as HTMLButtonElement).disabled === true;
    };
    let active = true;
    const reclaim = () => {
      if (active && panel.isConnected && focusIsLost()) panel.focus();
    };
    function onKeyDownCapture(e: globalThis.KeyboardEvent) {
      if (e.target instanceof Node && panel!.contains(e.target) && !focusIsLost()) return;
      e.stopPropagation();
      panel!.focus();
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
    }
    function onFocusOut(e: FocusEvent) {
      if (e.relatedTarget instanceof Node && panel!.contains(e.relatedTarget)) return;
      // Depois do evento: o foco já está no destino (ou no body).
      queueMicrotask(reclaim);
    }
    const observer = new MutationObserver(reclaim);
    observer.observe(panel, { subtree: true, attributes: true, attributeFilter: ["disabled"], childList: true });
    window.addEventListener("keydown", onKeyDownCapture, true);
    panel.addEventListener("focusout", onFocusOut);
    return () => {
      active = false;
      observer.disconnect();
      window.removeEventListener("keydown", onKeyDownCapture, true);
      panel.removeEventListener("focusout", onFocusOut);
    };
  }, [open]);

  if (!open) return null;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter" && onConfirm) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag !== "BUTTON" && tag !== "TEXTAREA" && tag !== "SELECT" && tag !== "A") {
        e.preventDefault();
        onConfirm();
      }
    } else if (e.key === "Tab") {
      const list = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (list.length === 0) {
        e.preventDefault();
      } else {
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    // Diálogo é modal: nenhuma tecla chega aos atalhos globais do app.
    e.stopPropagation();
  }

  return createPortal(
    <div
      className="sc-backdrop fixed inset-0 z-[100]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={["sc-dialog", className ?? ""].filter(Boolean).join(" ")}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="sc-dialog__title">
          {title}
        </h2>
        {children !== undefined && <div className="sc-dialog__body">{children}</div>}
        {actions && <div className="sc-dialog__actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
