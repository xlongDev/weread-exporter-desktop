import { useEffect } from "react";
import { AppShell } from "./app/AppShell";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Tasks } from "./features/tasks/Tasks";
import { Library } from "./features/library/Library";
import { Settings } from "./features/settings/Settings";
import { useNav } from "./stores/nav";
import { applyTheme, watchSystemTheme } from "./stores/theme";
import { useSettings } from "./stores/settings";
import { useEngine, initEngineListener } from "./stores/engine";

function CurrentPage() {
  const page = useNav((s) => s.page);
  switch (page) {
    case "dashboard":
      return <Dashboard />;
    case "tasks":
      return <Tasks />;
    case "library":
      return <Library />;
    case "settings":
      return <Settings />;
  }
}

export default function App() {
  // 启动时：引擎握手 + 订阅引擎事件流
  useEffect(() => {
    void useEngine.getState().refresh();
    void initEngineListener();
  }, []);

  // 系统主题变化时按当前模式重算（mode=system 需要）
  useEffect(
    () =>
      watchSystemTheme(() => {
        const mode = useSettings.getState().settings?.["general.theme"];
        applyTheme(typeof mode === "string" ? (mode as "system" | "light" | "dark") : "system");
      }),
    [],
  );

  return (
    <AppShell>
      <CurrentPage />
    </AppShell>
  );
}
