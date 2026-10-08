// src/renderer/components/table-preview/TabelaTools.tsx
//
// Tools of the Tabela view in the App toolbar: zoom out, the current zoom
// (click resets to 100%) and zoom in. State comes from the TableZoomProvider.

import { useTranslation } from "react-i18next";
import { Minus, Plus } from "lucide-react";
import { IconButton } from "../../ui/IconButton";
import { useTooltip } from "../../ui/Tooltip";
import { formatAccelerator } from "../../shell/accelerator";
import { ZOOM_PRESETS, useTableZoom } from "../../hooks/useTableZoom";

export function TabelaTools() {
  const { t } = useTranslation();
  const { zoom, zoomIn, zoomOut, zoomReset } = useTableZoom();
  const platform = window.mocquereau?.platform ?? "";
  const shortcut = (accel: string) => formatAccelerator(accel, platform);
  const reset = useTooltip<HTMLButtonElement>(t("tablePreview.zoomReset"), shortcut("Ctrl+0"));
  const iconProps = { "aria-hidden": true, strokeWidth: 1.75 } as const;

  return (
    <div role="group" aria-label={t("tablePreview.zoomControls")} className="flex items-center gap-0.5">
      <IconButton
        label={t("tablePreview.zoomOut")}
        shortcut={shortcut("Ctrl+-")}
        icon={<Minus {...iconProps} />}
        disabled={zoom === ZOOM_PRESETS[0]}
        onClick={zoomOut}
      />
      <button
        type="button"
        className="sc-btn min-w-12 justify-center px-1 tabular-nums text-ink-soft"
        aria-label={t("tablePreview.zoomCurrent", { zoom })}
        onClick={zoomReset}
        {...reset.anchorProps}
      >
        {zoom}%
      </button>
      {reset.tooltip}
      <IconButton
        label={t("tablePreview.zoomIn")}
        shortcut={shortcut("Ctrl+=")}
        icon={<Plus {...iconProps} />}
        disabled={zoom === ZOOM_PRESETS[ZOOM_PRESETS.length - 1]}
        onClick={zoomIn}
      />
    </div>
  );
}
