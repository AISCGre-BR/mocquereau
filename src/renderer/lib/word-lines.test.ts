import { describe, expect, it } from "vitest";
import { wordLines } from "./word-lines";

describe("wordLines", () => {
  it("maps words to non-empty raw lines, skipping letterless tokens", () => {
    const raw = "Glória in excélsis Deo\n\nEt in terra pax — *\n3 Laudámus te";
    expect(wordLines(raw, 10)).toEqual([[0, 1, 2, 3], [4, 5, 6, 7], [8, 9]]);
  });
  it("falls back to one line when counts disagree", () => {
    expect(wordLines("a b\nc", 2)).toEqual([[0, 1]]);
  });
});
