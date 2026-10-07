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
  onWordContextMenu?(wordIdx: number, e: MouseEvent): void;
  className?: string;
}

const sameDivision = (a: string[], b: string[]) => a.join("·") === b.join("·");

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
  const lines = wordLines(raw, words.length);

  function apply(next: SyllabifiedWord[] | null, wordIdx: number) {
    if (next) onWordsChange(next, wordIdx);
  }

  function onLetterClick(e: MouseEvent<HTMLSpanElement>, wordIdx: number, sylIdx: number, charIdx: number) {
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
    <div className={className}>
      {lines.map((indices, li) => (
        <div key={li} className="font-serif">
          {indices.map((wi, k) => {
            const word = words[wi];
            const amb = ambiguities?.get(wi);
            return (
              <span key={wi}>
                {k > 0 ? " " : null}
                <span
                  data-testid={`word-${wi}`}
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
                  onContextMenu={onWordContextMenu ? (e) => onWordContextMenu(wi, e) : undefined}
                >
                  {word.syllables.map((syl, si) => (
                    <span key={si}>
                      {si > 0 ? (
                        <button
                          type="button"
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
