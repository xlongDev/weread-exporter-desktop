import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BookOpen, LibraryBig, PanelLeftClose, PanelLeftOpen, Settings2 } from "lucide-react";
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

const COLLAPSE_KEY = "wr.sidebar.collapsed";

/** Open plane 侧栏（液态玻璃轨道）：可折叠为图标轨。
 *  折叠动画 = 宽度 300ms 过渡 + 标签淡出；⌘B / Ctrl+B 切换；状态记入 localStorage。 */
export function Sidebar() {
  const page = useNav((s) => s.page);
  const goto = useNav((s) => s.goto);
  const authStatus = useAuth((s) => s.status);
  const [version, setVersion] = useState("");
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");

  useEffect(() => {
    void getVersion().then(setVersion).catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((v) => {
      localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      return !v;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const labelMotion = `overflow-hidden whitespace-nowrap transition-all duration-200 ${
    collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
  }`;

  return (
    <aside
      className={`glass relative flex flex-none flex-col overflow-hidden rounded-[22px] transition-[width] duration-300 ease-out ${
        collapsed ? "w-[72px]" : "w-[232px]"
      }`}
    >
      {/* 红绿灯行（拖拽区） */}
      <div
        data-tauri-drag-region
        className={`flex h-11 flex-none items-center px-4 ${collapsed ? "justify-center" : "justify-start"}`}
      >
        <TrafficLights />
      </div>

      {/* 标志行（拖拽区） */}
      <div
        data-tauri-drag-region
        className={`flex flex-none items-center px-5 pb-2 ${collapsed ? "justify-center" : "gap-2.5"}`}
      >
        <Monogram />
        <div
          data-tauri-drag-region
          className={labelMotion}
        >
          <span
            data-tauri-drag-region
            className="block whitespace-nowrap font-serif text-[17px] leading-tight text-ink"
          >
            WeRead Exporter
          </span>
          <span data-tauri-drag-region className="block whitespace-nowrap text-xs text-muted">
            微信读书电子书导出
          </span>
        </div>
      </div>

    {/* 导航 */}
    <nav className="flex flex-col gap-0.5 px-3" aria-label="主导航">
        {NAV.map(({ key, label, icon: Icon }) => {
          const active = page === key;
          return (
            <button
              key={key}
              onClick={() => goto(key)}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              title={collapsed ? label : undefined}
              className={`flex h-8 items-center rounded-full text-sm transition-[background-color,color,width] duration-200 ${
                collapsed ? "w-9 justify-center self-center" : "w-full gap-2.5 px-3"
              } ${active ? "bg-raised text-ink" : "text-muted hover:bg-raised/60 hover:text-ink"}`}
            >
              <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className={labelMotion}>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* 底部状态 */}
      <div className="mt-auto flex flex-none flex-col gap-2 border-t border-rule px-5 pt-3 pb-4">
        <p
          className={`flex items-center text-xs text-muted ${collapsed ? "justify-center" : "gap-2"}`}
          role="status"
        >
          <span
            aria-hidden="true"
            className={`size-1.5 flex-none rounded-full ${authStatus === "in" ? "bg-positive" : "bg-faint"}`}
          />
          <span className={labelMotion}>微信读书账号 · {AUTH_STATUS_LABEL[authStatus]}</span>
        </p>
        <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
          <span className={`tnum text-xs text-faint ${labelMotion}`}>{version && `v${version}`}</span>
          <button
            onClick={toggle}
            aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
            title={collapsed ? "展开侧栏 (⌘B)" : "折叠侧栏 (⌘B)"}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-faint transition-colors hover:bg-raised hover:text-ink"
          >
            {collapsed ? (
              <PanelLeftOpen size={15} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={15} strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
        </div>
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
