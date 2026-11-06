import { useEffect, useState } from "react";
import { FolderOpen, X } from "lucide-react";
import { api, toAppError } from "../../services/api";
import { useTasks } from "../../stores/tasks";
import type { TaskRow } from "../../types";
import { Button } from "../../components/Button";
import { BookCover } from "../../components/BookCover";
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

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-ink">任务中心</h1>

      {loadError && (
        <p className="text-sm text-negative">
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
            <TaskItem key={t.id} task={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskItem({ task }: { task: TaskRow }) {
  const [, setTick] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  // 执行中任务每秒刷新已耗时显示
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
          <p className="text-xs text-negative">
            {task.error_message ?? "任务失败"}
            {task.error_code && `（${task.error_code}）`}
          </p>
        )}
        {task.status === "completed" && (
          <p className="tnum text-xs text-muted">
            输出目录：{task.output_dir} · {elapsedText(task.started_at, task.finished_at)}
          </p>
        )}
        {actionError && <p className="text-xs text-negative">{actionError}</p>}
      </div>

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
