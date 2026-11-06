import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { useNav } from "../stores/nav";

/** 应用壳：Open plane —— 侧栏 + 内容画布（24px gutter，顶部 32px 起） */
export function AppShell({ children }: { children: ReactNode }) {
  const page = useNav((s) => s.page);
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div key={page} className="anim-page mx-auto flex max-w-[1200px] flex-col px-6 pt-8 pb-12">
          {children}
        </div>
      </main>
    </div>
  );
}
