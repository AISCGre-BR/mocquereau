// src/renderer/components/recortes/ImagePanel.tsx
//
// "Imagem ▾" popover of the Recortes toolbar: orientation (90° turns, mirror,
// tilt) and light/colour of the active page. Controlled: the adjustments live
// in the project (UPDATE_LINE_ADJUSTMENTS); the panel only reports changes.

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FlipHorizontal, RotateCcw, RotateCw, ScanLine } from "lucide-react";
import type { ImageAdjustments } from "../../lib/models";
import { IMAGE_ADJUSTMENTS_DEFAULT } from "../../lib/image-adjustments";
import { rotateQuarter, splitRotation, withFine } from "../../lib/canvas-rotation";
import { Button } from "../../ui/Button";

/** Tilt range around the nearest quarter turn, in degrees. */
export const TILT_MIN = -45;
export const TILT_MAX = 45;

export interface ImagePanelProps {
  adjustments?: ImageAdjustments;
  onUpdate: (partial: Partial<ImageAdjustments>) => void;
  onReset: () => void;
  /** Absent when the source has no other page. */
  onApplyToOtherPages?: () => void;
  onClose: () => void;
  /** The button that opened the panel: a click on it is not "outside". */
  anchor?: HTMLElement | null;
}

export function ImagePanel({ adjustments, onUpdate, onReset, onApplyToOtherPages, onClose, anchor }: ImagePanelProps) {
  const { t, i18n } = useTranslation();
  const adj = adjustments ?? IMAGE_ADJUSTMENTS_DEFAULT;
  const ref = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    function onPointerDown(e: Event) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchor?.contains(target)) return;
      onCloseRef.current();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCloseRef.current();
      anchor?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [anchor]);

  const tilt = splitRotation(adj.rotation).fine;
  const degrees = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t("imagePanel.title")}
      data-image-panel
      className="absolute top-full left-0 z-[120] mt-2 flex w-[340px] flex-col gap-3.5 rounded-lg bg-surface-high p-4 text-ink shadow-elev-3 ring-1 ring-rule-soft"
    >
      <h3 className="text-label font-semibold">{t("imagePanel.orientation")}</h3>
      <div className="grid grid-cols-4 gap-1.5">
        <Tile icon={<RotateCcw />} label={t("imagePanel.rotateLeft")} onClick={() => onUpdate({ rotation: rotateQuarter(adj.rotation, -1) })} />
        <Tile icon={<RotateCw />} label={t("imagePanel.rotateRight")} onClick={() => onUpdate({ rotation: rotateQuarter(adj.rotation, 1) })} />
        <Tile icon={<FlipHorizontal />} label={t("imagePanel.flip")} pressed={adj.flipH} onClick={() => onUpdate({ flipH: !adj.flipH })} />
        {/* Sem endireitar automático: o botão leva à Inclinação. */}
        <Tile icon={<ScanLine />} label={t("imagePanel.straighten")} onClick={() => tiltRef.current?.focus()} />
      </div>
      <Row label={t("imagePanel.tilt")} value={`${degrees.format(tilt)}°`}>
        <div className="relative flex items-center">
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 h-2.5 w-px -translate-y-1/2 bg-rule-strong" />
          <input
            ref={tiltRef}
            type="range"
            min={TILT_MIN}
            max={TILT_MAX}
            step={0.1}
            value={Math.max(TILT_MIN, Math.min(TILT_MAX, tilt))}
            aria-label={t("imagePanel.tilt")}
            className="relative w-full accent-rubric"
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onUpdate({ rotation: withFine(adj.rotation, v) });
            }}
          />
        </div>
      </Row>

      <hr className="border-0 border-t border-rule-soft" />

      <h3 className="text-label font-semibold">{t("imagePanel.lightAndColor")}</h3>
      {(["brightness", "contrast", "saturation"] as const).map((key) => (
        <Row key={key} label={t(`imagePanel.${key}`)} value={`${adj[key]}%`}>
          <input
            type="range"
            min={0}
            max={200}
            step={1}
            value={adj[key]}
            aria-label={t(`imagePanel.${key}`)}
            className="w-full accent-rubric"
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onUpdate({ [key]: v });
            }}
          />
        </Row>
      ))}
      <SwitchRow label={t("imagePanel.grayscale")} checked={adj.grayscale > 0} onChange={(on) => onUpdate({ grayscale: on ? 100 : 0 })} />
      <SwitchRow label={t("imagePanel.invert")} checked={adj.invert} onChange={(on) => onUpdate({ invert: on })} />

      <hr className="border-0 border-t border-rule-soft" />

      <div className="flex items-center justify-between">
        <Button className="px-2 text-rubric" onClick={onReset}>
          {t("imagePanel.reset")}
        </Button>
        <Button className="px-2 text-rubric" disabled={!onApplyToOtherPages} onClick={onApplyToOtherPages}>
          {t("imagePanel.applyToOtherPages")}
        </Button>
      </div>
    </div>
  );
}

function Tile({ icon, label, pressed, onClick }: { icon: ReactNode; label: string; pressed?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={[
        "flex flex-col items-center gap-1.5 rounded-md px-1 pt-2.5 pb-2 text-center text-caption font-medium shadow-elev-1 ring-1 ring-rule-soft [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:stroke-[1.75]",
        pressed ? "bg-rubric-wash text-rubric" : "bg-linear-to-b from-surface-high to-surface text-ink-soft hover:bg-ink-wash",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)_44px] items-center gap-2.5 text-label text-ink-soft">
      <span>{label}</span>
      {children}
      <span className="text-right text-ink-muted tabular-nums">{value}</span>
    </div>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)_44px] items-center gap-2.5 text-label text-ink-soft">
      <span>{label}</span>
      <span />
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={[
          "relative h-[18px] w-[30px] justify-self-end rounded-full ring-1 transition-colors",
          checked ? "bg-rubric ring-rubric" : "bg-parchment-deep shadow-inset ring-rule-strong",
        ].join(" ")}
      >
        <span
          aria-hidden="true"
          className={[
            "absolute top-[2px] h-[14px] w-[14px] rounded-full bg-surface-high shadow-elev-1 transition-[left]",
            checked ? "left-[14px]" : "left-[2px]",
          ].join(" ")}
        />
      </button>
    </div>
  );
}
