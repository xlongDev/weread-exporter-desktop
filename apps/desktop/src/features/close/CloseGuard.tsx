import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Dialog } from "../../components/Dialog";
import { Button } from "../../components/Button";

/** 任务运行时的关闭保护（docs/05 F8）：拦截关闭 → 用户确认 → 强制收尾退出 */
export function CloseGuard() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const un = listen("app://close-requested", () => setOpen(true));
    return () => {
      void un.then((fn) => fn());
    };
  }, []);

  if (!open) return null;

  return (
    <Dialog
      title="导出正在进行，确定关闭吗？"
      onClose={() => setOpen(false)}
      actions={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            继续等待任务
          </Button>
          <Button
            className="text-negative hover:bg-[var(--pill-negative-bg)]"
            onClick={() => void invoke("force_close")}
          >
            中断任务并关闭
          </Button>
        </>
      }
    >
      <p>关闭会中断正在执行的导出任务。已抓取的内容不会丢失，重新打开应用后可从断点继续导出。</p>
    </Dialog>
  );
}
