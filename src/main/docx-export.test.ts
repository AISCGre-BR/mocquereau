// src/main/docx-export.test.ts
//
// Unit tests for computeChunkBoundaries (DOCX-07 fix — D-01).
//
// Strategy: target 20 syllables per chunk, respect word boundaries, allow
// extension up to 25 (MAX) for very long words, force cut at MAX-1 as fallback.

import { describe, it, expect } from 'vitest';
import { computeChunkBoundaries } from './docx-export';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build a boundaries array of given length with `true` at specified indices. */
function boundariesAt(len: number, trueIndices: number[]): boolean[] {
  const arr = new Array<boolean>(len).fill(false);
  for (const idx of trueIndices) arr[idx] = true;
  return arr;
}

/** Build a boundaries array of given length where every N-th index is a boundary (0-based). */
function everyNth(len: number, n: number): boolean[] {
  const arr = new Array<boolean>(len).fill(false);
  for (let i = n - 1; i < len; i += n) arr[i] = true;
  return arr;
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('computeChunkBoundaries', () => {
  it('Test 1: 10 syllables (≤ SYLLABLES_PER_CHUNK=20) returns single chunk [0,9]', () => {
    const boundaries = everyNth(10, 3); // arbitrary realistic pattern
    const chunks = computeChunkBoundaries(10, boundaries);
    expect(chunks).toEqual([[0, 9]]);
  });

  it('Test 2: exactly 20 syllables returns single chunk [0,19]', () => {
    const boundaries = everyNth(20, 3);
    const chunks = computeChunkBoundaries(20, boundaries);
    expect(chunks).toEqual([[0, 19]]);
  });

  it('Test 3: 40 syllables with word boundary exactly at idx 19 returns [[0,19],[20,39]]', () => {
    // boundaries at 19 and 39 (so a word ends exactly at the target cut point)
    const boundaries = boundariesAt(40, [5, 12, 19, 25, 32, 39]);
    const chunks = computeChunkBoundaries(40, boundaries);
    expect(chunks).toEqual([
      [0, 19],
      [20, 39],
    ]);
  });

  it('Test 4: if target idx 19 is mid-word, extend forward to next word boundary', () => {
    // wordBoundaries[19]=false, [20]=false, [21]=true
    // target is 19; extend forward through 20, 21 until we find true at 21.
    // First chunk should be [0, 21] (22 syllables).
    // Remaining 18 syllables (22..39) form last chunk.
    const boundaries = boundariesAt(40, [5, 12, 21, 30, 39]);
    const chunks = computeChunkBoundaries(40, boundaries);
    expect(chunks[0]).toEqual([0, 21]);
    expect(chunks[1]).toEqual([22, 39]);
    expect(chunks.length).toBe(2);
  });

  it('Test 5: very long word (no boundary for 25+ syllables) forces cut at MAX-1 (idx 24)', () => {
    // No word boundary in [15, 28]. Must force cut at idx 24 (start=0, MAX=25, so hardLimit = 24).
    // boundaries: only at 14 (before the long word) and 35, 44 (after)
    const boundaries = boundariesAt(45, [14, 35, 44]);
    const chunks = computeChunkBoundaries(45, boundaries);
    // First chunk: target=19, walk forward; no boundary until 35, which exceeds hardLimit=24.
    // So end = 24 (forced mid-word cut), chunk [0,24] (25 syllables — at MAX).
    expect(chunks[0]).toEqual([0, 24]);
    // Second chunk starts at 25; boundary search from target=44, finds 44 → [25, 44]
    expect(chunks[chunks.length - 1][1]).toBe(44);
    // Each chunk length <= MAX_SYLLABLES_PER_CHUNK (25)
    for (const [s, e] of chunks) {
      expect(e - s + 1).toBeLessThanOrEqual(25);
    }
  });

  it('Test 6: 196 syllables (Glória) with realistic boundaries yields 9-12 chunks, each 15-25 (last may be shorter)', () => {
    // Realistic: roughly every 3rd or 4th syllable is a word boundary.
    // Use a pseudo-random but deterministic pattern: boundary every 3 syllables + some variation.
    const len = 196;
    const boundaries = new Array<boolean>(len).fill(false);
    // Primary: every 3rd syllable is end-of-word
    for (let i = 2; i < len; i += 3) boundaries[i] = true;
    // Secondary: every 7th syllable also (to simulate polysyllabic words breaking the rhythm)
    for (let i = 6; i < len; i += 7) boundaries[i] = true;
    // Ensure last index is a boundary (end of text)
    boundaries[len - 1] = true;

    const chunks = computeChunkBoundaries(len, boundaries);

    expect(chunks.length).toBeGreaterThanOrEqual(9);
    expect(chunks.length).toBeLessThanOrEqual(12);

    // Coverage: chunks cover [0, len-1] with no gaps / overlap
    expect(chunks[0][0]).toBe(0);
    expect(chunks[chunks.length - 1][1]).toBe(len - 1);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i][0]).toBe(chunks[i - 1][1] + 1);
    }

    // Each chunk ≤ 25 syllables
    for (const [s, e] of chunks) {
      expect(e - s + 1).toBeLessThanOrEqual(25);
    }
    // Each chunk except possibly the last ≥ 15 syllables
    for (let i = 0; i < chunks.length - 1; i++) {
      const [s, e] = chunks[i];
      expect(e - s + 1).toBeGreaterThanOrEqual(15);
    }
  });

  it('Test 7: empty input returns empty array', () => {
    expect(computeChunkBoundaries(0, [])).toEqual([]);
  });

  // Extra sanity: 21 syllables with boundary only at 20 — should be single chunk [0,20]
  // (remaining=21 > SYLLABLES_PER_CHUNK=20, so enter loop; target=19; walk forward
  //  through 19, 20 → find boundary at 20, end=20; remaining after = 0, exit.)
  it('Sanity: 21 syllables with boundary at idx 20 → single chunk [0,20]', () => {
    const boundaries = boundariesAt(21, [20]);
    const chunks = computeChunkBoundaries(21, boundaries);
    expect(chunks).toEqual([[0, 20]]);
  });
});
