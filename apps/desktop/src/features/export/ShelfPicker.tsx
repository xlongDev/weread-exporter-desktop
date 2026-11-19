import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Check, Search } from "lucide-react";
import { api, toAppError } from "../../services/api";
import { filterShelfItems } from "../../utils/shelf";
import type { ShelfItem } from "../../types";
import { Dialog } from "../../components/Dialog";
import { Button } from "../../components/Button";

/** 发起 shelf_fetch op 并等待终态 shelf.books / shelf.error（60s 超时兜底 worker 崩溃） */
function fetchShelfViaOp(): Promise<{ opId: string; books: ShelfItem[] }> {
  return new Promise((resolve, reject) => {
    let opId: string | null = null;
    let meta: ShelfItem[] | null = null;
    let un: UnlistenFn | null = null;
    let settled = false;
    const finish = (err: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      un?.();
      if (err) reject(new Error(err));
      else resolve({ opId: opId as string, books: meta as ShelfItem[] });
    };
    let errText: string | null = null;
    const timer = window.setTimeout(() => finish(errText || "获取书架超时，请重试"), 60000);
    void listen("engine://event", (event) => {
      const ev = event.payload as { event?: string; task_id?: string; data?: Record<string, unknown> };
      if (!ev?.event || !ev.task_id || ev.task_id !== opId) return;
      if (ev.event === "shelf.books") {
        meta = ((ev.data as { books?: ShelfItem[] }).books ?? []) as ShelfItem[];
        finish(null);
      } else if (ev.event === "shelf.error") {
        errText = (ev.data as { user_message?: string }).user_message || "书架获取失败";
        finish(errText);
      }
    }).then((fn) => {
      if (settled) fn();
      else un = fn;
    });
    api
      .startOp("shelf_fetch")
      .then((id) => {
        opId = id;
      })
      .catch((e) => finish(toAppError(e).userMessage));
  });
}

/** 书架一键导入：拉取微信读书书架 → 勾选书籍 → 交给既有批量导出流程 */
export function ShelfPicker({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (bookIds: string[]) => void;
}) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [books, setBooks] = useState<ShelfItem[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opId, setOpId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase("loading");
    setError("");
    setSelected(new Set());
    setQuery("");
    let alive = true;
    fetchShelfViaOp()
      .then(({ opId: id, books: b }) => {
        if (!alive) return;
        setOpId(id);
        setBooks(b);
        setPhase("ready");
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      });
    return () => {
      alive = false;
    };
  }, [open]);

  // 关闭时取消后台 op（浏览器启动等慢路径不留悬挂进程）
  function close() {
    if (opId) void api.cancelOp(opId).catch(() => {});
    setOpId(null);
    onClose();
  }

  const shown = filterShelfItems(books, query);
  const selectedIds = [...selected];

  function toggle(bookId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  }

  if (!open) return null; // 必须门控渲染：否则关闭态也会画 Dialog（启动即弹、取消无效的根因）

  return (
    <Dialog
      title="从书架导入"
      wide
      onClose={close}
      actions={
        <>
          <Button onClick={close}>取消</Button>
          <Button
            variant="primary"
            disabled={selectedIds.length === 0}
            onClick={() => onConfirm(selectedIds)}
          >
            导出所选（{selectedIds.length}）
          </Button>
        </>
      }
    >
      {phase === "loading" && (
        <p className="py-8 text-center text-sm text-faint">正在拉取书架（需要启动浏览器，约数秒）…</p>
      )}
      {phase === "error" && <p className="text-sm text-negative-text">{error}</p>}
      {phase === "ready" && (
        <>
          <div className="flex items-center gap-2">
            <Search size={14} className="flex-none text-faint" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索书名或作者"
              spellCheck={false}
              className="input-glass h-9 flex-1 rounded-full px-4 text-sm text-ink placeholder:text-faint"
              aria-label="搜索书架"
            />
          </div>
          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-faint">
              {books.length === 0 ? "书架为空，或该账号没有同步书籍。" : "没有匹配的书籍。"}
            </p>
          ) : (
            <>
              <div className="grid max-h-[52vh] grid-cols-4 gap-x-4 gap-y-5 overflow-y-auto pt-1 sm:grid-cols-5 md:grid-cols-6">
                {shown.map((b) => {
                  const picked = selected.has(b.book_id);
                  return (
                    <button
                      key={b.book_id}
                      onClick={() => toggle(b.book_id)}
                      aria-pressed={picked}
                      className="group flex flex-col gap-1.5 text-left"
                      title={b.title}
                    >
                      <span className="relative block overflow-hidden rounded-lg border border-line">
                        {b.cover ? (
                          <img
                            src={b.cover}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="aspect-[2/3] w-full object-cover"
                          />
                        ) : (
                          <span className="flex aspect-[2/3] w-full items-center justify-center bg-raised font-serif text-xs text-faint">
                            {b.title.slice(0, 2)}
                          </span>
                        )}
                        <span
                          className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                            picked
                              ? "border-transparent bg-raised text-ink"
                              : "border-line bg-surface/80 text-transparent group-hover:bg-surface"
                          }`}
                        >
                          <Check size={12} strokeWidth={3} aria-hidden="true" />
                        </span>
                      </span>
                      <span className="line-clamp-2 font-serif text-[12px] leading-snug text-ink">{b.title}</span>
                      {b.author && <span className="line-clamp-1 text-[11px] text-faint">{b.author}</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-faint">
                共 {books.length} 本{query && shown.length !== books.length ? `，匹配 ${shown.length} 本` : ""}。
                确认后逐本获取信息并按所选格式入队（与批量粘贴同一流程）。
              </p>
            </>
          )}
        </>
      )}
    </Dialog>
  );
}
