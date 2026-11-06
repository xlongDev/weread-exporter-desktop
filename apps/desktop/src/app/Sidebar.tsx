import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { House, BookOpen, ListChecks, LibraryBig, Settings2 } from "lucide-react";
import { useNav, type Page } from "../stores/nav";

const NAV: { key: Page; label: string; icon: typeof House }[] = [
  { key: "dashboard", label: "总览", icon: House },
  { key: "export", label: "导出书籍", icon: BookOpen },
  { key: "tasks", label: "任务中心", icon: ListChecks },
  { key: "library", label: "书库", icon: LibraryBig },
  { key: "settings", label: "设置", icon: Settings2 },
];

/** Open plane 侧栏：纸面同色 + 1px hairline，活动项灰 pill（docs/09 §4） */
export function Sidebar() {
  const page = useNav((s) => s.page);
  const goto = useNav((s) => s.goto);
  const [version, setVersion] = useState("");

  useEffect(() => {
    void getVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <aside className="flex w-[232px] flex-none flex-col border-r border-line bg-ground">
      <div className="flex flex-col gap-0.5 px-5 pt-6 pb-2">
        <span className="font-serif text-[17px] leading-tight text-ink">WeRead Exporter</span>
        <span className="text-xs text-muted">微信读书电子书导出</span>
      </div>

      <nav className="mt-4 flex flex-col gap-0.5 px-3" aria-label="主导航">
        {NAV.map(({ key, label, icon: Icon }) => {
          const active = page === key;
          return (
            <button
              key={key}
              onClick={() => goto(key)}
              aria-current={active ? "page" : undefined}
              className={`flex h-8 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors ${
                active ? "bg-raised text-ink" : "text-muted hover:bg-raised/60 hover:text-ink"
              }`}
            >
              <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-5 pb-4">
        <span className="tnum text-xs text-faint">{version && `v${version}`}</span>
      </div>
    </aside>
  );
}
