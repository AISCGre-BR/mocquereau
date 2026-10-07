import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { HyphenationMode } from "../../lib/syllabify";
import { modeSample, type SampleWord } from "../../lib/syllable-alternatives";

export const MODE_ORDER: readonly HyphenationMode[] = ["sung", "liturgical-typographic", "classical", "modern", "manual"];

const MODE_KEY: Record<HyphenationMode, string> = {
  sung: "sung",
  "liturgical-typographic": "liturgicalTypographic",
  classical: "classical",
  modern: "modern",
  manual: "manual",
};

/** Nome do modo para o rótulo e o resumo do passo. */
export function modeName(t: (key: string) => string, mode: HyphenationMode): string {
  return t(`newProject.mode.${MODE_KEY[mode]}.name`);
}

export interface ModeOptionsProps {
  raw: string;
  value: HyphenationMode;
  onChange(mode: HyphenationMode): void;
  /** Rótulo do grupo para leitores de tela (o rótulo visível é o do passo). */
  label: string;
}

function Sample({ words }: { words: SampleWord[] }) {
  return (
    <div data-sample className="col-start-2 font-serif text-[15px] leading-6 text-ink">
      {words.map((w, i) => (
        <span key={i} className="mr-[.38em]">
          <span className={w.differs ? "rounded-[3px] bg-orpiment-wash px-0.5" : undefined}>
            {w.syllables.map((s, si) => (
              <Fragment key={si}>
                {si > 0 ? <span className="px-[1px] text-ink-muted opacity-75">·</span> : null}
                {s}
              </Fragment>
            ))}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Os cinco modos de silabificação, cada um com um trecho do texto dividido daquele jeito. */
export function ModeOptions({ raw, value, onChange, label }: ModeOptionsProps) {
  const { t } = useTranslation();
  const sample = useMemo(() => modeSample(raw), [raw]);
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2.5">
      {MODE_ORDER.map((mode) => {
        const key = MODE_KEY[mode];
        const checked = mode === value;
        return (
          <label
            key={mode}
            className={[
              "grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-[10px] px-3.5 py-3",
              checked ? "bg-rubric-wash shadow-[0_0_0_2px_var(--rubric)]" : "shadow-[0_0_0_1px_var(--rule-soft)]",
            ].join(" ")}
          >
            <input
              type="radio"
              name="hyphenation-mode"
              value={mode}
              checked={checked}
              autoFocus={checked}
              onChange={() => onChange(mode)}
              className="mt-[1px] grid h-[18px] w-[18px] cursor-pointer appearance-none place-items-center rounded-full bg-surface shadow-[0_0_0_1.5px_var(--rule-strong)] outline-none checked:bg-[radial-gradient(circle,var(--rubric)_4.5px,var(--surface)_5px)] checked:shadow-[0_0_0_1.5px_var(--rubric)] focus-visible:ring-[3px] focus-visible:ring-rubric-wash"
            />
            <span>
              <span className="text-[14px] font-semibold leading-5">{t(`newProject.mode.${key}.name`)}</span>
              <span className="ml-2 text-[13px] leading-5 text-ink-muted">{t(`newProject.mode.${key}.desc`)}</span>
              {mode === "sung" ? (
                <span className="ml-2 text-[11px] font-semibold leading-4 text-verdigris">
                  {t("newProject.recommended")}
                </span>
              ) : null}
            </span>
            {mode !== "manual" ? <Sample words={sample[mode]} /> : null}
          </label>
        );
      })}
    </div>
  );
}
