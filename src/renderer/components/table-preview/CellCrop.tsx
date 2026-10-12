// src/renderer/components/table-preview/CellCrop.tsx
//
// The crop of one cell, by CSS only: the box region of the page image fills the parent.
// Shared by the Tabela cells (and their hover preview) and the Análise occurrences.

import type { ImageAdjustments, StoredImage, SyllableBox } from '../../lib/models';
import { buildImageFilter, buildImageTransform, normalizeRotation } from '../../lib/image-adjustments';

export interface CellCropProps {
  image: StoredImage;
  box: SyllableBox;
  adjustments?: ImageAdjustments;
}

// Phase 12 (UX revisão): box vive em fração do AABB do retângulo da imagem
// ROTACIONADA. Para mostrar a região do box ocupando toda a célula:
//  1. Um div interno (AABB-div) com tamanho = 100/box.w × 100/box.h da célula,
//     deslocado por -box.x, -box.y.
//  2. Dentro dele, a `<img>` é centralizada e escalada para que seu AABB
//     rotacionado coincida com o AABB-div. Rotation/flip via CSS transform.
export function CellCrop({ image, box, adjustments }: CellCropProps) {
  const imgFilter = buildImageFilter(adjustments);
  const imgTransform = buildImageTransform(adjustments);
  const rot = adjustments?.rotation ?? 0;
  const θ = (normalizeRotation(rot) * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(θ));
  const absSin = Math.abs(Math.sin(θ));
  const imgRatio = image.height / image.width;
  const imgWidthPct = 100 / (absCos + imgRatio * absSin);
  const imgHeightPct = (100 * imgRatio) / (absSin + imgRatio * absCos);

  return (
    <div className="w-full h-full overflow-hidden relative">
      <div
        className="absolute"
        style={{
          width: `${100 / box.w}%`,
          height: `${100 / box.h}%`,
          left: `${(-box.x / box.w) * 100}%`,
          top: `${(-box.y / box.h) * 100}%`,
        }}
      >
        <img
          src={image.dataUrl}
          alt=""
          draggable={false}
          className="absolute pointer-events-none"
          style={{
            left: '50%',
            top: '50%',
            width: `${imgWidthPct}%`,
            height: `${imgHeightPct}%`,
            maxWidth: 'none',
            transform: `translate(-50%, -50%) ${imgTransform ?? ''}`.trim(),
            transformOrigin: 'center center',
            filter: imgFilter || undefined,
          }}
        />
      </div>
    </div>
  );
}

/** Width / height of the crop in image pixels (the box is a fraction of the rotated image's AABB). */
export function cropAspect(image: StoredImage, box: SyllableBox, adjustments?: ImageAdjustments): number {
  const θ = (normalizeRotation(adjustments?.rotation ?? 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(θ));
  const s = Math.abs(Math.sin(θ));
  const w = image.width * c + image.height * s;
  const h = image.width * s + image.height * c;
  return (box.w * w) / (box.h * h);
}

/** Whether a filled cell can be drawn: a data URL image and a non-empty box. */
export function cropDrawable(image: StoredImage | undefined, box: SyllableBox): image is StoredImage {
  return !!image && !!image.dataUrl && image.dataUrl.startsWith('data:') && box.w > 0 && box.h > 0;
}
