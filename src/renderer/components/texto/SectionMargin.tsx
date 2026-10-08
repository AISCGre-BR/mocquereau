import { useEffect, useState, type MouseEvent, type RefObject } from "react";
import type { Section } from "../../lib/models";
import { pigmentOf } from "../../ui/pigment";

export interface SectionMarginProps {
  sections: Section[];
  /** Contêiner do texto: as palavras (data-testid="word-<i>") são medidas dentro dele. */
  textRef: RefObject<HTMLElement | null>;
  /** Muda quando o texto se redesenha (palavras, sílabas), para medir de novo. */
  layoutKey: unknown;
  onSectionMenu(section: Section, e: MouseEvent<HTMLElement>): void;
}

interface Placement {
  top: number;
  height: number;
}

/** Topo da primeira linha e base da última linha do intervalo, relativos ao texto. */
function measure(container: HTMLElement, section: Section): Placement | null {
  const first = container.querySelector<HTMLElement>(`[data-testid="word-${section.wordRange[0]}"]`);
  const last = container.querySelector<HTMLElement>(`[data-testid="word-${section.wordRange[1]}"]`) ?? first;
  if (!first || !last) return null;
  const origin = container.getBoundingClientRect().top;
  const top = first.getBoundingClientRect().top - origin;
  const bottom = last.getBoundingClientRect().bottom - origin;
  return { top, height: Math.max(0, bottom - top) };
}

/**
 * Margem esquerda da folha: rótulo de cada seção na altura da sua primeira linha e um
 * traço no pigmento da seção cobrindo as linhas do intervalo.
 */
export function SectionMargin({ sections, textRef, layoutKey, onSectionMenu }: SectionMarginProps) {
  const ordered = [...sections].sort((a, b) => a.wordRange[0] - b.wordRange[0]);
  const [placements, setPlacements] = useState<Map<string, Placement>>(new Map());

  // Efeito passivo, não de layout: o ref do texto (irmão seguinte na árvore) só está
  // ligado depois da fase de layout desta margem.
  useEffect(() => {
    const container = textRef.current;
    if (!container) return;
    const update = () => {
      const next = new Map<string, Placement>();
      for (const s of sections) {
        const p = measure(container, s);
        if (p) next.set(s.id, p);
      }
      setPlacements(next);
    };
    update();
    let alive = true;
    // A fonte embutida pode chegar depois e mudar a quebra das linhas.
    void document.fonts?.ready.then(() => alive && update());
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(container);
    return () => {
      alive = false;
      observer?.disconnect();
    };
  }, [sections, textRef, layoutKey]);

  return (
    <div className="relative h-full">
      {ordered.map((section, index) => {
        // Sem medida (intervalo fora do texto, ou o editor aberto no lugar das sílabas): não mostra.
        const p = placements.get(section.id);
        if (!p) return null;
        return (
          <div
            key={section.id}
            className="absolute right-5 flex items-start gap-2"
            style={{ top: p.top, height: p.height }}
          >
            <button
              type="button"
              className="mt-[9px] max-w-[112px] cursor-default truncate rounded-xs text-right text-caption italic text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
              onClick={(e) => onSectionMenu(section, e)}
              onContextMenu={(e) => {
                e.preventDefault();
                onSectionMenu(section, e);
              }}
            >
              {section.name}
            </button>
            <div
              aria-hidden="true"
              className={`${pigmentOf(index)} my-1 w-[2px] self-stretch rounded-[1px] bg-[var(--pig)]`}
            />
          </div>
        );
      })}
    </div>
  );
}
