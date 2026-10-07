// src/renderer/lib/image-store.ts
//
// imageId -> blob URL cache (spec 4.1). Blob URLs never enter project state;
// components will ask urlOf(imageId) from wave B on. Wave A2: ready, unused.
import type { ImageBytesPayload } from "@shared/project-schema";

export type ImageFetcher = (imageIds: string[]) => Promise<ImageBytesPayload[]>;

export interface ObjectUrlApi {
  create(blob: Blob): string;
  revoke(url: string): void;
}

const browserUrls: ObjectUrlApi = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
};

interface Entry {
  blob: Blob;
  url: string;
}

export class ImageStore {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<void>>();
  private generation = 0;

  constructor(
    private readonly fetcher: ImageFetcher,
    private readonly urls: ObjectUrlApi = browserUrls,
  ) {}

  has(imageId: string): boolean {
    return this.entries.has(imageId);
  }

  urlOf(imageId: string): string | undefined {
    return this.entries.get(imageId)?.url;
  }

  blobOf(imageId: string): Blob | undefined {
    return this.entries.get(imageId)?.blob;
  }

  adopt(imageId: string, mimeType: string, bytes: ArrayBuffer): string {
    const existing = this.entries.get(imageId);
    if (existing) return existing.url;
    const blob = new Blob([bytes], { type: mimeType });
    const url = this.urls.create(blob);
    this.entries.set(imageId, { blob, url });
    return url;
  }

  /** Loads every id not cached yet; resolves to the ids still missing afterwards. */
  async ensure(imageIds: string[]): Promise<string[]> {
    const wanted = [...new Set(imageIds)].filter((id) => !this.entries.has(id));
    const toFetch = wanted.filter((id) => !this.inflight.has(id));
    if (toFetch.length > 0) {
      const generation = this.generation;
      const request: Promise<void> = this.fetcher(toFetch)
        .then((list) => {
          if (generation !== this.generation) return;
          for (const img of list) this.adopt(img.imageId, img.mimeType, img.bytes);
        })
        .finally(() => {
          for (const id of toFetch) if (this.inflight.get(id) === request) this.inflight.delete(id);
        });
      for (const id of toFetch) this.inflight.set(id, request);
    }
    await Promise.all(wanted.map((id) => this.inflight.get(id)));
    return wanted.filter((id) => !this.entries.has(id));
  }

  revokeAll(): void {
    this.generation++;
    for (const entry of this.entries.values()) this.urls.revoke(entry.url);
    this.entries.clear();
    this.inflight.clear();
  }
}

let shared: ImageStore | null = null;

export function getImageStore(): ImageStore {
  if (!shared) shared = new ImageStore((ids) => window.mocquereau.getImages(ids));
  return shared;
}
