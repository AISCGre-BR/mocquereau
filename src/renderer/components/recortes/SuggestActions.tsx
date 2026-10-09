// src/renderer/components/recortes/SuggestActions.tsx
//
// Ação principal da vista Recortes na barra (spec S2): Sugerir, que vira
// Cancelar durante a execução; com sugestões na página, Aceitar N à esquerda.
// Com a preferência desligada (S8) não aparece nada.

import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Button } from "../../ui/Button";
import { useSuggestions } from "../../hooks/SuggestionsContext";
import { useProject } from "../../hooks/useProject";
import { useRecortesContext } from "../../hooks/RecortesContext";

export function SuggestActions() {
  const { t } = useTranslation();
  const suggestions = useSuggestions();
  const { state } = useProject();
  const recortes = useRecortesContext();
  if (!suggestions.enabled) return null;

  const line = state.project?.sources
    .find((s) => s.id === recortes.activeSourceId)
    ?.lines.find((l) => l.id === recortes.activeLineId);
  const image = line?.image as { dataUrl?: string; missing?: boolean } | undefined;
  const usable = !!image?.dataUrl && !image.missing;
  const running = suggestions.status === "running";
  const count = Object.keys(suggestions.active).length;

  return (
    <>
      {count > 0 && (
        <Button variant="tonal" onClick={suggestions.acceptAll}>
          {t("recortes.suggest.acceptCount", { count })}
        </Button>
      )}
      <Button
        variant="filled"
        icon={<Sparkles aria-hidden="true" />}
        disabled={!running && !usable}
        onClick={running ? suggestions.cancel : suggestions.suggest}
      >
        {t(running ? "recortes.suggest.cancel" : "recortes.suggest.run")}
      </Button>
    </>
  );
}
