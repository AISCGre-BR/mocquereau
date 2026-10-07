import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Ambiente padrão "node" (testes existentes). Testes de componente declaram
// `// @vitest-environment jsdom` na primeira linha do arquivo.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Agent worktrees under .claude/ carry their own copy of src/ and would
    // otherwise be collected (with @shared pointing at this tree).
    exclude: [...configDefaults.exclude, ".claude/**", "out/**"],
  },
});
