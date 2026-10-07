import { describe, it, expect } from "vitest";
import { PIGMENTS, pigmentOf } from "./pigment";

describe("pigmentOf", () => {
  it("segue o ciclo do Parchment a partir da sílaba 0", () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => pigmentOf(i))).toEqual([
      "sc-pig-lapis",
      "sc-pig-orpiment",
      "sc-pig-verdigris",
      "sc-pig-minium",
      "sc-pig-murex",
      "sc-pig-malachite",
    ]);
  });

  it("repete o ciclo a cada 6 sílabas", () => {
    expect(pigmentOf(6)).toBe("sc-pig-lapis");
    expect(pigmentOf(13)).toBe("sc-pig-orpiment");
  });

  it("é estável e vizinhos nunca repetem o pigmento", () => {
    for (let i = 0; i < 60; i++) {
      expect(pigmentOf(i)).toBe(pigmentOf(i));
      expect(pigmentOf(i)).not.toBe(pigmentOf(i + 1));
    }
  });

  it("trata índices negativos, fracionários e NaN sem lançar", () => {
    expect(pigmentOf(-1)).toBe("sc-pig-malachite");
    expect(pigmentOf(2.7)).toBe("sc-pig-verdigris");
    expect(pigmentOf(Number.NaN)).toBe("sc-pig-lapis");
  });

  it("expõe os seis pigmentos na ordem do ciclo", () => {
    expect(PIGMENTS).toEqual(["lapis", "orpiment", "verdigris", "minium", "murex", "malachite"]);
  });
});
