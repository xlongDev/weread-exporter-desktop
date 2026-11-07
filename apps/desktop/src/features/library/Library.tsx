import { useEffect, useMemo, useState } from "react";
import { BookOpen, FolderOpen, LayoutGrid, List } from "lucide-react";
import { api, toAppError } from "../../services/api";
import type { LibraryFile } from "../../types";
import { Button } from "../../components/Button";
import { BookCover } from "../../components/BookCover";
import { Dialog } from "../../components/Dialog";
import { Trash2 } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { StatusPill } from "../../components/StatusPill";

const FORMAT_LABEL: Record<string, string> = { pdf: "PDF", epub: "EPUB", markdown: "Markdown" };

/** 书库：导出产物的封面墙 / 列表，搜索筛选与文件管理（docs/04 §4.4） */
export function Library() {
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [pendingDelete, setPendingDelete] = useState<LibraryFile | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((f) => {
      if (formatFilter !== "all" && f.format !== formatFilter) return false;
      if (!q) return true;
      return f.title.toLowerCase().includes(q) || f.author.toLowerCase().includes(q);
    });
  }, [files, query, formatFilter]);

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">书库</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            aria-label="网格视图"
            aria-pressed={view === "grid"}
            className={view === "grid" ? "text-ink" : ""}
            onClick={() => setView("grid")}
          >
            <LayoutGrid size={15} strokeWidth={1.5} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            aria-label="列表视图"
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
          className="h-8 w-64 rounded-[6px] border border-line bg-surface px-3 text-sm outline-none placeholder:text-faint focus:border-[var(--data)]"
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
            {fmt === "all" ? "全部" : FORMAT_LABEL[fmt]}
          </button>
        ))}
        <Button
          variant="ghost"
          className="ml-auto"
          disabled={files.length === 0}
          onClick={() => setConfirmClear(true)}
        >
          <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
          清除记录
        </Button>
        <span className="tnum text-xs text-faint">{filtered.length} 个文件</span>
      </div>

      {error && <p className="text-sm text-negative-text">{error}</p>}

      {files.length === 0 ? (
        <EmptyState
          withSpines
          title="书库为空"
          description="导出的电子书（PDF / EPUB / Markdown）会保存在这里，可搜索、打开与整理。"
        />
      ) : filtered.length === 0 ? (
        <p className="py-2 text-sm text-faint">没有匹配「{query || FORMAT_LABEL[formatFilter]}」的文件。</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-x-4 gap-y-6">
          {filtered.map((f) => (
            <div key={f.id} className="group flex flex-col gap-2">
              <div className="relative">
                <BookCover path={f.cover_path} title={f.title || f.book_id} width={140} />
                {!f.exists_ok && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-[3px] bg-black/45">
                    <span className="text-xs text-white">文件缺失</span>
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                  <MiniAction label="打开文件" onClick={() => void open(f)} icon={<BookOpen size={14} strokeWidth={1.5} />} disabled={!f.exists_ok} />
                  <MiniAction label="定位文件" onClick={() => void reveal(f)} icon={<FolderOpen size={14} strokeWidth={1.5} />} />
                  <MiniAction label="删除" onClick={() => setPendingDelete(f)} icon={<Trash2 size={14} strokeWidth={1.5} />} />
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="line-clamp-2 text-sm leading-snug">{f.title || f.book_id}</span>
                <span className="truncate text-xs text-muted">{f.author || "—"}</span>
                <span className="tnum text-xs text-faint">
                  {FORMAT_LABEL[f.format] ?? f.format} · {formatSize(f.file_size)} · {formatDate(f.created_at)}
                </span>
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
                  {!f.exists_ok && <StatusPill tone="negative">文件缺失</StatusPill>}
                </div>
                <span className="truncate text-xs text-muted">
                  {f.author || "—"} · {FORMAT_LABEL[f.format] ?? f.format} · {formatSize(f.file_size)} ·{" "}
                  {formatDate(f.created_at)}
                </span>
              </div>
              <div className="flex flex-none items-center gap-1">
                <Button variant="ghost" disabled={!f.exists_ok} onClick={() => void open(f)} aria-label="打开文件">
                  <BookOpen size={14} strokeWidth={1.5} aria-hidden="true" />
                </Button>
                <Button variant="ghost" onClick={() => void reveal(f)} aria-label="定位文件">
                  <FolderOpen size={14} strokeWidth={1.5} aria-hidden="true" />
                </Button>
                <Button variant="ghost" onClick={() => setPendingDelete(f)} aria-label="删除">
                  <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirmClear && (
        <Dialog
          title="清除全部书库记录？"
          onClose={() => setConfirmClear(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                取消
              </Button>
              <Button onClick={() => void clearRecords()}>清除全部记录</Button>
            </>
          }
        >
          <p className="tnum">将删除全部 {files.length} 条书库记录。</p>
          <p className="text-xs">
            只删除记录，磁盘上的导出文件不受影响；如需连文件一起删除，请逐条使用卡片上的删除按钮。
          </p>
        </Dialog>
      )}

      {pendingDelete && (
        <Dialog
          title="删除这条书库记录？"
          onClose={() => setPendingDelete(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setPendingDelete(null)}>
                取消
              </Button>
              <Button onClick={() => void confirmDelete(false)}>仅删除记录</Button>
              <Button
                className="text-negative hover:bg-[var(--pill-negative-bg)]"
                onClick={() => void confirmDelete(true)}
              >
                删除记录并删除文件
              </Button>
            </>
          }
        >
          <p>
            《{pendingDelete.title || pendingDelete.book_id}》（{FORMAT_LABEL[pendingDelete.format] ?? pendingDelete.format}）
          </p>
          <p className="selectable break-all text-xs text-faint">{pendingDelete.file_path}</p>
          <p className="text-xs">「删除记录并删除文件」会同时从磁盘移除该文件，此操作不可撤销。</p>
        </Dialog>
      )}
    </div>
  );
}

function MiniAction({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:bg-raised disabled:opacity-40"
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
