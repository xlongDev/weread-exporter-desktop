import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { api } from "./services/api";
import { applyTheme, type ThemeMode } from "./stores/theme";
import { IS_WINDOWS } from "./app/platform";
import "./styles/index.css";

// Windows：壳圆角对齐 Win11 DWM 自动 8px（Win10 由 UA 不可分辨，直角实心降级待真机验收）
if (IS_WINDOWS) document.documentElement.dataset.platform = "windows";

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
