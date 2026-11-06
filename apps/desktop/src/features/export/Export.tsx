import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { api, toAppError } from "../../services/api";
import { extractBookId, looksLikeBookId } from "../../utils/bookId";
import type { BookMeta, BookValidation } from "../../types";
import { Button } from "../../components/Button";
import { BookCover } from "../../components/BookCover";
import { SectionHeader } from "../../components/SectionHeader";
import { StatusPill } from "../../components/StatusPill";

type ParsePhase = "idle" | "parsing" | "ready" | "error";

/** 导出书籍 · 第一步：粘贴链接导入书籍（格式选择与导出配置见向导后续步骤） */
export function Export() {
  const [raw, setRaw] = useState("");
  const [phase, setPhase] = useState<ParsePhase>("idle");
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [validation, setValidation] = useState<BookValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [opId, setOpId] = useState<string | null>(null);

  // 页面级事件订阅：book.metadata / book.validation（task_id = op_id）
  useEffect(() => {
    let un: UnlistenFn | null = null;
    let disposed = false;
    void listen("engine://event", (event) => {
      const ev = event.payload as { event?: string; task_id?: string; data?: Record<string, unknown> };
      if (!ev?.event || !ev.task_id || ev.task_id !== opId) return;
      if (ev.event === "book.metadata") {
        setMeta(ev.data as unknown as BookMeta);
      } else if (ev.event === "book.validation") {
        setValidation(ev.data as unknown as BookValidation);
        setPhase((ev.data as unknown as BookValidation).ok ? "ready" : "error");
      }
    }).then((fn) => {
      if (disposed) fn();
      else un = fn;
    });
    return () => {
      disposed = true;
      un?.();
    };
  }, [opId]);

  async function parse() {
    const bookId = extractBookId(raw);
    if (!looksLikeBookId(bookId)) {
      setPhase("error");
      setError("请粘贴微信读书书籍链接（weread.qq.com/web/reader/…）或书籍 ID");
      return;
    }
    setPhase("parsing");
    setError(null);
    setMeta(null);
    setValidation(null);
    setImported(false);
    try {
      const id = await api.startOp("book_info", { book_id: bookId });
      setOpId(id);
    } catch (e) {
      setPhase("error");
      setError(toAppError(e).userMessage);
    }
  }

  async function doImport() {
    if (!meta) return;
    try {
      await api.importBook({
        bookId: meta.book_id,
        title: meta.title,
        author: meta.author,
        intro: meta.intro,
        coverPath: meta.cover_path,
      });
      setImported(true);
      setError(null);
    } catch (e) {
      setError(toAppError(e).userMessage);
    }
  }

  return (
    <div className="flex max-w-[860px] flex-col gap-8">
      <h1 className="text-2xl font-bold text-ink">导出书籍</h1>

      <section className="flex flex-col gap-3">
        <SectionHeader title="粘贴书籍链接" />
        <div className="flex items-center gap-2">
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void parse()}
            placeholder="https://weread.qq.com/web/reader/… 或书籍 ID"
            spellCheck={false}
            className="h-9 flex-1 rounded-[6px] border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-faint focus:border-[var(--data)]"
            aria-label="微信读书书籍链接或 ID"
          />
          <Button variant="primary" disabled={phase === "parsing" || !raw.trim()} onClick={() => void parse()}>
            {phase === "parsing" ? "获取中…" : "获取书籍"}
          </Button>
        </div>
        {error && <p className="text-sm text-negative">{error}</p>}
      </section>

      {meta && (
        <section className="flex gap-5 rounded-card border border-line bg-surface p-5">
          <BookCover path={meta.cover_path} title={meta.title} width={96} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              <h2 className="truncate text-base font-semibold">{meta.title || "未知书名"}</h2>
              {imported && <StatusPill tone="positive">已导入</StatusPill>}
              {validation && !validation.ok && <StatusPill tone="negative">不可用</StatusPill>}
            </div>
            {meta.author && <p className="text-sm text-muted">{meta.author}</p>}
            {meta.intro && (
              <p className="selectable line-clamp-3 text-sm text-muted">{meta.intro}</p>
            )}
            {validation && !validation.ok && validation.user_message && (
              <p className="text-sm text-negative">{validation.user_message}</p>
            )}
            {validation && !validation.logged_in && validation.ok && (
              <p className="text-sm text-warning">尚未登录：登录后才能确认访问权限并抓取正文。</p>
            )}
            <div className="mt-2 flex items-center gap-2">
              {validation?.ok && !imported && (
                <Button variant="primary" onClick={() => void doImport()}>
                  导入书籍
                </Button>
              )}
              {imported && (
                <p className="text-sm text-muted">
                  已加入书库。下一步将选择导出格式并创建导出任务。
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {phase === "parsing" && (
        <p className="text-sm text-faint">正在通过引擎获取书籍信息（需要启动浏览器，约数秒）…</p>
      )}
    </div>
  );
}
