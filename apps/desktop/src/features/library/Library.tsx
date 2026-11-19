import { useEffect, useMemo, useState } from "react";
import { dirname } from "@tauri-apps/api/path";
import { BookOpen, FolderOpen, LayoutGrid, List, RefreshCw, Trash2 } from "lucide-react";
import { api, toAppError } from "../../services/api";
import type { LibraryFile } from "../../types";
import { useNav } from "../../stores/nav";
import { useTasks } from "../../stores/tasks";
import { groupFiles, type ShelfBook } from "../../utils/shelf";
import { t, useT } from "../../i18n";
import { Button } from "../../components/Button";
import { BookCover } from "../../components/BookCover";
import { Dialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { StatusPill } from "../../components/StatusPill";

const FORMAT_LABEL: Record<string, string> = { pdf: "PDF", epub: "EPUB", markdown: "Markdown", notes: "笔记" };

/** 文件行标签：Markdown 引擎产出两个变体（全书合并排版版/纯 Markdown 笔记版），用简称区分行 */
function fileLabel(f: { format: string; file_name: string }): string {
  if (f.format !== "markdown") return t(FORMAT_LABEL[f.format] ?? f.format);
  if (f.file_name.includes("全书合并")) return t("MD · 合并排版");
  if (f.file_name.includes("纯Markdown")) return t("MD · 纯净");
  return t(FORMAT_LABEL.markdown);
}

/** 书库：书架（按书的封面墙 + 格式文件行，默认）与文件列表（按文件平铺）两种视图 */
export function Library() {
  const t = useT();
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [pendingDelete, setPendingDelete] = useState<LibraryFile | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const goto = useNav((s) => s.goto);

  async function load() {
    try {
      setFiles(await api.listFiles());
      setError(null);
    } catch (e) {
      setError(toAppError(e).userMessage);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // 先过滤文件（书名/作者 + 格式），再按书聚合 —— 搜索命中即整本书出现，格式筛选则只留该格式的文件行
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((f) => {
      if (formatFilter !== "all" && f.format !== formatFilter) return false;
      if (!q) return true;
      return f.title.toLowerCase().includes(q) || f.author.toLowerCase().includes(q);
    });
  }, [files, query, formatFilter]);

  const shelfBooks = useMemo(() => groupFiles(filtered), [filtered]);

  async function open(f: LibraryFile) {
    try {
      await api.openFile(f.id);
      setError(null);
    } catch (e) {
      setError(toAppError(e).userMessage);
    }
  }

  async function reveal(f: LibraryFile) {
    try {
      await api.revealExportedFile(f.id);
      setError(null);
    } catch (e) {
      setError(toAppError(e).userMessage);
    }
  }

  async function confirmDelete(deleteFile: boolean) {
    const f = pendingDelete;
    if (!f) return;
    try {
      await api.deleteExportedFile(f.id, deleteFile);
      setPendingDelete(null);
      await load();
    } catch (e) {
      setError(toAppError(e).userMessage);
    }
  }

  async function clearRecords() {
    try {
      await api.clearLibraryRecords();
      setConfirmClear(false);
      setError(null);
      await load();
    } catch (e) {
      setError(toAppError(e).userMessage);
    }
  }

  // 连载书增量更新：对已导出的格式各建一个 force 任务——引擎重开目录比对，
  // 有新章节从断点续抓（温和节奏，只耗新章节的时间），无更新秒级重渲染同名覆盖。
  // 输出目录沿用原文件所在目录（用户可能换过默认目录），避免书库出现两份记录。
  const [updateBusy, setUpdateBusy] = useState<string | null>(null);
  const [updateNote, setUpdateNote] = useState<string | null>(null);

  async function updateExport(b: ShelfBook) {
    if (updateBusy) return;
    setUpdateBusy(b.bookId);
    setUpdateNote(null);
    try {
      const formats = [...new Set(b.files.map((f) => f.format))];
      const firstPath = b.files.find((f) => f.file_path)?.file_path;
      const dir = firstPath ? await dirname(firstPath) : undefined;
      for (const fmt of formats) await api.createTask(b.bookId, fmt, dir, undefined, true);
      await useTasks.getState().load();
      setUpdateNote(
        t("《{title}》更新检查已入队（{n} 个格式）：有新章节会从断点续抓，无更新将直接重渲染。", { title: b.title, n: formats.length }),
      );
    } catch (e) {
      setError(toAppError(e).userMessage);
    } finally {
      setUpdateBusy(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">{t("书库")}</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            aria-label={t("网格视图")}
            aria-pressed={view === "grid"}
            className={view === "grid" ? "text-ink" : ""}
            onClick={() => setView("grid")}
          >
            <LayoutGrid size={15} strokeWidth={1.5} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            aria-label={t("列表视图")}
            aria-pressed={view === "list"}
            className={view === "list" ? "text-ink" : ""}
            onClick={() => setView("list")}
          >
            <List size={15} strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索书名或作者"
          spellCheck={false}
          className="input-glass h-8 w-64 rounded-full px-3 text-sm outline-none placeholder:text-faint"
          aria-label="搜索书库"
        />
        {["all", "pdf", "epub", "markdown"].map((fmt) => (
          <button
            key={fmt}
            onClick={() => setFormatFilter(fmt)}
            aria-pressed={formatFilter === fmt}
            className={`h-8 rounded-full px-3 text-xs transition-colors ${
              formatFilter === fmt ? "bg-raised text-ink" : "text-muted hover:bg-raised/60"
            }`}
          >
            {fmt === "all" ? t("全部") : t(FORMAT_LABEL[fmt])}
          </button>
        ))}
        <Button
          variant="ghost"
          className="ml-auto"
          disabled={files.length === 0}
          onClick={() => setConfirmClear(true)}
        >
          <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
          {t("清除记录")}
        </Button>
        <span className="tnum text-xs text-faint">
          {view === "grid"
            ? t("{n} 本书 · {m} 个文件", { n: shelfBooks.length, m: filtered.length })
            : t("{n} 个文件", { n: filtered.length })}
        </span>
      </div>

      {error && <p className="text-sm text-negative-text">{error}</p>}
      {updateNote && <p className="text-sm text-muted">{updateNote}</p>}

      {files.length === 0 ? (
        <div className="flex min-h-[420px] flex-1 flex-col items-center justify-center">
          <EmptyState
            centered
            withSpines
            title={t("书库为空")}
            description={t("导出的电子书（PDF / EPUB / Markdown）会保存在这里，可搜索、打开与整理。")}
            action={
              <Button variant="primary" onClick={() => goto("export")}>
                {t("去导出第一本书")}
              </Button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-2 text-sm text-faint">{t("没有匹配「{query}」的文件。", { query: query || t(FORMAT_LABEL[formatFilter]) })}</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] items-start gap-x-4 gap-y-6">
          {shelfBooks.map((b) => (
            <div key={b.bookId} className="flex flex-col">
              <BookCover fill path={b.coverPath} title={b.title} />
              <div className="mt-2.5 flex flex-col gap-0.5">
                <span className="line-clamp-2 font-serif text-[15px] leading-snug">{b.title}</span>
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">{b.author || "—"}</span>
                  <RowAction
                    label={t("更新导出")}
                    onClick={() => void updateExport(b)}
                    icon={
                      <RefreshCw
                        size={13}
                        strokeWidth={1.5}
                        aria-hidden="true"
                        className={updateBusy === b.bookId ? "animate-spin" : undefined}
                      />
                    }
                  />
                </div>
              </div>
              <div className="mt-2 flex flex-col border-t border-rule pt-1">
                {b.files.map((f) => (
                  <div key={f.id} className="flex items-center gap-0.5 py-1">
                    <button
                      onClick={() => void open(f)}
                      disabled={!f.exists_ok}
                      className="flex min-w-0 flex-1 items-baseline gap-2 rounded-[4px] px-1 py-0.5 text-left transition-colors hover:bg-raised/60 disabled:cursor-not-allowed"
                      aria-label={t("打开《{title}》{label}文件", { title: b.title, label: fileLabel(f) })}
                      title={f.exists_ok ? undefined : t("文件缺失，无法打开")}
                    >
                      <span className="flex-none text-xs font-medium">
                        {fileLabel(f)}
                      </span>
                      <span
                        className={`tnum min-w-0 flex-1 truncate text-xs ${
                          f.exists_ok ? "text-faint" : "text-negative-text"
                        }`}
                      >
                        {f.exists_ok ? formatSize(f.file_size) : t("文件缺失")}
                      </span>
                    </button>
                    <RowAction
                      label={t("定位文件")}
                      onClick={() => void reveal(f)}
                      icon={<FolderOpen size={13} strokeWidth={1.5} aria-hidden="true" />}
                    />
                    <RowAction
                      label={t("删除")}
                      onClick={() => setPendingDelete(f)}
                      icon={<Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col">
          {filtered.map((f) => (
            <li key={f.id} className="flex items-center gap-4 border-b border-rule py-3 last:border-b-0">
              <BookCover path={f.cover_path} title={f.title || f.book_id} width={40} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm">{f.title || f.book_id}</span>
                  {!f.exists_ok && <StatusPill tone="negative">{t("文件缺失")}</StatusPill>}
                </div>
                <span className="truncate text-xs text-muted">
                  {f.author || "—"} · {FORMAT_LABEL[f.format] ?? f.format} · {formatSize(f.file_size)} ·{" "}
                  {formatDate(f.created_at)}
                </span>
              </div>
              <div className="flex flex-none items-center gap-1">
                <Button variant="ghost" disabled={!f.exists_ok} onClick={() => void open(f)} aria-label={t("打开文件")}>
                  <BookOpen size={14} strokeWidth={1.5} aria-hidden="true" />
                </Button>
                <Button variant="ghost" onClick={() => void reveal(f)} aria-label={t("定位文件")}>
                  <FolderOpen size={14} strokeWidth={1.5} aria-hidden="true" />
                </Button>
                <Button variant="ghost" onClick={() => setPendingDelete(f)} aria-label={t("删除")}>
                  <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirmClear && (
        <Dialog
          title={t("清除全部书库记录？")}
          onClose={() => setConfirmClear(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                {t("取消")}
              </Button>
              <Button onClick={() => void clearRecords()}>{t("清除全部记录")}</Button>
            </>
          }
        >
          <p className="tnum">{t("将删除全部 {n} 条书库记录。", { n: files.length })}</p>
          <p className="text-xs">
            {t("只删除记录，磁盘上的导出文件不受影响；如需连文件一起删除，请逐条使用文件行的删除按钮。")}
          </p>
        </Dialog>
      )}

      {pendingDelete && (
        <Dialog
          title={t("删除这条书库记录？")}
          onClose={() => setPendingDelete(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setPendingDelete(null)}>
                {t("取消")}
              </Button>
              <Button onClick={() => void confirmDelete(false)}>{t("仅删除记录")}</Button>
              <Button
                className="text-negative hover:bg-[var(--pill-negative-bg)]"
                onClick={() => void confirmDelete(true)}
              >
                {t("删除记录并删除文件")}
              </Button>
            </>
          }
        >
          <p>
            {t("《{title}》（{format}）", { title: pendingDelete.title || pendingDelete.book_id, format: t(FORMAT_LABEL[pendingDelete.format] ?? pendingDelete.format) })}
          </p>
          <p className="selectable break-all text-xs text-faint">{pendingDelete.file_path}</p>
          <p className="text-xs">{t("「删除记录并删除文件」会同时从磁盘移除该文件，此操作不可撤销。")}</p>
        </Dialog>
      )}
    </div>
  );
}

/** 文件行内小动作：无边的 24px 图标按钮（区别于封面悬浮的描边圆钮） */
function RowAction({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-faint transition-colors hover:bg-raised hover:text-ink"
    >
      {icon}
    </button>
  );
}

function formatSize(n: number): string {
  if (n <= 0) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  // SQLite datetime('now') 为 UTC："YYYY-MM-DD HH:MM:SS"
  const d = Date.parse(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d)) return iso;
  return new Date(d).toLocaleDateString("zh-CN");
}
