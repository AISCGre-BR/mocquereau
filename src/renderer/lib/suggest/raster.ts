// src/renderer/lib/suggest/raster.ts
//
// Input raster of the neume detector in the page's visual geometry (rotation and
// flips applied, cropped to a region, at most MAX_LONG_SIDE). The transform is pure
// and derived from originalToView; renderSuggestRaster is the only DOM part.

import { originalToView, viewSize, type Size } from "@shared/box-frame";
import type { BoxFrame } from "@shared/project-schema";
import { MAX_LONG_SIDE } from "../neume-detect";
import type { FracRect, RasterRGBA } from "../neume-detect";

type Matrix = [number, number, number, number, number, number];

/** Canvas matrix (setTransform a,b,c,d,e,f): original pixel -> view pixel, cropped to `region` and scaled. */
export function viewRasterTransform(img: Size, frame: BoxFrame, region: FracRect, scale: number): Matrix {
  const v = viewSize(img, frame);
  const o = originalToView({ x: 0, y: 0 }, img, frame);
  const ex = originalToView({ x: 1, y: 0 }, img, frame);
  const ey = originalToView({ x: 0, y: 1 }, img, frame);
  return [
    (ex.x - o.x) * scale,
    (ex.y - o.y) * scale,
    (ey.x - o.x) * scale,
    (ey.y - o.y) * scale,
    (o.x - region.x * v.width) * scale,
    (o.y - region.y * v.height) * scale,
  ];
}

/** Raster size: the region of the view in px times scale, scale = min(1, MAX_LONG_SIDE / longest side). */
export function rasterSize(img: Size, frame: BoxFrame, region: FracRect): { width: number; height: number; scale: number } {
  const v = viewSize(img, frame);
  const rw = region.w * v.width;
  const rh = region.h * v.height;
  const scale = Math.min(1, MAX_LONG_SIDE / Math.max(rw, rh));
  return { width: Math.max(1, Math.round(rw * scale)), height: Math.max(1, Math.round(rh * scale)), scale };
}

/** DOM: draws the image with no colour filters (brightness/contrast/invert do not apply); outside pixels stay alpha 0. */
export function renderSuggestRaster(imgEl: CanvasImageSource, img: Size, frame: BoxFrame, region: FracRect): RasterRGBA {
  const { width, height, scale } = rasterSize(img, frame, region);
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.setTransform(...viewRasterTransform(img, frame, region, scale));
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(imgEl, 0, 0);
  const data = ctx.getImageData(0, 0, width, height);
  return { data: data.data, width, height };
}
