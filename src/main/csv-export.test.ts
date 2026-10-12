import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({ dialog: {}, ipcMain: { handle: vi.fn() } }));
vi.mock("./i18n", () => ({ t: (k: string) => (k === "main.csv.rawSuffix" ? "neumas" : k === "main.csv.totalsSuffix" ? "totais" : k) }));

import { csvTargets, saveCsvFiles } from "./csv-export";

const payload = { title: "Resurrexi", raw: "a", totals: "b" };

describe("saveCsvFiles", () => {
  it("cancelar devolve null sem gravar", async () => {
    const write = vi.fn();
    expect(await saveCsvFiles(payload, async () => null, write)).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });

  it("grava os dois arquivos e devolve os caminhos", async () => {
    const write = vi.fn(async () => {});
    expect(await saveCsvFiles(payload, async () => "/x/R.csv", write)).toEqual({ files: ["/x/R-neumas.csv", "/x/R-totais.csv"] });
    expect(write).toHaveBeenCalledWith("/x/R-neumas.csv", "a");
  });

  it("erro de gravação não parece cancelamento: rejeita", async () => {
    const write = vi.fn(async () => { throw new Error("EACCES"); });
    await expect(saveCsvFiles(payload, async () => "/x/R.csv", write)).rejects.toThrow("EACCES");
  });
});

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
