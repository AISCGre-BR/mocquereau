export interface ThumbnailAdjustments {
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
}

/** Rotação em quartos de volta (0..3), ignorando a inclinação fina. */
function quarterTurns(rotation = 0): number {
  return ((Math.round(rotation / 90) % 4) + 4) % 4;
}

/**
 * Miniatura JPEG (lado maior = maxSide) de uma imagem em data URL, com a rotação
 * (múltiplos de 90) e os espelhamentos da página; undefined se vazia ou falhar.
 */
export async function makeThumbnail(
  dataUrl: string,
  maxSide = 480,
  adj?: ThumbnailAdjustments,
): Promise<string | undefined> {
  if (!dataUrl) return undefined;
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const turns = quarterTurns(adj?.rotation);
    const canvas = document.createElement("canvas");
    canvas.width = turns % 2 ? h : w;
    canvas.height = turns % 2 ? w : h;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((turns * Math.PI) / 2);
      ctx.scale(adj?.flipH ? -1 : 1, adj?.flipV ? -1 : 1);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    }
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return undefined;
  }
}
