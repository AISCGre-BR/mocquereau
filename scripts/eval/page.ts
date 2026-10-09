// scripts/eval/page.ts
//
// Browser half of the eval (bundled as an IIFE into headless Chromium): the
// app's own renderSuggestRaster, returned as base64 RGBA (and optionally PNG).

import { loadSuggestImage, renderSuggestRaster } from "../../src/renderer/lib/suggest/raster";
import type { BoxFrame } from "@shared/project-schema";

function toB64(u8: Uint8ClampedArray | Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

(window as unknown as Record<string, unknown>).__evalRaster = async (a: {
  dataUrl: string;
  img: { width: number; height: number };
  frame: BoxFrame;
  region: { x: number; y: number; w: number; h: number };
  png?: boolean;
}) => {
  const el = await loadSuggestImage(a.dataUrl);
  const r = renderSuggestRaster(el, a.img, a.frame, a.region);
  let png: string | undefined;
  if (a.png) {
    const c = Object.assign(document.createElement("canvas"), { width: r.width, height: r.height });
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
    png = c.toDataURL("image/png").split(",")[1];
  }
  return { b64: toB64(r.data), width: r.width, height: r.height, png };
};
