import { useEffect } from "react";
import { AppShell } from "./app/AppShell";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Export } from "./features/export/Export";
import { Tasks } from "./features/tasks/Tasks";
import { Library } from "./features/library/Library";
import { Settings } from "./features/settings/Settings";
import { useNav } from "./stores/nav";
import { applyTheme, watchSystemTheme } from "./stores/theme";
import { useSettings } from "./stores/settings";
import { useEngine, initEngineListener } from "./stores/engine";
import { useAuth, initAuthListener } from "./stores/auth";
import { CloseGuard } from "./features/close/CloseGuard";

function CurrentPage() {
  const page = useNav((s) => s.page);
  switch (page) {
    case "dashboard":
      return <Dashboard />;
    case "export":
      return <Export />;
    case "tasks":
      return <Tasks />;
    case "library":
      return <Library />;
    case "settings":
      return <Settings />;
  }
}

export default function App() {
  // 启动时：引擎握手 + 事件流订阅 + 登录态检查
  useEffect(() => {
    void useEngine.getState().refresh();
    void initEngineListener();
    void initAuthListener().then(() => useAuth.getState().check());
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
    <>
      <AppShell>
        <CurrentPage />
      </AppShell>
      <CloseGuard />
    </>
  );
}
