import { useEffect, useState } from "react";
import { ChevronUp, ListChecks, X } from "lucide-react";
import { api, toAppError } from "../../services/api";
import { useTasks } from "../../stores/tasks";
import { Button } from "../../components/Button";
import { useT } from "../../i18n";
import { BookCover } from "../../components/BookCover";
import { Dialog } from "../../components/Dialog";
import { FORMAT_LABEL, TaskList, fmtProgress, stageLabel } from "./TaskList";

/**
 * 常驻任务 dock（IA 收缩后任务中心的载体）：
 * 底部一条折叠栏（正在执行 / 排队 / 历史入口），点开弹出完整任务面板。
 * 无任何任务记录时整个 dock 不渲染 —— 空态诚实。
 */
export function TaskDock() {
  const { tasks, loadError, load } = useTasks();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const active = tasks.filter((t) => t.status === "running" || t.status === "waiting");
  const running = tasks.find((t) => t.status === "running") ?? null;
  const waitingCount = active.length - (running ? 1 : 0);
  const finishedCount = tasks.length - active.length;
  const clearable = finishedCount;

  if (tasks.length === 0 && !loadError) return null;

  async function clearFinished() {
    try {
      await api.clearFinishedTasks();
      setConfirmClear(false);
      setClearError(null);
      await load();
    } catch (e) {
      setClearError(toAppError(e).userMessage);
    }
  }

  return (
    <div className="relative flex-none">
      {open && (
        <div
          className="fixed inset-0 z-40"
          role="presentation"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        />
      )}

      {open && (
        <div
          id="task-dock-panel"
          role="dialog"
          aria-label={t("任务面板")}
          className="anim-dialog glass absolute right-3 bottom-full z-50 mb-2 flex max-h-[60vh] w-[640px] flex-col rounded-[20px]"
        >
          <header className="flex h-11 flex-none items-center justify-between border-b border-rule px-4">
            <h2 className="text-sm font-semibold text-ink">{t("任务")}</h2>
            <div className="flex items-center gap-1">
              {clearable > 0 && (
                <Button variant="ghost" onClick={() => setConfirmClear(true)}>
                  {t("清除记录")}
                </Button>
              )}
              <Button
                variant="ghost"
                aria-label={t("关闭任务面板")}
                onClick={() => setOpen(false)}
              >
                <X size={14} strokeWidth={1.5} aria-hidden="true" />
              </Button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
            {clearError && <p className="py-1 text-xs text-negative-text">{clearError}</p>}
            {loadError ? (
              <p className="py-2 text-sm text-negative-text">
                {t("任务列表读取失败：{msg}", { msg: loadError })}
                <button className="ml-2 underline" onClick={() => void load()}>
                  {t("重试")}
                </button>
              </p>
            ) : (
              <TaskList tasks={tasks} onChanged={() => void load()} />
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="task-dock-panel"
        title={open ? t("收起任务面板") : t("查看任务面板")}
        className="glass flex h-11 w-full items-center gap-3 rounded-full px-5 text-left"
      >
        {running ? (
          <>
            <BookCover path={running.cover_path} title={running.title || running.book_id} width={20} />
            <span className="max-w-[220px] truncate text-sm">{running.title || running.book_id}</span>
            <span className="flex-none text-xs text-faint">
              {FORMAT_LABEL[running.format] ?? running.format}
            </span>
            <span className="h-1.5 w-24 flex-none overflow-hidden rounded-full bg-raised">
              <span
                className="block h-full rounded-full bg-data transition-[width] duration-300"
                style={{ width: `${Math.max(2, running.progress)}%` }}
              />
            </span>
            <span className="tnum min-w-0 flex-1 truncate text-xs text-muted">
              {stageLabel(running.current_stage) || t("执行中")}
              {running.progress > 0 && ` ${fmtProgress(running.progress)}%`}
            </span>
            {waitingCount > 0 && (
              <span className="tnum flex-none text-xs text-faint">{t("排队 {n}", { n: waitingCount })}</span>
            )}
          </>
        ) : active.length > 0 ? (
          <>
            <BookCover
              path={active[0].cover_path}
              title={active[0].title || active[0].book_id}
              width={20}
            />
            <span className="max-w-[220px] truncate text-sm">
              {active[0].title || active[0].book_id}
            </span>
            <span className="flex-none text-xs text-faint">
              {FORMAT_LABEL[active[0].format] ?? active[0].format}
            </span>
            <span className="tnum min-w-0 flex-1 truncate text-xs text-muted">
              {t("排队等待中 · 共 {n} 个任务（同一时刻执行一个抓取任务）", { n: active.length })}
            </span>
          </>
        ) : (
          <>
            <ListChecks size={15} strokeWidth={1.5} className="flex-none text-muted" aria-hidden="true" />
            <span className="tnum text-sm text-muted">
              {loadError ? t("任务记录读取失败") : t("任务记录 {n}", { n: finishedCount })}
            </span>
            <span className="min-w-0 flex-1" />
          </>
        )}
        <ChevronUp
          size={14}
          strokeWidth={1.5}
          aria-hidden="true"
          className={`flex-none text-faint transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {confirmClear && (
        <Dialog
          title={t("清除已结束的任务记录？")}
          onClose={() => setConfirmClear(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                {t("取消")}
              </Button>
              <Button onClick={() => void clearFinished()}>{t("清除")}</Button>
            </>
          }
        >
          <p className="tnum">
            {t("将删除 {n} 条已完成 / 已取消 / 已失败的任务记录（进行中与排队中的不受影响）。", { n: clearable })}
          </p>
          <p className="text-xs text-faint">{t("已导出的文件与书库记录不会被删除。")}</p>
        </Dialog>
      )}
    </div>
  );
}
