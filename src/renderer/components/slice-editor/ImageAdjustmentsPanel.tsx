// src/renderer/components/slice-editor/ImageAdjustmentsPanel.tsx
//
// Painel flutuante de ajustes de imagem (Mirador-like) para o SliceEditor.
// Componente puro/controlado: recebe `adjustments` atual e reporta mudanças
// via `onUpdate(Partial<ImageAdjustments>)`. Sem estado próprio dos campos
// — a fonte de verdade fica no reducer do projeto (action
// UPDATE_LINE_ADJUSTMENTS). Phase 10 / IMG-06.

import { SlidersHorizontal, RotateCcw, RotateCw, X } from "lucide-react";
import type { ImageAdjustments } from "../../lib/models";
import {
  IMAGE_ADJUSTMENTS_DEFAULT,
  isDefaultAdjustments,
  normalizeRotation,
} from "../../lib/image-adjustments";
import { useTranslation } from "react-i18next";

interface Props {
  adjustments?: ImageAdjustments;
  onUpdate: (partial: Partial<ImageAdjustments>) => void;
  onClose: () => void;
}

export function ImageAdjustmentsPanel({ adjustments, onUpdate, onClose }: Props) {
  const { t } = useTranslation();
  const adj = adjustments ?? IMAGE_ADJUSTMENTS_DEFAULT;
  const isDefault = isDefaultAdjustments(adjustments);

  // Botões preset ±90° INCREMENTAM o ângulo atual (D-06):
  // usuário em 17° + clique +90° → 107°. Slider/input REPLACE.
  // Chamamos normalizeRotation aqui mesmo o reducer já normalizando — defesa
  // adicional contra flicker visual em frames onde o painel re-renderiza
  // antes do dispatch fechar.
  const rotate = (delta: number) => {
    onUpdate({ rotation: normalizeRotation(adj.rotation + delta) });
  };

  // O slider/input mostram a rotação como signed [-180, 180] (centro = 0)
  // para UX mais intuitiva — gira "para a esquerda" (negativo) ou "direita"
  // (positivo) a partir do natural. O estado canônico continua [0, 360);
  // a conversão é só de display. 180° é mostrado como 180 (não -180) por
  // convenção: usuário que digita 180 vê 180.
  const displayRotation = adj.rotation > 180 ? adj.rotation - 360 : adj.rotation;

  return (
    <div
      className="absolute top-2 right-2 z-10 w-72 bg-surface border border-rule rounded shadow-lg p-3 space-y-3"
      data-image-adjustments-panel
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink flex items-center gap-1.5">
          <SlidersHorizontal size={14} />
          {t("imageAdjustmentsPanel.title")}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-muted hover:text-ink-soft"
          aria-label={t("imageAdjustmentsPanel.close")}
        >
          <X size={14} />
        </button>
      </div>

      {/* Cor section */}
      <section>
        <h4 className="text-xs font-medium text-ink-muted uppercase mb-1">{t("imageAdjustmentsPanel.color")}</h4>

        {/* Brilho */}
        <div className="flex items-center gap-2 text-xs">
          <label className="w-20 text-ink-soft">{t("imageAdjustmentsPanel.brightness")}</label>
          <input
            type="range"
            min={0}
            max={200}
            step={1}
            value={adj.brightness}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onUpdate({ brightness: v });
            }}
            className="flex-1 accent-rubric"
          />
          <span className="w-10 text-right text-ink-soft tabular-nums">
            {adj.brightness}%
          </span>
          <button
            type="button"
            onClick={() =>
              onUpdate({ brightness: IMAGE_ADJUSTMENTS_DEFAULT.brightness })
            }
            className="text-ink-muted hover:text-ink-soft"
            aria-label={t("imageAdjustmentsPanel.resetBrightness")}
          >
            ×
          </button>
        </div>

        {/* Contraste */}
        <div className="flex items-center gap-2 text-xs">
          <label className="w-20 text-ink-soft">{t("imageAdjustmentsPanel.contrast")}</label>
          <input
            type="range"
            min={0}
            max={200}
            step={1}
            value={adj.contrast}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onUpdate({ contrast: v });
            }}
            className="flex-1 accent-rubric"
          />
          <span className="w-10 text-right text-ink-soft tabular-nums">
            {adj.contrast}%
          </span>
          <button
            type="button"
            onClick={() =>
              onUpdate({ contrast: IMAGE_ADJUSTMENTS_DEFAULT.contrast })
            }
            className="text-ink-muted hover:text-ink-soft"
            aria-label={t("imageAdjustmentsPanel.resetContrast")}
          >
            ×
          </button>
        </div>

        {/* Saturação */}
        <div className="flex items-center gap-2 text-xs">
          <label className="w-20 text-ink-soft">{t("imageAdjustmentsPanel.saturation")}</label>
          <input
            type="range"
            min={0}
            max={200}
            step={1}
            value={adj.saturation}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onUpdate({ saturation: v });
            }}
            className="flex-1 accent-rubric"
          />
          <span className="w-10 text-right text-ink-soft tabular-nums">
            {adj.saturation}%
          </span>
          <button
            type="button"
            onClick={() =>
              onUpdate({ saturation: IMAGE_ADJUSTMENTS_DEFAULT.saturation })
            }
            className="text-ink-muted hover:text-ink-soft"
            aria-label={t("imageAdjustmentsPanel.resetSaturation")}
          >
            ×
          </button>
        </div>

        {/* Grayscale */}
        <div className="flex items-center gap-2 text-xs">
          <label className="w-20 text-ink-soft">{t("imageAdjustmentsPanel.grayscale")}</label>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={adj.grayscale}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onUpdate({ grayscale: v });
            }}
            className="flex-1 accent-rubric"
          />
          <span className="w-10 text-right text-ink-soft tabular-nums">
            {adj.grayscale}%
          </span>
          <button
            type="button"
            onClick={() =>
              onUpdate({ grayscale: IMAGE_ADJUSTMENTS_DEFAULT.grayscale })
            }
            className="text-ink-muted hover:text-ink-soft"
            aria-label={t("imageAdjustmentsPanel.resetGrayscale")}
          >
            ×
          </button>
        </div>

        {/* Negativo */}
        <label className="flex items-center gap-2 text-xs text-ink-soft mt-1">
          <input
            type="checkbox"
            checked={adj.invert}
            onChange={(e) => onUpdate({ invert: e.target.checked })}
            className="w-4 h-4 accent-rubric"
          />
          {t("imageAdjustmentsPanel.negative")}
        </label>
      </section>

      {/* Geometria section */}
      <section>
        <h4 className="text-xs font-medium text-ink-muted uppercase mb-1">
          {t("imageAdjustmentsPanel.geometry")}
        </h4>

        {/* Girar — slider signed [-180, 180]° (centro = 0) + input numérico
            + reset rotation (D-01). Display é signed; armazenamento é [0, 360). */}
        <div className="flex items-center gap-2 text-xs">
          <label className="w-20 text-ink-soft" htmlFor="rotation-slider">
            {t("imageAdjustmentsPanel.rotate")}
          </label>
          <input
            id="rotation-slider"
            type="range"
            min={-180}
            max={180}
            step={1}
            value={displayRotation}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onUpdate({ rotation: normalizeRotation(v) });
            }}
            className="flex-1 accent-rubric"
          />
          <input
            type="number"
            min={-180}
            max={180}
            step={0.1}
            value={displayRotation}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onUpdate({ rotation: normalizeRotation(v) });
            }}
            className="w-14 px-1 py-0.5 text-right text-ink-soft border border-rule rounded tabular-nums"
            aria-label={t("imageAdjustmentsPanel.angleInDegrees")}
          />
          <span className="text-ink-soft">°</span>
          <button
            type="button"
            onClick={() => onUpdate({ rotation: 0 })}
            className="text-ink-muted hover:text-ink-soft"
            aria-label={t("imageAdjustmentsPanel.resetRotation")}
            title={t("imageAdjustmentsPanel.resetRotationTitle")}
          >
            ×
          </button>
        </div>

        {/* Presets ±90° — incrementam (D-06), não substituem */}
        <div className="flex items-center gap-2 text-xs mt-1">
          <span className="w-20 text-ink-muted text-[10px] uppercase">
            {t("imageAdjustmentsPanel.presets")}
          </span>
          <button
            type="button"
            onClick={() => rotate(-90)}
            className="px-2 py-1 border border-rule rounded hover:bg-ink-wash flex items-center gap-1"
            aria-label={t("imageAdjustmentsPanel.rotateCounterclockwise")}
            title={t("imageAdjustmentsPanel.rotateCounterclockwiseTitle")}
          >
            <RotateCcw size={12} />
            <span>-90°</span>
          </button>
          <button
            type="button"
            onClick={() => rotate(90)}
            className="px-2 py-1 border border-rule rounded hover:bg-ink-wash flex items-center gap-1"
            aria-label={t("imageAdjustmentsPanel.rotateClockwise")}
            title={t("imageAdjustmentsPanel.rotateClockwiseTitle")}
          >
            <RotateCw size={12} />
            <span>+90°</span>
          </button>
        </div>

        <label className="flex items-center gap-2 text-xs text-ink-soft mt-1">
          <input
            type="checkbox"
            checked={adj.flipH}
            onChange={(e) => onUpdate({ flipH: e.target.checked })}
            className="w-4 h-4 accent-rubric"
          />
          {t("imageAdjustmentsPanel.flipHorizontal")}
        </label>

        <label className="flex items-center gap-2 text-xs text-ink-soft">
          <input
            type="checkbox"
            checked={adj.flipV}
            onChange={(e) => onUpdate({ flipV: e.target.checked })}
            className="w-4 h-4 accent-rubric"
          />
          {t("imageAdjustmentsPanel.flipVertical")}
        </label>
      </section>

      {/* Reset button */}
      <button
        type="button"
        onClick={() => onUpdate({ ...IMAGE_ADJUSTMENTS_DEFAULT })}
        disabled={isDefault}
        className="w-full px-2 py-1.5 text-xs bg-parchment-deep hover:bg-ink-wash border border-rule rounded disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t("imageAdjustmentsPanel.resetAdjustments")}
      </button>
    </div>
  );
}

export default ImageAdjustmentsPanel;
