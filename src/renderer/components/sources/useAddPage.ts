// src/renderer/components/sources/useAddPage.ts
//
// One path for every way a page enters a source (button, Ctrl+V, dropped file):
// images wider than 2000 px ask first whether to resize, the folio hint of an
// import is consumed, and the range continues after the last confirmed page.

import { useRef, useState } from "react";
import { useProject } from "../../hooks/useProject";
import { fileToDataUrl, resizeImageIfNeeded } from "../../lib/image-utils";
import { appendLineConsumingFolioHint } from "../../lib/tableUtils";
import { suggestRangeForNewPage } from "../../lib/sources";
import type { ManuscriptLine, StoredImage } from "../../lib/models";

export const MAX_IMAGE_WIDTH = 2000;

type RawImage = { dataUrl: string; width: number; height: number; mimeType?: string };

export interface AddPage {
  /** Opens the image file dialog (main process) and adds the chosen image. */
  openFile(sourceId: string): Promise<void>;
  /** Reads an image from the clipboard (main process); nothing happens without one. */
  paste(sourceId: string): Promise<void>;
  dropFile(sourceId: string, file: File): Promise<void>;
  /** Image waiting for the resize answer, or null. */
  resizeCandidate: StoredImage | null;
  resolveResize(answer: "resize" | "keep" | "cancel"): Promise<void>;
}

function mimeOf(raw: RawImage): string {
  return raw.mimeType || raw.dataUrl.split(";")[0].split(":")[1] || "image/png";
}

export function useAddPage(onAdded: (sourceId: string, lineId: string) => void): AddPage {
  const { state, dispatch } = useProject();
  // Reads after an await see the project as it is then, not as it was on click.
  const projectRef = useRef(state.project);
  projectRef.current = state.project;
  const [pending, setPending] = useState<{ image: StoredImage; sourceId: string } | null>(null);

  function apply(sourceId: string, image: StoredImage) {
    const project = projectRef.current;
    const source = project?.sources.find((s) => s.id === sourceId);
    if (!project || !source) return;
    const total = project.text.words.reduce((n, w) => n + w.syllables.length, 0);
    const line: ManuscriptLine = {
      id: crypto.randomUUID(),
      image,
      syllableRange: suggestRangeForNewPage(source, total),
      dividers: [],
      syllableBoxes: {},
      gaps: [],
      confirmed: false,
    };
    dispatch({ type: "UPDATE_SOURCE", payload: appendLineConsumingFolioHint(source, line) });
    onAdded(sourceId, line.id);
  }

  function add(sourceId: string, raw: RawImage | null | undefined) {
    if (!raw) return;
    const image: StoredImage = { dataUrl: raw.dataUrl, width: raw.width, height: raw.height, mimeType: mimeOf(raw) };
    if (image.width > MAX_IMAGE_WIDTH) setPending({ image, sourceId });
    else apply(sourceId, image);
  }

  return {
    async openFile(sourceId) {
      add(sourceId, await window.mocquereau.openImageFile());
    },
    async paste(sourceId) {
      add(sourceId, await window.mocquereau.readClipboardImage());
    },
    async dropFile(sourceId, file) {
      if (!file.type.startsWith("image/")) return;
      add(sourceId, await fileToDataUrl(file));
    },
    resizeCandidate: pending?.image ?? null,
    async resolveResize(answer) {
      if (!pending) return;
      setPending(null);
      if (answer === "cancel") return;
      apply(pending.sourceId, answer === "resize" ? await resizeImageIfNeeded(pending.image, MAX_IMAGE_WIDTH) : pending.image);
    },
  };
}
