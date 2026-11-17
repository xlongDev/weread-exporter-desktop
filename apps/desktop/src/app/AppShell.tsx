import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TaskDock } from "../features/tasks/TaskDock";
import { useNav } from "../stores/nav";

/** 应用壳（液态玻璃模块化）：环境光晕之上悬浮三块玻璃模块——侧栏轨道 / 画布纸 / 任务舱 */
export function AppShell({ children }: { children: ReactNode }) {
  const page = useNav((s) => s.page);
  return (
    <div className="relative h-full">
      <div aria-hidden="true" className="ambient absolute inset-0" />
      <div className="relative flex h-full gap-3 p-3">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <main className="glass min-h-0 flex-1 overflow-hidden rounded-[22px]">
            <div className="h-full overflow-y-auto">
              <div
                key={page}
                data-tauri-drag-region
                className="anim-page mx-auto flex max-w-[1080px] flex-col px-6 pt-8 pb-12"
              >
                {children}
              </div>
            </div>
          </main>
          <TaskDock />
        </div>
      </div>
    </div>
  );
}
