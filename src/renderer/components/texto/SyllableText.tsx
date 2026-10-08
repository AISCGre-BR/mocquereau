import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SyllabifiedWord } from "../../lib/models";
import { wordLines } from "../../lib/word-lines";
import { mergeSyllables, splitSyllable } from "../../lib/syllable-edit";
import type { Ambiguity } from "../../lib/syllable-alternatives";
import { MenuSurface } from "../../ui/Menu";

export interface SyllableTextProps {
  raw: string;
  words: SyllabifiedWord[];
  onWordsChange(next: SyllabifiedWord[], changedWord: number): void;
  /** Palavras cujas divisões cantada e tipográfica divergem: sublinhado + popover. */
  ambiguities?: Map<number, Ambiguity>;
  /** Menu da palavra: clique direito (no ponteiro) ou Shift+F10 / tecla de menu (sob a palavra). */
  onWordContextMenu?(wordIdx: number, at: { x: number; y: number }): void;
  className?: string;
}

const sameDivision = (a: string[], b: string[]) => a.join("·") === b.join("·");

/** Canto inferior esquerdo do elemento: onde abre um menu pedido pelo teclado. */
export function belowElement(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.bottom };
}

/**
 * Só vale a ambiguidade cujas letras são as da palavra: com edições manuais antigas
 * (contagem de palavras diferente do texto), o índice pode apontar para outra palavra.
 */
function ambiguityFor(amb: Ambiguity | undefined, word: SyllabifiedWord | undefined): Ambiguity | undefined {
  if (!amb || !word) return undefined;
  const letters = word.syllables.join("");
  return amb.sung.join("") === letters || amb.typographic.join("") === letters ? amb : undefined;
}

const MENU_KEY = (e: KeyboardEvent<HTMLElement>) => e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");

/**
 * Texto com as divisões silábicas editáveis no lugar: o ponto entre sílabas une; o clique
 * entre duas letras separa. O clique numa letra usa a borda mais próxima (metade esquerda:
 * antes da letra; direita: depois), comparando clientX com getBoundingClientRect(). Em jsdom
 * o retângulo é zero, então clientX 0 conta como metade esquerda.
 */
export function SyllableText({
  raw,
  words,
  onWordsChange,
  ambiguities,
  onWordContextMenu,
  className,
}: SyllableTextProps) {
  const { t } = useTranslation();
  const [menuWord, setMenuWord] = useState<number | null>(null);
  const wordRefs = useRef(new Map<number, HTMLElement>());
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = wordLines(raw, words.length);

  // Pontos de união: uma só parada de Tab para o texto (o último ponto focado, ou o
  // primeiro); as setas esquerda/direita andam entre eles.
  const [activeDot, setActiveDot] = useState<string | null>(null);
  const dotKeys = words.flatMap((w, wi) => w.syllables.slice(1).map((_, k) => `${wi}:${k + 1}`));
  const tabbableDot = activeDot !== null && dotKeys.includes(activeDot) ? activeDot : (dotKeys[0] ?? null);

  function onDotKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const dots = Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-merge-dot]") ?? []);
    const next = dots[dots.indexOf(e.currentTarget) + (e.key === "ArrowRight" ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    next.focus();
  }

  function onTextKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!onWordContextMenu || !MENU_KEY(e)) return;
    const wordEl = (e.target as HTMLElement).closest<HTMLElement>("[data-word-index]");
    if (!wordEl || !containerRef.current?.contains(wordEl)) return;
    e.preventDefault();
    onWordContextMenu(Number(wordEl.dataset.wordIndex), belowElement(wordEl));
  }

  function apply(next: SyllabifiedWord[] | null, wordIdx: number) {
    if (next) onWordsChange(next, wordIdx);
  }

  function onLetterClick(e: MouseEvent<HTMLSpanElement>, wordIdx: number, sylIdx: number, charIdx: number) {
    // O segundo clique de um duplo clique não separa de novo (a sílaba já mudou).
    if (e.detail > 1) {
      e.stopPropagation();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const left = e.clientX <= rect.left + rect.width / 2;
    const at = left ? charIdx : charIdx + 1;
    const len = words[wordIdx].syllables[sylIdx].length;
    if (at < 1 || at >= len) return; // borda da sílaba: deixa subir (abre o popover, se ambígua)
    e.stopPropagation();
    apply(splitSyllable(words, wordIdx, sylIdx, at), wordIdx);
  }

  function renderMenu(wordIdx: number, amb: Ambiguity) {
    const current = words[wordIdx].syllables;
    const options = [
      { syllables: amb.sung, origin: t("syllableText.sung") },
      { syllables: amb.typographic, origin: t("syllableText.typographic") },
    ];
    const close = (reason?: string) => {
      setMenuWord(null);
      if (reason === "escape") wordRefs.current.get(wordIdx)?.focus();
    };
    return (
      <span role="none" onClick={(e) => e.stopPropagation()}>
        <MenuSurface
          aria-label={t("syllableText.alternatives")}
          className="absolute left-0 top-full z-[130] mt-1 whitespace-nowrap font-sans"
          anchor={wordRefs.current.get(wordIdx)}
          autoFocus={false}
          onClose={close}
        >
          {options.map((o) => {
            const isCurrent = sameDivision(o.syllables, current);
            return (
              <button
                key={o.origin}
                type="button"
                data-menu-item
                role="menuitem"
                aria-current={isCurrent || undefined}
                className="sc-menu__item"
                tabIndex={-1}
                ref={(el) => {
                  if (isCurrent) el?.focus();
                }}
                onClick={() => {
                  close();
                  apply(
                    words.map((w, i) => (i === wordIdx ? { ...w, syllables: o.syllables } : w)),
                    wordIdx,
                  );
                }}
              >
                <span className="sc-menu__check" aria-hidden="true">
                  {isCurrent ? <Check className="mx-auto h-3 w-3" strokeWidth={2.25} /> : null}
                </span>
                <span className="font-serif">{o.syllables.join("·")}</span>
                <span className="sc-menu__kbd">{o.origin}</span>
              </button>
            );
          })}
        </MenuSurface>
      </span>
    );
  }

  return (
    <div ref={containerRef} className={className} onKeyDown={onTextKeyDown}>
      {lines.map((indices, li) => (
        // Espaço entre palavras mais largo que o normal: separa bem das sílabas e seus pontos.
        <div key={li} className="font-serif [word-spacing:0.2em]">
          {indices.map((wi, k) => {
            const word = words[wi];
            const amb = ambiguityFor(ambiguities?.get(wi), word);
            return (
              <span key={wi}>
                {k > 0 ? " " : null}
                <span
                  data-testid={`word-${wi}`}
                  data-word-index={wi}
                  className={[
                    "relative inline-block",
                    amb ? "cursor-pointer underline decoration-orpiment decoration-dotted underline-offset-4" : "",
                  ].join(" ")}
                  ref={(el) => {
                    if (el) wordRefs.current.set(wi, el);
                    else wordRefs.current.delete(wi);
                  }}
                  {...(amb
                    ? {
                        tabIndex: 0,
                        role: "button",
                        "aria-haspopup": "menu" as const,
                        "aria-expanded": menuWord === wi,
                        onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                            e.preventDefault();
                            setMenuWord(wi);
                          }
                        },
                      }
                    : {})}
                  onClick={amb ? () => setMenuWord((m) => (m === wi ? null : wi)) : undefined}
                  onContextMenu={
                    onWordContextMenu
                      ? (e) => {
                          e.preventDefault();
                          // Menu pedido pelo teclado chega sem coordenadas: abre sob a palavra.
                          const keyboard = e.clientX === 0 && e.clientY === 0;
                          onWordContextMenu(wi, keyboard ? belowElement(e.currentTarget) : { x: e.clientX, y: e.clientY });
                        }
                      : undefined
                  }
                >
                  {word.syllables.map((syl, si) => (
                    <span key={si}>
                      {si > 0 ? (
                        <button
                          type="button"
                          data-merge-dot
                          tabIndex={tabbableDot === `${wi}:${si}` ? 0 : -1}
                          onFocus={() => setActiveDot(`${wi}:${si}`)}
                          onKeyDown={onDotKeyDown}
                          aria-label={t("syllableText.merge")}
                          className="cursor-pointer rounded-sm px-[1px] text-ink-muted hover:bg-rubric-wash hover:text-rubric focus-visible:bg-rubric-wash focus-visible:text-rubric"
                          onClick={(e) => {
                            e.stopPropagation();
                            apply(mergeSyllables(words, wi, si - 1), wi);
                          }}
                        >
                          ·
                        </button>
                      ) : null}
                      {Array.from(syl).map((ch, ci) => (
                        <span key={ci} data-char-index={ci} onClick={(e) => onLetterClick(e, wi, si, ci)}>
                          {ch}
                        </span>
                      ))}
                    </span>
                  ))}
                  {amb && menuWord === wi ? renderMenu(wi, amb) : null}
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
