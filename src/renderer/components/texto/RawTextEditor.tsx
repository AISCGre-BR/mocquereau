import { useTranslation } from "react-i18next";
import { Textarea } from "../../ui/Field";

export interface RawTextEditorProps {
  value: string;
  onChange(value: string): void;
  /** Sair do editor (blur ou Esc): quem chama aplica o texto. */
  onDone(): void;
}

/** O texto litúrgico como digitado, no lugar das sílabas. */
export function RawTextEditor({ value, onChange, onDone }: RawTextEditorProps) {
  const { t } = useTranslation();
  return (
    <Textarea
      liturgical
      label={t("texto.rawText")}
      placeholder={t("newProject.textPlaceholder")}
      className="[&>span]:sr-only [&_textarea]:min-h-[260px] [&_textarea]:text-[19px] [&_textarea]:leading-[34px]"
      value={value}
      autoFocus
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        // A janela perdeu o foco (Alt+Tab): o editor continua aberto, nada é aplicado.
        if (!document.hasFocus()) return;
        onDone();
      }}
      onKeyDown={(e) => {
        // Esc durante a composição de um acento cancela a composição, não o editor.
        if (e.key !== "Escape" || e.nativeEvent.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        onDone();
      }}
    />
  );
}
