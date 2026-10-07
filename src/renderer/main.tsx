/// <reference path="../preload/index.d.ts" />
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/source-sans-3/wght.css";
import "@fontsource-variable/source-serif-4/wght.css";
import "@fontsource-variable/source-serif-4/wght-italic.css";
import "./styles.css";
import "./i18n";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
