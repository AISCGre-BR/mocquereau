import { describe, it, expect } from "vitest";
import { csvTargets } from "./csv-export";

describe("csvTargets", () => {
  it("tira .csv e acrescenta os sufixos", () => {
    expect(csvTargets("/x/Resurrexi.csv", "neumas", "totais")).toEqual({
      raw: "/x/Resurrexi-neumas.csv",
      totals: "/x/Resurrexi-totais.csv",
    });
  });

  it("funciona sem extensão e ignora maiúsculas em .CSV", () => {
    expect(csvTargets("/x/Resurrexi", "neumes", "totals").raw).toBe("/x/Resurrexi-neumes.csv");
    expect(csvTargets("/x/Resurrexi.CSV", "neumes", "totals").totals).toBe("/x/Resurrexi-totals.csv");
  });
});
