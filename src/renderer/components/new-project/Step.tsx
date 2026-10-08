import { useId, type ReactNode } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";

export type StepState = "done" | "current" | "todo";

export interface StepProps {
  number: number;
  label: string;
  state: StepState;
  /** Resumo do que foi escolhido (passo feito), em serifa. */
  summary?: ReactNode;
  /** Reabre o passo feito. */
  onChange?(): void;
  /** Último passo: sem a linha vertical até o próximo círculo. */
  last?: boolean;
  children?: ReactNode;
}

const CIRCLE: Record<StepState, string> = {
  done: "bg-surface text-verdigris shadow-[0_0_0_1.5px_var(--verdigris)]",
  current: "bg-linear-to-b from-rubric-soft to-rubric text-on-rubric",
  todo: "text-ink-muted shadow-[0_0_0_1.5px_var(--rule-strong)]",
};

/** Um passo do guia de criação: círculo, rótulo e, conforme o estado, resumo ou conteúdo. */
export function Step({ number, label, state, summary, onChange, last = false, children }: StepProps) {
  const { t } = useTranslation();
  const labelId = useId();
  return (
    <li
      aria-current={state === "current" ? "step" : undefined}
      className={["relative grid grid-cols-[28px_minmax(0,1fr)_auto] gap-x-4", last ? "" : "pb-5"].join(" ")}
    >
      {!last && (
        <span aria-hidden="true" className="absolute bottom-1 left-[13px] top-8 w-0.5 rounded-[1px] bg-rule-soft" />
      )}
      <span
        aria-hidden="true"
        className={[
          "grid h-7 w-7 place-items-center rounded-full text-[13px] font-semibold leading-none",
          CIRCLE[state],
        ].join(" ")}
      >
        {state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={2.25} /> : number}
      </span>
      <div className={state === "current" ? "flex min-w-0 flex-col gap-2.5" : "min-w-0"}>
        <div
          id={labelId}
          className={[
            "text-[15px] leading-7",
            state === "todo" ? "font-medium text-ink-muted" : "font-semibold",
          ].join(" ")}
        >
          {label}
        </div>
        {state === "done" && summary ? (
          <div className="truncate font-serif text-[15px] text-ink-soft">{summary}</div>
        ) : null}
        {state === "current" ? children : null}
      </div>
      {state === "done" && onChange ? (
        <Button className="px-2 text-rubric" aria-describedby={labelId} onClick={onChange}>
          {t("newProject.change")}
        </Button>
      ) : (
        <span />
      )}
    </li>
  );
}
