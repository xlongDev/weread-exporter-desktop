import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BookOpen, LibraryBig, Settings2 } from "lucide-react";
import { useNav, type Page } from "../stores/nav";
import { useAuth, type AuthStatus } from "../stores/auth";

const NAV: { key: Page; label: string; icon: typeof BookOpen }[] = [
  { key: "export", label: "导出书籍", icon: BookOpen },
  { key: "library", label: "书库", icon: LibraryBig },
  { key: "settings", label: "设置", icon: Settings2 },
];

const AUTH_STATUS_LABEL: Record<AuthStatus, string> = {
  unknown: "检查中…",
  checking: "检查中…",
  in: "已登录",
  out: "未登录",
};

/** Open plane 侧栏：纸面同色 + 1px hairline，活动项灰 pill（docs/09 §4）。
 *  底部：登录状态行（登录入口在「导出书籍」页首横幅）+ 版本号 */
export function Sidebar() {
  const page = useNav((s) => s.page);
  const goto = useNav((s) => s.goto);
  const authStatus = useAuth((s) => s.status);
  const [version, setVersion] = useState("");

  useEffect(() => {
    void getVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <aside className="glass flex w-[232px] flex-none flex-col rounded-[22px]">
      <div data-tauri-drag-region className="flex h-11 flex-none items-center px-4 pt-1">
        <TrafficLights />
      </div>

      <div data-tauri-drag-region className="flex items-center gap-2.5 px-5 pb-2">
        <Monogram />
        <div data-tauri-drag-region className="flex flex-col gap-0.5">
          <span data-tauri-drag-region className="font-serif text-[17px] leading-tight text-ink">
            WeRead Exporter
          </span>
          <span data-tauri-drag-region className="text-xs text-muted">微信读书电子书导出</span>
        </div>
      </div>

      <nav className="mt-4 flex flex-col gap-0.5 px-3" aria-label="主导航">
        {NAV.map(({ key, label, icon: Icon }) => {
          const active = page === key;
          return (
            <button
              key={key}
              onClick={() => goto(key)}
              aria-current={active ? "page" : undefined}
              className={`flex h-8 items-center gap-2.5 rounded-full px-3 text-sm transition-colors ${
                active ? "bg-raised text-ink" : "text-muted hover:bg-raised/60 hover:text-ink"
              }`}
            >
              <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 border-t border-rule px-5 pt-3 pb-4">
        <p className="flex items-center gap-2 text-xs text-muted" role="status">
          <span
            aria-hidden="true"
            className={`size-1.5 flex-none rounded-full ${authStatus === "in" ? "bg-positive" : "bg-faint"}`}
          />
          微信读书账号 · {AUTH_STATUS_LABEL[authStatus]}
        </p>
        <span className="tnum text-xs text-faint">{version && `v${version}`}</span>
      </div>
    </aside>
  );
}

/** 自绘 macOS 红绿灯（decorations:false）：关闭走 CloseGuard 拦截流程，绿色为最大化切换。
 *  窗口句柄在点击时才取 —— 渲染期不依赖 Tauri internals */
function TrafficLights() {
  const dot =
    "size-3 rounded-full shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.18)] transition-[filter] hover:brightness-95";
  return (
    <div className="flex items-center gap-2">
      <button
        aria-label="关闭窗口"
        onClick={() => void getCurrentWindow().close()}
        className={`${dot} bg-[#ff5f57]`}
      />
      <button
        aria-label="最小化窗口"
        onClick={() => void getCurrentWindow().minimize()}
        className={`${dot} bg-[#febc2e]`}
      />
      <button
        aria-label="最大化窗口"
        onClick={() => void getCurrentWindow().toggleMaximize()}
        className={`${dot} bg-[#28c840]`}
      />
    </div>
  );
}

/** 产品标：三册书脊立在搁板上（与空态书脊同一视觉语言），单色随文字色 */
function Monogram() {
  return (
    <svg width="26" height="24" viewBox="0 0 26 24" fill="none" aria-hidden="true" className="flex-none text-ink">
      <rect x="1.5" y="1.5" width="6" height="19.5" rx="1.25" fill="currentColor" />
      <rect x="10.25" y="4.5" width="5.5" height="16.5" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
      <rect x="19" y="6.5" width="5" height="14.5" rx="1.25" fill="currentColor" />
      <path d="M0.75 22.2H25.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
