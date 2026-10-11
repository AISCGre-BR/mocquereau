import { describe, expect, it } from "vitest";
import { isSuggestionsMode, readSuggestionsMode } from "./suggestions-mode";

describe("suggestionsMode", () => {
  it("modo gravado vence; suggestionsEnabled false antigo vira off; nada = sequential", () => {
    expect(readSuggestionsMode({ suggestionsMode: "candidates", suggestionsEnabled: false })).toBe("candidates");
    expect(readSuggestionsMode({ suggestionsEnabled: false })).toBe("off");
    expect(readSuggestionsMode({ suggestionsEnabled: true })).toBe("sequential");
    expect(readSuggestionsMode({})).toBe("sequential");
    expect(readSuggestionsMode({ suggestionsMode: "auto" })).toBe("sequential");
  });
  it("isSuggestionsMode só aceita os três", () => {
    expect(["sequential", "candidates", "off", "on", 1, null].map(isSuggestionsMode)).toEqual([true, true, true, false, false, false]);
  });
});
