import { describe, expect, it } from "vitest";
import { bestPageLine, buildRecentMeta, firstPageImage, sourceProgress } from "./recent-meta";
import { createNewProject } from "../hooks/useProject";

const line = (boxes: Record<number, unknown>, dataUrl = "data:image/png;base64,AA") => ({
  id: crypto.randomUUID(), image: { dataUrl, width: 10, height: 10, mimeType: "image/png" },
  syllableRange: { start: 0, end: 3 }, dividers: [], gaps: [], syllableBoxes: boxes, confirmed: false,
});
const box = { x: 0, y: 0, w: 0.1, h: 0.1 };

describe("sourceProgress", () => {
  it("counts distinct syllables with a box or an explicit gap across pages", () => {
    const s: any = { lines: [line({ 0: box, 1: null }), line({ 0: box, 2: box })] };
    expect(sourceProgress(s, 4)).toBe(0.75);
  });
  it("is 0 without syllables or pages", () => {
    expect(sourceProgress({ lines: [] } as any, 4)).toBe(0);
    expect(sourceProgress({ lines: [line({ 0: box })] } as any, 0)).toBe(0);
  });
});

describe("buildRecentMeta / firstPageImage", () => {
  it("builds title, author, date and per-source progress", () => {
    const p: any = createNewProject("Gloria VIII", "André Gaby");
    p.text.words = [{ original: "Glo", syllables: ["Glo", "ri", "a", "x"] }];
    p.sources = [{ id: "s", order: 1, metadata: { siglum: "P", library: "", city: "", century: "", classes: [null, null, null] }, lines: [line({ 0: box })], syllableCuts: {} }];
    const m = buildRecentMeta(p, "data:image/jpeg;base64,T");
    expect(m).toEqual({ title: "Gloria VIII", author: "André Gaby", updatedAt: p.meta.updatedAt, thumb: "data:image/jpeg;base64,T", sources: [{ siglum: "P", progress: 0.25 }] });
  });
  it("skips sources whose pages have no image", () => {
    const p: any = createNewProject("T", "");
    p.sources = [
      { lines: [line({}, "")] },
      { lines: [line({}, "data:image/png;base64,BB")] },
    ];
    expect(firstPageImage(p)).toBe("data:image/png;base64,BB");
    expect(firstPageImage(createNewProject("T", "") as any)).toBe("");
  });
});

describe("bestPageLine", () => {
  const sized = (w: number, h: number, dataUrl: string, adj?: object) => ({
    ...line({}, dataUrl), image: { dataUrl, width: w, height: h, mimeType: "image/png" }, imageAdjustments: adj,
  });
  const proj = (...sources: any[][]): any => ({ sources: sources.map((lines) => ({ lines })) });

  it("prefers the largest pixel area over a smaller first page, across sources", () => {
    const p = proj([sized(100, 100, "A")], [sized(300, 200, "B"), sized(200, 200, "C")]);
    expect(bestPageLine(p)?.image.dataUrl).toBe("B");
  });
  it("keeps the earliest page on ties", () => {
    expect(bestPageLine(proj([sized(10, 10, "A"), sized(10, 10, "B")]))?.image.dataUrl).toBe("A");
  });
  it("returns the chosen line so its own adjustments apply", () => {
    const p = proj([sized(100, 100, "A", { rotation: 0 })], [sized(500, 500, "B", { rotation: 90, flipH: true })]);
    expect(bestPageLine(p)?.imageAdjustments).toEqual({ rotation: 90, flipH: true });
  });
  it("skips empty images and returns undefined when there are none", () => {
    expect(bestPageLine(proj([sized(900, 900, "")]))).toBeUndefined();
    expect(bestPageLine(proj([sized(100, 100, ""), sized(5, 5, "Z")]))?.image.dataUrl).toBe("Z");
    expect(bestPageLine(proj())).toBeUndefined();
  });
});
