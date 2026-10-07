import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Ambiente padrão "node" (testes existentes). Testes de componente declaram
// `// @vitest-environment jsdom` na primeira linha do arquivo.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
  },
});
