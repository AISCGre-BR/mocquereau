import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { SyllabifiedWord } from "../lib/models";
import { syllabifyText, type HyphenationMode } from "../lib/syllabify";
import { ambiguousWords } from "../lib/syllable-alternatives";
import { Button } from "../ui/Button";
import { Input, Textarea } from "../ui/Field";
import { Step, type StepState } from "../components/new-project/Step";
import { ModeOptions, modeName } from "../components/new-project/ModeOptions";
import { SyllableText } from "../components/texto/SyllableText";

export interface NewProjectDraft {
  title: string;
  author: string;
  raw: string;
  mode: HyphenationMode;
  words: SyllabifiedWord[];
}

export interface NewProjectGuideProps {
  onCancel(): void;
  onCreate(draft: NewProjectDraft): void;
}

type StepIndex = 0 | 1 | 2 | 3;

/** Primeiras linhas do texto numa linha só, para o resumo do passo (o CSS corta com reticências). */
function textSummary(raw: string): string {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i, all) => (i < all.length - 1 && !/[\p{P}]$/u.test(l) ? `${l}.` : l))
    .join(" ");
}

/** Os campos são rotulados pelo passo e pelo placeholder; o rótulo do campo fica só para leitores de tela. */
const HIDDEN_LABEL = "[&>span]:sr-only";

/**
 * Criação guiada em quatro passos (peça, texto, divisão silábica, conferir). Nada é
 * gravado até "Criar projeto": mudar o texto ou o modo refaz a divisão e descarta as
 * edições do passo 4 sem perguntar.
 */
export function NewProjectGuide({ onCancel, onCreate }: NewProjectGuideProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<StepIndex>(0);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [raw, setRaw] = useState("");
  const [mode, setMode] = useState<HyphenationMode>("sung");
  const [words, setWords] = useState<SyllabifiedWord[]>([]);
  /** Texto e modo de onde vieram as palavras do passo 4. */
  const wordsSource = useRef<{ raw: string; mode: HyphenationMode } | null>(null);

  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => {
    // Esc já tratado (menu de divisões, menus da janela) chega com defaultPrevented.
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onCancelRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ambiguities = useMemo(
    () => (step === 3 && (mode === "sung" || mode === "liturgical-typographic") ? ambiguousWords(raw) : undefined),
    [step, mode, raw],
  );

  const pieceTitle = title.trim() || t("file.untitled");

  function goTo(next: StepIndex) {
    if (next === 3) {
      const src = wordsSource.current;
      if (!src || src.raw !== raw || src.mode !== mode) {
        wordsSource.current = { raw, mode };
        setWords(syllabifyText(raw, mode));
      }
    }
    setStep(next);
  }

  function stateOf(i: StepIndex): StepState {
    return i < step ? "done" : i === step ? "current" : "todo";
  }

  const advanceOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goTo(1);
    }
  };

  const continueButton = (onClick: () => void, disabled = false) => (
    <div className="flex justify-end pt-1">
      <Button variant="filled" disabled={disabled} onClick={onClick}>
        {t("newProject.continue")}
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-4 py-10">
      <div className="h-fit w-full max-w-[760px] rounded-lg bg-surface px-12 py-9 shadow-[var(--elev-2),var(--highlight)]">
        <ol>
          <Step
            number={1}
            label={t("newProject.step.piece")}
            state={stateOf(0)}
            summary={[pieceTitle, author.trim()].filter(Boolean).join(" · ")}
            onChange={() => goTo(0)}
          >
            <Input
              label={t("newProject.titlePlaceholder")}
              placeholder={t("newProject.titlePlaceholder")}
              className={`${HIDDEN_LABEL} [&_input]:font-serif [&_input]:text-title-lg`}
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={advanceOnEnter}
            />
            <Input
              label={t("newProject.authorPlaceholder")}
              placeholder={t("newProject.authorPlaceholder")}
              className={HIDDEN_LABEL}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              onKeyDown={advanceOnEnter}
            />
            {continueButton(() => goTo(1))}
          </Step>
          <Step
            number={2}
            label={t("newProject.step.text")}
            state={stateOf(1)}
            summary={textSummary(raw)}
            onChange={() => goTo(1)}
          >
            <div className="text-label text-ink-muted">{t("newProject.hint.text")}</div>
            <Textarea
              liturgical
              label={t("newProject.step.text")}
              placeholder={t("newProject.textPlaceholder")}
              className={`${HIDDEN_LABEL} [&_textarea]:h-[230px]`}
              value={raw}
              autoFocus
              onChange={(e) => setRaw(e.target.value)}
            />
            {continueButton(() => goTo(2), !raw.trim())}
          </Step>
          <Step
            number={3}
            label={t("newProject.step.division")}
            state={stateOf(2)}
            summary={modeName(t, mode)}
            onChange={() => goTo(2)}
          >
            <div className="text-label text-ink-muted">{t("newProject.hint.division")}</div>
            <ModeOptions raw={raw} value={mode} onChange={setMode} label={t("newProject.step.division")} />
            {continueButton(() => goTo(3))}
          </Step>
          <Step number={4} label={t("newProject.step.review")} state={stateOf(3)} last>
            <div className="text-label text-ink-muted">{t("newProject.hint.review")}</div>
            <SyllableText
              raw={raw}
              words={words}
              onWordsChange={(next) => setWords(next)}
              ambiguities={ambiguities}
              // Sem rolagem própria: o menu de divisões é absoluto e seria cortado; a folha rola.
              className="rounded-md bg-parchment px-4 py-3.5 text-[17px] leading-[31px] text-ink shadow-inset"
            />
            <div className="flex justify-end pt-1">
              <Button
                variant="filled"
                onClick={() => onCreate({ title: pieceTitle, author: author.trim(), raw, mode, words })}
              >
                {t("newProject.create")}
              </Button>
            </div>
          </Step>
        </ol>
        <div className="pt-2">
          <Button className="px-0" onClick={onCancel}>
            {t("newProject.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
