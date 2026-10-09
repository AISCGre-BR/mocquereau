// src/renderer/components/recortes/SuggestActions.tsx
//
// Ação principal da vista Recortes na barra (spec S2): Sugerir, que vira
// Cancelar durante a execução; com sugestões na página, Aceitar N à esquerda.
// Com a preferência desligada (S8) não aparece nada.

import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Button } from "../../ui/Button";
import { useSuggestions } from "../../hooks/SuggestionsContext";
import { useRecortesCommands } from "../../hooks/RecortesContext";

export function SuggestActions() {
  const { t } = useTranslation();
  const suggestions = useSuggestions();
  // Same selector as the menu (usable image, nothing running): one source of truth.
  const { canSuggest } = useRecortesCommands().state;
  if (!suggestions.enabled) return null;

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
        disabled={!running && !canSuggest}
        onClick={running ? suggestions.cancel : suggestions.suggest}
      >
        {t(running ? "recortes.suggest.cancel" : "recortes.suggest.run")}
      </Button>
    </>
  );
}
