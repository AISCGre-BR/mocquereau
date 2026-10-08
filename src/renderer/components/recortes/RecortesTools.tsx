// src/renderer/components/recortes/RecortesTools.tsx
//
// Tools of the Recortes view in the App toolbar: the drawing toggles and the
// "Imagem ▾" button with its panel. State comes from the RecortesProvider.

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Copy, Eye, Image as ImageIcon, SquareDashed } from "lucide-react";
import { IconButton } from "../../ui/IconButton";
import { useProject } from "../../hooks/useProject";
import { useRecortesContext } from "../../hooks/RecortesContext";
import { IMAGE_ADJUSTMENTS_DEFAULT } from "../../lib/image-adjustments";
import type { ImageAdjustments } from "../../lib/models";
import { ImagePanel } from "./ImagePanel";

export function RecortesTools() {
  const { t } = useTranslation();
  const { state, dispatch } = useProject();
  const recortes = useRecortesContext();
  const imageButton = useRef<HTMLButtonElement>(null);
  // Leaving the view closes the panel: it does not reopen on the way back.
  const { setImagePanelOpen } = recortes;
  useEffect(() => () => setImagePanelOpen(false), [setImagePanelOpen]);

  const source = state.project?.sources.find((s) => s.id === recortes.activeSourceId) ?? null;
  const line = source?.lines.find((l) => l.id === recortes.activeLineId) ?? null;
  const hasImage = !!line?.image;
  const open = recortes.imagePanelOpen && hasImage;

  function update(adjustments: Partial<ImageAdjustments>) {
    if (!source || !line) return;
    dispatch({ type: "UPDATE_LINE_ADJUSTMENTS", payload: { sourceId: source.id, lineId: line.id, adjustments } });
  }

  const iconProps = { "aria-hidden": true, strokeWidth: 1.75 } as const;

  return (
    <>
      <div role="group" aria-label={t("recortes.tools.label")} className="flex gap-0.5">
        <IconButton
          label={t("recortes.tools.draw")}
          icon={<SquareDashed {...iconProps} />}
          pressed={recortes.drawMode}
          onClick={() => recortes.setDrawMode(!recortes.drawMode)}
        />
        <IconButton
          label={t("recortes.tools.sameSize")}
          icon={<Copy {...iconProps} />}
          pressed={recortes.sameSize}
          onClick={() => recortes.setSameSize(!recortes.sameSize)}
        />
        <IconButton
          label={t("recortes.tools.showAll")}
          icon={<Eye {...iconProps} />}
          pressed={recortes.showAll}
          onClick={() => recortes.setShowAll(!recortes.showAll)}
        />
      </div>
      <span className="sc-toolbar__sep" aria-hidden="true" />
      <div className="relative">
        <button
          ref={imageButton}
          type="button"
          className={["sc-btn px-2.5", open ? "" : "text-ink-soft"].join(" ")}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-pressed={open}
          disabled={!hasImage}
          onClick={() => recortes.setImagePanelOpen(!open)}
        >
          <ImageIcon {...iconProps} />
          {t("recortes.tools.image")}
          <ChevronDown {...iconProps} />
        </button>
        {open && line && source && (
          <ImagePanel
            adjustments={line.imageAdjustments}
            anchor={imageButton.current}
            onUpdate={update}
            onReset={() => update({ ...IMAGE_ADJUSTMENTS_DEFAULT })}
            onApplyToOtherPages={
              source.lines.length > 1
                ? () => dispatch({ type: "COPY_LINE_ADJUSTMENTS_TO_SOURCE", payload: { sourceId: source.id, fromLineId: line.id } })
                : undefined
            }
            onClose={() => recortes.setImagePanelOpen(false)}
          />
        )}
      </div>
    </>
  );
}
