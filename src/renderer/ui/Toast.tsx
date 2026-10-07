import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastKind = "ok" | "warn" | "error";

export interface ToastInput {
  kind: ToastKind;
  message: string;
  action?: { label: string; onSelect: () => void };
}

export interface ToastApi {
  show: (toast: ToastInput) => number;
  dismiss: (id: number) => void;
}

export const TOAST_AUTO_DISMISS_MS = 4000;

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de <Toaster>");
  return ctx;
}

export interface ToasterProps {
  /** Rótulo do botão que dispensa toasts de erro (vem do i18n). */
  dismissLabel: string;
  children: ReactNode;
}

/** Faixa no pé da janela. ok/warn somem em 4 s; error fica até ser dispensado. */
export function Toaster({ dismissLabel, children }: ToasterProps) {
  const [toasts, setToasts] = useState<Array<ToastInput & { id: number }>>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle !== undefined) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { ...toast, id }]);
      if (toast.kind !== "error") {
        timers.current.set(id, window.setTimeout(() => dismiss(id), TOAST_AUTO_DISMISS_MS));
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((handle) => window.clearTimeout(handle));
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[150] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`sc-toast sc-toast--${t.kind} pointer-events-auto`}
          >
            <span className="sc-toast__dot" aria-hidden="true" />
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="sc-toast__act"
                onClick={() => {
                  t.action?.onSelect();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            {t.kind === "error" && (
              <button type="button" className="sc-toast__act" onClick={() => dismiss(t.id)}>
                {dismissLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
