/// <reference path="../preload/index.d.ts" />
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/source-sans-3/wght.css";
import "@fontsource-variable/source-serif-4/wght.css";
import "@fontsource-variable/source-serif-4/wght-italic.css";
import "./styles.css";
import "./i18n";
import { App } from "./App";

// scripts/smoke-worker.mjs: o main carrega ?smoke=worker so com MOCQUEREAU_SMOKE=worker.
if (new URLSearchParams(location.search).get("smoke") === "worker") {
  void import("./smoke").then(async ({ runWorkerSmoke }) => {
    document.title = await runWorkerSmoke();
  });
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
