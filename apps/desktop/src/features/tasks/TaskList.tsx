import { useEffect, useMemo, useState } from "react";
import { Check, FolderOpen, Minus, Trash2, X } from "lucide-react";
import { api, toAppError } from "../../services/api";
import type { TaskDetail, TaskRow } from "../../types";
import { Button } from "../../components/Button";
import { BookCover } from "../../components/BookCover";
import { Dialog } from "../../components/Dialog";
import { Drawer } from "../../components/Drawer";
import { StatusPill, type PillTone } from "../../components/StatusPill";

const STATUS_TONE: Record<TaskRow["status"], PillTone> = {
  waiting: "neutral",
  running: "warning",
  completed: "positive",
  cancelled: "neutral",
  failed: "negative",
};

const STATUS_LABEL: Record<TaskRow["status"], string> = {
  waiting: "等待中",
  running: "执行中",
  completed: "已完成",
  cancelled: "已取消",
  failed: "失败",
};

export const FORMAT_LABEL: Record<string, string> = {
  pdf: "PDF",
  epub: "EPUB",
  markdown: "Markdown",
};

export function stageLabel(stage: string): string {
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

/** current_chapter 是章节标题；引擎偶发传纯数字（如 "0"），显示出来就是孤立的 "· 0" —— 过滤 */
function chapterSuffix(chapter: string): string {
  return chapter && !/^\d+$/.test(chapter) ? ` · ${chapter}` : "";
}

/** 任务按书分组：用户按"一本书的三次导出"思考，不按任务行（IA 重构第 2 步）。
 *  组内活动任务（执行 → 排队）在前，已结束按创建序；组间按列表最近活动序。 */
interface TaskGroup {
  bookId: string;
  title: string;
  coverPath?: string;
  tasks: TaskRow[];
}

const STATUS_RANK: Record<TaskRow["status"], number> = {
  running: 0,
  waiting: 1,
  completed: 2,
  failed: 2,
  cancelled: 2,
};

function groupTasks(tasks: TaskRow[]): TaskGroup[] {
  const map = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const list = map.get(t.book_id);
    if (list) list.push(t);
    else map.set(t.book_id, [t]);
  }
  return [...map.entries()].map(([bookId, list]) => ({
    bookId,
    title: list[0]?.title || bookId,
    coverPath: list.find((t) => t.cover_path)?.cover_path,
    tasks: [...list].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.id - b.id),
  }));
}

/** 任务列表：按书分组，行内取消/删除/定位 + 详情抽屉（docs/04 §4.3），由任务 dock 面板复用 */
export function TaskList({ tasks, onChanged }: { tasks: TaskRow[]; onChanged: () => void }) {
  const [detailId, setDetailId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TaskRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const groups = useMemo(() => groupTasks(tasks), [tasks]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await api.deleteTask(pendingDelete.id);
      setPendingDelete(null);
      setDeleteError(null);
      onChanged();
    } catch (e) {
      setDeleteError(toAppError(e).userMessage);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-5 pt-1 pb-1">
        {groups.map((g) => (
          <TaskGroupItem key={g.bookId} group={g} onOpen={setDetailId} onDelete={setPendingDelete} />
        ))}
      </div>
      {pendingDelete && (
        <Dialog
          title="删除这条任务记录？"
          onClose={() => {
            setPendingDelete(null);
            setDeleteError(null);
          }}
          actions={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setPendingDelete(null);
                  setDeleteError(null);
                }}
              >
                取消
              </Button>
              <Button onClick={() => void confirmDelete()}>删除记录</Button>
            </>
          }
        >
          <p>
            《{pendingDelete.title || pendingDelete.book_id}》（
            {FORMAT_LABEL[pendingDelete.format] ?? pendingDelete.format}）
          </p>
          <p className="text-xs text-faint">
            仅删除记录与断点续传进度；磁盘上的导出文件与书库不受影响。
          </p>
          {deleteError && <p className="text-sm text-negative-text">{deleteError}</p>}
        </Dialog>
      )}
      {detailId !== null && (
        <TaskDetailDrawer
          taskId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function TaskGroupItem({
  group,
  onOpen,
  onDelete,
}: {
  group: TaskGroup;
  onOpen: (id: number) => void;
  onDelete: (task: TaskRow) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 py-1.5">
        <BookCover path={group.coverPath} title={group.title} width={40} />
        <span className="min-w-0 truncate text-sm font-medium">{group.title}</span>
      </div>
      <div className="ml-[52px] flex flex-col">
        {group.tasks.map((t) => (
          <FormatRow key={t.id} task={t} onOpen={() => onOpen(t.id)} onDelete={() => onDelete(t)} />
        ))}
      </div>
    </div>
  );
}

/** 状态记号：形状承载状态语义（点/圈/勾/叉/横），色彩只作辅助 —— 不用颜色单独表达 */
function StatusGlyph({ status }: { status: TaskRow["status"] }) {
  switch (status) {
    case "running":
      return (
        <span className="flex w-3.5 flex-none items-center justify-center" aria-label={STATUS_LABEL[status]}>
          <span className="block size-1.5 rounded-full bg-data" aria-hidden="true" />
        </span>
      );
    case "waiting":
      return (
        <span className="flex w-3.5 flex-none items-center justify-center" aria-label={STATUS_LABEL[status]}>
          <span className="block size-1.5 rounded-full border border-faint" aria-hidden="true" />
        </span>
      );
    case "completed":
      return <Check size={12} strokeWidth={2} className="flex-none text-positive" aria-label={STATUS_LABEL[status]} />;
    case "failed":
      return <X size={12} strokeWidth={2} className="flex-none text-negative" aria-label={STATUS_LABEL[status]} />;
    case "cancelled":
      return <Minus size={12} strokeWidth={2} className="flex-none text-faint" aria-label={STATUS_LABEL[status]} />;
  }
}

function FormatRow({
  task,
  onOpen,
  onDelete,
}: {
  task: TaskRow;
  onOpen: () => void;
  onDelete: () => void;
}) {
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
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="w-14 flex-none text-xs text-faint">{FORMAT_LABEL[task.format] ?? task.format}</span>
      <StatusGlyph status={task.status} />

      <button
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
        aria-label={`查看任务详情：${task.title || task.book_id}`}
      >
        {task.status === "running" && (
          <span className="flex flex-col gap-1">
            <span className="h-1 w-full max-w-[280px] overflow-hidden rounded-full bg-raised">
              <span
                className="block h-full rounded-full bg-data transition-[width] duration-300"
                style={{ width: `${Math.max(2, task.progress)}%` }}
              />
            </span>
            <span className="tnum truncate text-xs text-muted">
              {stageLabel(task.current_stage)}
              {chapterSuffix(task.current_chapter)}
              {task.chapters_done > 0 && ` · 已完成 ${task.chapters_done} 章`}
              {task.pages_done > 0 && ` · ${task.pages_done} 页`}
              {task.words_done > 0 && ` · ${formatWords(task.words_done)}`}
              {` · 已用时 ${elapsedText(task.started_at, null)}`}
            </span>
          </span>
        )}
        {task.status === "waiting" && (
          <span className="text-xs text-muted">排队等待中</span>
        )}
        {task.status === "failed" && (
          <span className="truncate text-xs text-negative-text">
            {task.error_message ?? "任务失败"}
            {task.error_code && `（${task.error_code}）`}
          </span>
        )}
        {task.status === "completed" && (
          <span className="tnum truncate text-xs text-muted">
            已完成 · 用时 {elapsedText(task.started_at, task.finished_at)}
          </span>
        )}
        {task.status === "cancelled" && (
          <span className="text-xs text-faint">已取消</span>
        )}
      </button>

      {actionError && <span className="flex-none text-xs text-negative-text">{actionError}</span>}

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
        {(task.status === "completed" || task.status === "failed" || task.status === "cancelled") && (
          <Button variant="ghost" onClick={onDelete} aria-label="删除记录" title="删除记录">
            <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
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
