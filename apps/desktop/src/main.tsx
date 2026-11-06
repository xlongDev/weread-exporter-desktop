import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { api } from "./services/api";
import { applyTheme, type ThemeMode } from "./stores/theme";
import "./styles/index.css";

async function boot() {
  // 首帧前应用主题，避免闪白
  try {
    const settings = await api.settings();
    applyTheme((settings["general.theme"] as ThemeMode) ?? "system");
  } catch {
    applyTheme("system");
  }
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void boot();
