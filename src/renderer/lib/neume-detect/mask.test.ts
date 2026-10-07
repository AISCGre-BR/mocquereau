import { describe, expect, it } from 'vitest';
import { darkBlobs } from './mask';
import { deriveParams } from './scale';
import type { GrayImage } from './types';

describe('darkBlobs', () => {
  it('marca mancha larga e escura (com margem) e ignora traco fino de neuma', () => {
    const w = 120;
    const h = 80;
    const data = new Uint8Array(w * h).fill(210);
    for (let y = 10; y < 70; y++) for (let x = 10; x < 13; x++) data[y * w + x] = 30; // traco 3 px
    for (let y = 20; y < 45; y++) for (let x = 60; x < 85; x++) data[y * w + x] = 20; // mancha 25 px
    const gray: GrayImage = { data, width: w, height: h };
    const m = darkBlobs(gray, null, deriveParams(3));
    expect(m.data[32 * w + 72]).toBe(1);
    expect(m.data[32 * w + 58]).toBe(1); // margem de ceil(u) = 3 px
    expect(m.data[32 * w + 54]).toBe(0);
    for (let y = 0; y < h; y++) expect(m.data[y * w + 11]).toBe(0);
  });
});
