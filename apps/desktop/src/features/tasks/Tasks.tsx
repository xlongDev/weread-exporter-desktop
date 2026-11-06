import { useEffect, useState } from "react";
import { Check, FolderOpen, Minus, X } from "lucide-react";
import { api, toAppError } from "../../services/api";
import { useTasks } from "../../stores/tasks";
import type { TaskDetail, TaskRow } from "../../types";
import { Button } from "../../components/Button";
import { BookCover } from "../../components/BookCover";
import { Drawer } from "../../components/Drawer";
import { StatusPill, type PillTone } from "../../components/StatusPill";

const STATUS_LABEL: Record<TaskRow["status"], string> = {
  waiting: "等待中",
  running: "执行中",
  completed: "已完成",
  cancelled: "已取消",
  failed: "失败",
};

const STATUS_TONE: Record<TaskRow["status"], PillTone> = {
  waiting: "neutral",
  running: "warning",
  completed: "positive",
  cancelled: "neutral",
  failed: "negative",
};

const FORMAT_LABEL: Record<string, string> = {
  pdf: "PDF",
  epub: "EPUB",
  markdown: "Markdown",
};

/** 任务中心：真实进度、取消与输出定位（docs/04 §4.3） */
export function Tasks() {
  const { tasks, loadError, load } = useTasks();
  const [detailId, setDetailId] = useState<number | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-ink">任务中心</h1>

      {loadError && (
        <p className="text-sm text-negative-text">
          任务列表读取失败：{loadError}
          <button className="ml-2 underline" onClick={() => void load()}>
            重试
          </button>
        </p>
      )}

      {tasks.length === 0 ? (
        <p className="py-2 text-sm text-faint">
          暂无任务。在「导出书籍」中创建导出任务后会出现在这里。
        </p>
      ) : (
        <ul className="flex flex-col">
          {tasks.map((t) => (
            <TaskItem key={t.id} task={t} onOpen={() => setDetailId(t.id)} />
          ))}
        </ul>
      )}

      {detailId !== null && (
        <TaskDetailDrawer
          taskId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}

function TaskItem({ task, onOpen }: { task: TaskRow; onOpen: () => void }) {
  const [, setTick] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (task.status !== "running" && task.status !== "waiting") return;
    const timer = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [task.status]);

  async function cancel() {
    try {
      await api.cancelTask(task.id);
      setActionError(null);
    } catch (e) {
      setActionError(toAppError(e).userMessage);
    }
  }

  async function reveal() {
    try {
      await api.revealTaskDir(task.id);
      setActionError(null);
    } catch (e) {
      setActionError(toAppError(e).userMessage);
    }
  }

  return (
    <li className="flex gap-4 border-b border-rule py-4 last:border-b-0">
      <button
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-4 text-left"
        aria-label={`查看任务详情：${task.title || task.book_id}`}
      >
        <BookCover path={task.cover_path} title={task.title || task.book_id} width={56} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{task.title || task.book_id}</span>
            <span className="text-xs text-faint">{FORMAT_LABEL[task.format] ?? task.format}</span>
            <StatusPill tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</StatusPill>
          </div>

          {task.status === "running" && (
            <>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full bg-data transition-[width] duration-300"
                  style={{ width: `${Math.max(2, task.progress)}%` }}
                />
              </div>
              <p className="tnum text-xs text-muted">
                {stageLabel(task.current_stage)}
                {task.current_chapter && ` · ${task.current_chapter}`}
                {task.chapters_done > 0 && ` · 已完成 ${task.chapters_done} 章`}
                {task.pages_done > 0 && ` · ${task.pages_done} 页`}
                {task.words_done > 0 && ` · ${formatWords(task.words_done)}`}
                {` · 已用时 ${elapsedText(task.started_at, null)}`}
              </p>
            </>
          )}
          {task.status === "waiting" && (
            <p className="tnum text-xs text-muted">排队等待中（同一时刻执行一个抓取任务）</p>
          )}
          {task.status === "failed" && (
            <p className="text-xs text-negative-text">
              {task.error_message ?? "任务失败"}
              {task.error_code && `（${task.error_code}）`}
            </p>
          )}
          {task.status === "completed" && (
            <p className="tnum text-xs text-muted">
              输出目录：{task.output_dir} · {elapsedText(task.started_at, task.finished_at)}
            </p>
          )}
          {actionError && <p className="text-xs text-negative-text">{actionError}</p>}
        </div>
      </button>

      <div className="flex flex-none items-center gap-1.5">
        {(task.status === "running" || task.status === "waiting") && (
          <Button variant="ghost" onClick={() => void cancel()} aria-label="取消任务">
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
            取消
          </Button>
        )}
        {task.status === "completed" && (
          <Button variant="ghost" onClick={() => void reveal()} aria-label="打开输出文件夹">
            <FolderOpen size={14} strokeWidth={1.5} aria-hidden="true" />
            文件夹
          </Button>
        )}
      </div>
    </li>
  );
}

/** 任务详情抽屉：章节级进度（断点续导依据）、日志与续导入口 */
function TaskDetailDrawer({
  taskId,
  onClose,
  onChanged,
}: {
  taskId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getTaskDetail(taskId)
      .then(setDetail)
      .catch((e) => setError(toAppError(e).userMessage));
  }, [taskId]);

  async function resume(kind: "resume" | "retry") {
    if (!detail) return;
    try {
      await api.createTask(detail.book_id, detail.format, undefined, detail.id);
      setActionError(null);
      onClose();
      onChanged();
    } catch (e) {
      setActionError(toAppError(e).userMessage);
    }
    void kind;
  }

  async function revealLog() {
    try {
      await api.revealTaskLog(taskId);
    } catch (e) {
      setActionError(toAppError(e).userMessage);
    }
  }

  async function revealDir() {
    try {
      await api.revealTaskDir(taskId);
    } catch (e) {
      setActionError(toAppError(e).userMessage);
    }
  }

  const resumable = detail && (detail.status === "failed" || detail.status === "cancelled");

  return (
    <Drawer
      title="任务详情"
      onClose={onClose}
      footer={
        resumable && detail ? (
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={() => void resume(detail.status === "failed" ? "retry" : "resume")}
            >
              {detail.status === "failed" ? "重试任务" : "继续导出"}
            </Button>
            <p className="text-xs text-faint">新任务会复用已落盘的章节，从断点之后继续。</p>
          </div>
        ) : undefined
      }
    >
      {!detail && !error && <p className="text-sm text-faint">读取中…</p>}
      {error && <p className="text-sm text-negative-text">{error}</p>}
      {detail && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <BookCover path={detail.cover_path} title={detail.title || detail.book_id} width={56} />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-sm font-medium">{detail.title || detail.book_id}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-faint">{FORMAT_LABEL[detail.format] ?? detail.format}</span>
                <StatusPill tone={STATUS_TONE[detail.status]}>{STATUS_LABEL[detail.status]}</StatusPill>
              </div>
            </div>
          </div>

          <dl className="flex flex-col gap-2 text-sm">
            <DetailRow label="阶段">{stageLabel(detail.current_stage) || "—"}</DetailRow>
            <DetailRow label="当前章节">{detail.current_chapter || "—"}</DetailRow>
            <DetailRow label="进度">
              {detail.chapters_done > 0 ? `${detail.chapters_done} 章` : "—"}
              {detail.pages_done > 0 && ` · ${detail.pages_done} 页`}
              {detail.words_done > 0 && ` · ${formatWords(detail.words_done)}`}
            </DetailRow>
            <DetailRow label="已耗时">{elapsedText(detail.started_at, detail.finished_at)}</DetailRow>
            <DetailRow label="输出目录">
              <span className="selectable break-all">{detail.output_dir}</span>
            </DetailRow>
            {detail.status === "failed" && (
              <DetailRow label="失败原因">
                <span className="text-negative">{detail.error_message ?? "—"}</span>
                {detail.error_code && <span className="text-faint">（{detail.error_code}）</span>}
              </DetailRow>
            )}
          </dl>

          {detail.chapters.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">章节进度（断点依据）</span>
              <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-card bg-[var(--well)] p-3">
                {detail.chapters.map((c) => (
                  <li key={c.chapter_idx} className="flex items-center gap-2 text-xs">
                    {c.status === "done" ? (
                      <Check size={12} strokeWidth={2} className="flex-none text-positive" aria-label="已完成" />
                    ) : c.status === "failed" ? (
                      <X size={12} strokeWidth={2} className="flex-none text-negative" aria-label="失败" />
                    ) : (
                      <Minus size={12} strokeWidth={2} className="flex-none text-faint" aria-label="待处理" />
                    )}
                    <span className="truncate text-muted">{c.title || `章节 ${c.chapter_idx}`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {actionError && <p className="text-sm text-negative-text">{actionError}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => void revealLog()}>
              任务日志
            </Button>
            {detail.status === "completed" && (
              <Button onClick={() => void revealDir()}>打开文件夹</Button>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-16 flex-none text-muted">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    auth: "等待登录",
    metadata: "读取书籍信息",
    crawl: "抓取正文",
    images: "下载插图",
    render: "生成文件",
  };
  return map[stage] ?? stage;
}

function formatWords(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(1)} 万字` : `${n} 字`;
}

function elapsedText(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return "—";
  const start = Date.parse(startedAt.endsWith("Z") ? startedAt : `${startedAt}Z`);
  const end = finishedAt ? Date.parse(finishedAt.endsWith("Z") ? finishedAt : `${finishedAt}Z`) : Date.now();
  if (Number.isNaN(start)) return "—";
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}
