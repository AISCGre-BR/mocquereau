import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf-8");

describe("styles.css", () => {
  const css = read("./styles.css");

  it("importa Tailwind, o tema e os componentes do Parchment (componentes na camada components)", () => {
    expect(css).toContain('@import "tailwindcss";');
    expect(css).toContain('@import "parchment-design/tailwind/parchment-theme.css";');
    expect(css).toContain('@import "parchment-design/components.css" layer(components);');
  });

  it("não tem cores literais", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/);
  });

  it("aponta as famílias do Parchment para as fontes variáveis embutidas", () => {
    expect(css).toContain('--font-sans: "Source Sans 3 Variable"');
    expect(css).toContain('--font-serif: "Source Serif 4 Variable"');
  });
});

describe("main.tsx", () => {
  it("importa as fontes embutidas (sem rede)", () => {
    const main = read("./main.tsx");
    expect(main).toContain('import "@fontsource-variable/source-sans-3/wght.css";');
    expect(main).toContain('import "@fontsource-variable/source-serif-4/wght.css";');
    expect(main).toContain('import "@fontsource-variable/source-serif-4/wght-italic.css";');
  });
});
