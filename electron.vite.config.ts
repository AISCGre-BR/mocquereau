import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// src/shared is importable from main, preload and renderer (no Electron, no DOM).
const sharedAlias = {
  "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
};

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    plugins: [
      externalizeDepsPlugin({
        exclude: ["docx", "electron-conf"],
      }),
    ],
  },
  preload: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: { alias: sharedAlias },
    plugins: [react(), tailwindcss()],
  },
});
