/** Miniatura JPEG (lado maior = maxSide) de uma imagem em data URL; undefined se vazia ou falhar. */
export async function makeThumbnail(dataUrl: string, maxSide = 480): Promise<string | undefined> {
  if (!dataUrl) return undefined;
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return undefined;
  }
}
