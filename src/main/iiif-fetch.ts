import { ipcMain, clipboard, dialog, nativeImage } from "electron";
import { net } from "electron";
import { readFile } from "node:fs/promises";

const MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  tiff: "image/tiff",
  tif: "image/tiff",
};

export async function fetchIiifImage(
  rawUrl: string
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const manifestUrl = rawUrl.split("#")[0];
    const fragment = new URL(rawUrl).hash;

    // Extract canvas index from fragment, e.g. #p=canvas/5 or #canvas=2
    const fragMatch = fragment.match(/canvas[=/](\d+)/i);
    const canvasIndex = fragMatch ? parseInt(fragMatch[1], 10) : 0;

    const manifestRes = await net.fetch(manifestUrl, {
      headers: { Accept: "application/json, application/ld+json" },
    });
    if (!manifestRes.ok) return null;

    const manifest = await manifestRes.json() as Record<string, unknown>;

    let imageUrl: string | undefined;

    // Detect IIIF v3 vs v2 by @context
    const context = manifest["@context"];
    const isV3 =
      typeof context === "string"
        ? context.includes("presentation/3")
        : Array.isArray(context) &&
          context.some(
            (c: unknown) => typeof c === "string" && c.includes("presentation/3")
          );

    if (isV3) {
      // v3: manifest.items[canvasIndex].items[0].items[0].body.id
      const items = manifest["items"] as Array<Record<string, unknown>> | undefined;
      const canvas = items?.[canvasIndex];
      const annotationPages = canvas?.["items"] as Array<Record<string, unknown>> | undefined;
      const annotations = annotationPages?.[0]?.["items"] as Array<Record<string, unknown>> | undefined;
      const body = annotations?.[0]?.["body"] as Record<string, unknown> | undefined;
      imageUrl = body?.["id"] as string | undefined;
    } else {
      // v2: manifest.sequences[0].canvases[canvasIndex].images[0].resource.@id
      const sequences = manifest["sequences"] as Array<Record<string, unknown>> | undefined;
      const canvases = sequences?.[0]?.["canvases"] as Array<Record<string, unknown>> | undefined;
      const canvas = canvases?.[canvasIndex];
      const images = canvas?.["images"] as Array<Record<string, unknown>> | undefined;
      const resource = images?.[0]?.["resource"] as Record<string, unknown> | undefined;
      imageUrl = resource?.["@id"] as string | undefined;
    }

    if (!imageUrl) return null;

    const imgRes = await net.fetch(imageUrl);
    if (!imgRes.ok) return null;

    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Derive MIME from Content-Type header or URL extension
    const contentType = imgRes.headers.get("content-type") || "";
    let mimeType = contentType.split(";")[0].trim();
    if (!mimeType || mimeType === "application/octet-stream") {
      const ext = imageUrl.split(".").pop()?.toLowerCase() ?? "";
      mimeType = MIME_MAP[ext] ?? "image/jpeg";
    }

    const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    const size = nativeImage.createFromBuffer(buffer).getSize();

    return { dataUrl, width: size.width, height: size.height };
  } catch {
    return null;
  }
}

export function registerImageHandlers(): void {
  ipcMain.handle("image:fetch-iiif", async (_event, url: string) => {
    return fetchIiifImage(url);
  });

  ipcMain.handle("image:read-clipboard", async () => {
    try {
      const image = clipboard.readImage();
      if (image.isEmpty()) return null;
      return { dataUrl: image.toDataURL(), ...image.getSize() };
    } catch {
      return null;
    }
  });

  ipcMain.handle("image:open-file", async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Carregar imagem",
        filters: [
          {
            name: "Imagens",
            extensions: ["png", "jpg", "jpeg", "webp", "tiff", "tif"],
          },
        ],
        properties: ["openFile"],
      });

      if (canceled || !filePaths[0]) return null;

      const buffer = await readFile(filePaths[0]);
      const ext = filePaths[0].split(".").pop()?.toLowerCase() ?? "";
      const mimeType = MIME_MAP[ext] ?? "image/jpeg";
      const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
      const size = nativeImage.createFromBuffer(buffer).getSize();

      return { dataUrl, width: size.width, height: size.height };
    } catch {
      return null;
    }
  });
}
