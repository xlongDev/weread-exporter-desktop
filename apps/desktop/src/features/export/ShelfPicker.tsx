import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Check, Search } from "lucide-react";
import { api, toAppError } from "../../services/api";
import { filterShelfItems } from "../../utils/shelf";
import type { ShelfItem } from "../../types";
import { Dialog } from "../../components/Dialog";
import { t, useT } from "../../i18n";
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
    const timer = window.setTimeout(() => finish(errText || t("获取书架超时，请重试")), 60000);
    void listen("engine://event", (event) => {
      const ev = event.payload as { event?: string; task_id?: string; data?: Record<string, unknown> };
      if (!ev?.event || !ev.task_id || ev.task_id !== opId) return;
      if (ev.event === "shelf.books") {
        meta = ((ev.data as { books?: ShelfItem[] }).books ?? []) as ShelfItem[];
        finish(null);
      } else if (ev.event === "shelf.error") {
        errText = (ev.data as { user_message?: string }).user_message || t("书架获取失败");
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

/** 书架一键导入：拉取微信读书书架 → 勾选书籍 → 交给既有批量导出 / 划线汇总流程 */
export function ShelfPicker({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  /** 整卡回传：book_hash（抓取管线真实 ID）与 book_id（数字 ID，notes 想法端点专用）由调用方各取所需 */
  onConfirm: (items: ShelfItem[], mode: "export" | "summary") => void;
}) {
  const t = useT();
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [books, setBooks] = useState<ShelfItem[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failedCovers, setFailedCovers] = useState<Set<string>>(new Set());
  const [opId, setOpId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase("loading");
    setError("");
    setSelected(new Set());
    setFailedCovers(new Set());
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

  // 确认导出：回传完整书架卡片。导出走 v-hash（bookDetail/抓取管线的真实 ID，
  // 数字 bookId 的 bookDetail 页 404——3300198797 实测）；汇总还需数字 ID（想法端点专用）
  function confirmSelected(mode: "export" | "summary") {
    const items = selectedIds
      .map((id) => books.find((b) => b.book_id === id))
      .filter((b): b is ShelfItem => !!b);
    onConfirm(items, mode);
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

  // 分组分区（微信读书 archive[]）：有任意分组才启用；未分组书排在最后
  const hasGroups = books.some((b) => b.group);
  const sections: [string, ShelfItem[]][] = hasGroups
    ? (() => {
        const byName = new Map<string, ShelfItem[]>();
        for (const b of shown) {
          const g = b.group || "未分组";
          const list = byName.get(g);
          if (list) list.push(b);
          else byName.set(g, [b]);
        }
        const out = [...byName.entries()].filter(([g]) => g !== "未分组");
        const ungrouped = byName.get("未分组");
        if (ungrouped) out.push(["未分组", ungrouped]);
        return out;
      })()
    : [];

  // 组级全选/清空
  function toggleGroup(items: ShelfItem[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const all = items.every((b) => next.has(b.book_id));
      for (const b of items) {
        if (all) next.delete(b.book_id);
        else next.add(b.book_id);
      }
      return next;
    });
  }

  if (!open) return null; // 必须门控渲染：否则关闭态也会画 Dialog（启动即弹、取消无效的根因）

  function card(b: ShelfItem) {
    const picked = selected.has(b.book_id);
    const broken = failedCovers.has(b.book_id);
    return (
      <button
        key={b.book_id}
        onClick={() => toggle(b.book_id)}
        aria-pressed={picked}
        className="group flex flex-col gap-1.5 text-left"
        title={b.title}
      >
        <span className="relative block overflow-hidden rounded-lg border border-line">
          {b.cover && !broken ? (
            <img
              src={b.cover}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() =>
                setFailedCovers((prev) => {
                  const next = new Set(prev);
                  next.add(b.book_id);
                  return next;
                })
              }
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
  }

  return (
    <Dialog
      title={t("从书架导入")}
      wide
      onClose={close}
      actions={
        <>
          <Button onClick={close}>{t("取消")}</Button>
          <Button
            variant="secondary"
            disabled={selectedIds.length === 0}
            onClick={() => confirmSelected("summary")}
          >
            {t("汇总划线（{n}）", { n: selectedIds.length })}
          </Button>
          <Button
            variant="primary"
            disabled={selectedIds.length === 0}
            onClick={() => confirmSelected("export")}
          >
            {t("导出所选（{n}）", { n: selectedIds.length })}
          </Button>
        </>
      }
    >
      {phase === "loading" && (
        <p className="py-8 text-center text-sm text-faint">{t("正在拉取书架（需要启动浏览器，约数秒）…")}</p>
      )}
      {phase === "error" && <p className="text-sm text-negative-text">{error}</p>}
      {phase === "ready" && (
        <>
          <div className="flex items-center gap-2">
            <Search size={14} className="flex-none text-faint" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("搜索书名或作者")}
              spellCheck={false}
              className="input-glass h-9 flex-1 rounded-full px-4 text-sm text-ink placeholder:text-faint"
              aria-label={t("搜索书架")}
            />
          </div>
          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-faint">
              {books.length === 0 ? t("书架为空，或该账号没有同步书籍。") : t("没有匹配的书籍。")}
            </p>
          ) : !hasGroups ? (
            <>
              <div className="grid max-h-[52vh] grid-cols-4 gap-x-4 gap-y-5 overflow-y-auto pt-1 sm:grid-cols-5 md:grid-cols-6">
                {shown.map((b) => card(b))}
              </div>
              <p className="text-xs text-faint">
                {t("共 {n} 本{matched}。", { n: books.length, matched: query && shown.length !== books.length ? t("，匹配 {n} 本", { n: shown.length }) : "" })}
                {t("确认后逐本获取信息并按所选格式入队（与批量粘贴同一流程）。")}
              </p>
            </>
          ) : (
            <>
              <div className="flex max-h-[52vh] flex-col gap-5 overflow-y-auto pt-1 pr-1">
                {sections.map(([name, items]) => (
                  <div key={name} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink">{name}</span>
                      <span className="tnum text-xs text-faint">{t("{n} 本", { n: items.length })}</span>
                      <button
                        onClick={() => toggleGroup(items)}
                        className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                      >
                        {items.every((b) => selected.has(b.book_id)) ? t("清空") : t("全选")}
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-x-4 gap-y-5 sm:grid-cols-5 md:grid-cols-6">
                      {items.map((b) => card(b))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-faint">
                {t("共 {n} 本{matched}。", { n: books.length, matched: query && shown.length !== books.length ? t("，匹配 {n} 本", { n: shown.length }) : "" })}
                {t("「导出所选」逐本获取信息并按所选格式入队；「汇总划线」不抓正文，仅逐本拉取划线与想法合并为一个 Markdown。")}
              </p>
            </>
          )}
        </>
      )}
    </Dialog>
  );
}
