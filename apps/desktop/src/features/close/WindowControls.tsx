import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Windows 右上矩形 caption 三钮（decorations:false）：关闭走 CloseGuard 拦截流程。
 *  窗口句柄在点击时才取 —— 渲染期不依赖 Tauri internals（与 macOS 红绿灯同一纪律） */
export function WindowControls() {
  const btn =
    "flex h-9 w-11 items-center justify-center text-faint transition-colors hover:bg-raised hover:text-ink";
  return (
    <div className="flex items-center">
      <button aria-label="最小化窗口" onClick={() => void getCurrentWindow().minimize()} className={btn}>
        <Minus size={13} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button aria-label="最大化窗口" onClick={() => void getCurrentWindow().toggleMaximize()} className={btn}>
        <Square size={11} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button
        aria-label="关闭窗口"
        onClick={() => void getCurrentWindow().close()}
        className={`${btn} hover:bg-[#e81123] hover:text-white`}
      >
        <X size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}
