// Maps the flat word list produced by syllabifyText back to the non-empty
// lines of the raw text. Mirrors syllabifyText's token rule: split on
// whitespace, keep only tokens that contain at least one letter.
const LETTER_RE = /\p{L}/u;

export function wordLines(raw: string, wordCount: number): number[][] {
  const lines: number[][] = [];
  let next = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const count = line.trim().split(/\s+/).filter((t) => LETTER_RE.test(t)).length;
    const indices: number[] = [];
    for (let i = 0; i < count; i++) indices.push(next++);
    lines.push(indices);
  }
  if (next !== wordCount) {
    return [Array.from({ length: wordCount }, (_, i) => i)];
  }
  return lines;
}
