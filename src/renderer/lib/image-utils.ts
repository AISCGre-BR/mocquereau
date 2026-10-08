import type { StoredImage } from "./models";

/**
 * Converts a File object to a StoredImage by reading it via FileReader
 * and measuring dimensions via an Image element.
 */
export async function fileToDataUrl(file: File): Promise<StoredImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () =>
        resolve({
          dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight,
          mimeType: file.type || "image/png",
        });
      img.onerror = reject;
      img.src = dataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Resizes a StoredImage to at most maxWidth pixels wide using canvas drawImage.
 *
 * Returns the original image unchanged if its width is already within the limit.
 *
 * IMPORTANT (D-07): This function must NOT be called without explicit user consent.
 * The caller (useAddPage, through ResizeImageDialog) is responsible for showing the resize warning and only
 * invoking this after the user confirms.
 *
 * @param image    The source StoredImage (data URL + dimensions)
 * @param maxWidth Maximum output width in pixels (default: 2000)
 */
export async function resizeImageIfNeeded(
  image: StoredImage,
  maxWidth = 2000,
): Promise<StoredImage> {
  if (image.width <= maxWidth) {
    return image;
  }

  const scale = maxWidth / image.width;
  const canvas = document.createElement("canvas");
  canvas.width = maxWidth;
  canvas.height = Math.round(image.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context");

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // quality 0.92 applies to JPEG/WEBP; PNG ignores it (lossless)
      const resized = canvas.toDataURL(image.mimeType, 0.92);
      resolve({
        dataUrl: resized,
        width: canvas.width,
        height: canvas.height,
        mimeType: image.mimeType,
      });
    };
    img.onerror = reject;
    img.src = image.dataUrl;
  });
}
