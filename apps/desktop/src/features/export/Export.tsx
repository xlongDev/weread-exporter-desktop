import { useCallback, useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { Check } from "lucide-react";
import { api, toAppError } from "../../services/api";
import { useNav } from "../../stores/nav";
import { useSettings } from "../../stores/settings";
import { useTasks } from "../../stores/tasks";
import { useAuth } from "../../stores/auth";
import { extractBookId, looksLikeBookId } from "../../utils/bookId";
import { groupFiles, type ShelfBook } from "../../utils/shelf";
import type { BookMeta, BookValidation, ExportFormat } from "../../types";
import { Button } from "../../components/Button";
import { BookCover } from "../../components/BookCover";
import { StatusPill } from "../../components/StatusPill";

type ParsePhase = "idle" | "parsing" | "ready" | "error";

const FORMATS: { key: ExportFormat; name: string; hint: string }[] = [
  { key: "pdf", name: "精排 PDF", hint: "适合 iPad 批注与打印" },
  { key: "epub", name: "EPUB", hint: "适合 Apple Books / Kindle" },
  { key: "markdown", name: "Markdown", hint: "适合 Obsidian / Notion" },
];

/** 导出书籍：单页流程 —— 粘贴链接 → 获取 → 开始导出（默认全格式、默认目录） */
export function Export() {
  const [raw, setRaw] = useState("");
  const [phase, setPhase] = useState<ParsePhase>("idle");
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [validation, setValidation] = useState<BookValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opId, setOpId] = useState<string | null>(null);
  const [imported, setImported] = useState(false);

  const [formats, setFormats] = useState<ExportFormat[]>(["pdf", "epub", "markdown"]);
  const [outputDir, setOutputDir] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const auth = useAuth();
  const goto = useNav((s) => s.goto);
  const { settings } = useSettings();

  // 首页「最近导出」封面架：书库数据投影（读取失败时整块隐藏，不显示假空态）
  const [recent, setRecent] = useState<ShelfBook[] | null>(null);
  const loadRecent = useCallback(() => {
    void api
      .listFiles()
      .then((files) => setRecent(groupFiles(files).slice(0, 6)))
      .catch(() => setRecent(null));
  }, []);
  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  // 输出目录默认值：设置里的首选目录 → 系统默认目录
  useEffect(() => {
    if (outputDir) return;
    const saved = settings?.["general.output_dir"];
    if (typeof saved === "string" && saved) setOutputDir(saved);
    else
      void api
        .paths()
        .then((p) => setOutputDir((d) => d || p.default_output_dir))
        .catch(() => {});
  }, [settings, outputDir]);

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
        const v = ev.data as unknown as BookValidation;
        setValidation(v);
        setPhase(v.ok ? "ready" : "error");
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

  async function parseWithId(input: string) {
    const bookId = extractBookId(input);
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

  async function parse() {
    await parseWithId(raw);
  }

  async function pasteAndFetch() {
    try {
      const text = (await readText()).trim();
      setRaw(text);
      await parseWithId(text);
    } catch (e) {
      setPhase("error");
      setError("无法读取剪贴板：" + toAppError(e).userMessage);
    }
  }

  // 校验通过即自动导入（幂等 upsert），省掉单独的「导入书籍」点击
  const [autoImportedFor, setAutoImportedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!validation?.ok || !meta || autoImportedFor === meta.book_id) return;
    setAutoImportedFor(meta.book_id);
    void api
      .importBook({
        bookId: meta.book_id,
        title: meta.title,
        author: meta.author,
        intro: meta.intro,
        coverPath: meta.cover_path,
      })
      .then(() => setImported(true))
      .catch((e) => {
        setImported(false);
        setError(toAppError(e).userMessage);
      });
  }, [validation, meta, autoImportedFor]);

  async function pickDir() {
    try {
      const dir = await open({ directory: true, multiple: false });
      if (typeof dir === "string") setOutputDir(dir);
    } catch (e) {
      setError(toAppError(e).userMessage);
    }
  }

  async function createTasks() {
    if (!meta || formats.length === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      for (const fmt of formats) {
        await api.createTask(meta.book_id, fmt, outputDir || undefined);
      }
      // 任务投影立即刷新：底部任务 dock 马上出现并接管进度展示
      await useTasks.getState().load();
      loadRecent();
      // 回到初始态，便于连续导出下一本（格式与输出目录保持不变）
      setRaw("");
      setPhase("idle");
      setMeta(null);
      setValidation(null);
      setImported(false);
      setOpId(null);
      setAutoImportedFor(null);
    } catch (e) {
      setCreateError(toAppError(e).userMessage);
    } finally {
      setCreating(false);
    }
  }

  const canExport = imported && formats.length > 0 && !!outputDir;

  const authHint = auth.waiting
    ? "已在弹出浏览器中打开微信读书登录页，请使用微信扫码（300 秒内完成）。"
    : auth.status === "checking"
      ? "正在检查本机登录会话…"
      : "登录后即可抓取并导出你有权阅读的书籍。";

  return (
    <div className="flex max-w-[860px] flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold text-ink">导出书籍</h1>
        <p className="text-sm text-muted">
          粘贴微信读书的书籍链接或书籍 ID，导出为精排 PDF / EPUB / Markdown，自动存入书库。
        </p>
      </div>

      {(auth.status !== "in" || auth.waiting) && (
        <section className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-5 py-3.5">
          <StatusPill tone="neutral">
            {auth.waiting
              ? "等待扫码"
              : auth.status === "checking" || auth.status === "unknown"
                ? "检查中…"
                : "未登录"}
          </StatusPill>
          <div className="min-w-0 flex-1 basis-64">
            <p className="text-sm text-muted">{authHint}</p>
            {auth.lastError && <p className="text-sm text-negative-text">{auth.lastError}</p>}
          </div>
          <div className="flex items-center gap-2">
            {auth.waiting ? (
              <Button onClick={() => void auth.cancelLogin()}>取消</Button>
            ) : (
              auth.status !== "checking" && (
                <>
                  <Button variant="ghost" onClick={() => void auth.check()}>
                    重新检查
                  </Button>
                  <Button variant="primary" onClick={() => void auth.startLogin()}>
                    登录微信读书
                  </Button>
                </>
              )
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void parse()}
            placeholder="粘贴微信读书书籍链接或 ID"
            spellCheck={false}
            className="h-11 flex-1 rounded-full border border-line bg-surface px-5 text-[15px] text-ink outline-none placeholder:text-faint focus:border-[var(--data)]"
            aria-label="微信读书书籍链接或 ID"
          />
          <Button size="lg" variant="secondary" disabled={phase === "parsing"} onClick={() => void pasteAndFetch()}>
            粘贴并获取
          </Button>
          <Button size="lg" variant="primary" disabled={phase === "parsing" || !raw.trim()} onClick={() => void parse()}>
            {phase === "parsing" ? "获取中…" : "获取书籍"}
          </Button>
        </div>
        {error && <p className="text-sm text-negative-text">{error}</p>}
        {phase === "parsing" && (
          <p className="text-sm text-faint">正在通过引擎获取书籍信息（需要启动浏览器，约数秒）…</p>
        )}
      </section>

      {meta && (
        <section className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5">
          <div className="flex gap-5">
            <BookCover path={meta.cover_path} title={meta.title} width={88} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2.5">
                <h2 className="truncate text-base font-semibold">{meta.title || "未知书名"}</h2>
                {imported && <StatusPill tone="positive">已就绪</StatusPill>}
                {validation && !validation.ok && <StatusPill tone="negative">不可用</StatusPill>}
              </div>
              {meta.author && <p className="text-sm text-muted">{meta.author}</p>}
              {validation && !validation.ok && validation.user_message && (
                <p className="text-sm text-negative-text">{validation.user_message}</p>
              )}
            </div>
          </div>

          {validation?.ok && (
            <>
              <div className="flex flex-col gap-2 border-t border-rule pt-4">
                <span className="text-sm font-medium">导出格式</span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="导出格式（可多选）">
                  {FORMATS.map((f) => {
                    const selected = formats.includes(f.key);
                    return (
                      <button
                        key={f.key}
                        onClick={() =>
                          setFormats((prev) =>
                            prev.includes(f.key) ? prev.filter((x) => x !== f.key) : [...prev, f.key],
                          )
                        }
                        aria-pressed={selected}
                        title={f.hint}
                        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                          selected ? "bg-raised text-ink" : "border border-line text-muted hover:bg-raised/60"
                        }`}
                      >
                        {selected && <Check size={13} strokeWidth={2} aria-hidden="true" />}
                        {f.name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-faint">
                  {FORMATS.map((f) => `${f.name}：${f.hint}`).join(" · ")}
                </p>
              </div>

              <div className="flex items-center gap-4 border-t border-rule pt-4">
                <span className="flex-none text-sm font-medium">保存到</span>
                <span className="selectable min-w-0 flex-1 truncate text-sm text-muted" title={outputDir}>
                  {outputDir || "—"}
                </span>
                <Button onClick={() => void pickDir()}>更改…</Button>
              </div>

              {createError && <p className="text-sm text-negative-text">{createError}</p>}

              <Button
                variant="primary"
                className="self-start"
                disabled={creating || !canExport}
                onClick={() => void createTasks()}
              >
                {creating
                  ? "创建中…"
                  : `开始导出（${formats.map((f) => FORMATS.find((x) => x.key === f)?.name).join(" + ")}）`}
              </Button>
              <p className="-mt-3 text-xs text-faint">
                同名文件将被覆盖；抓取速度固定为温和模式，整本导出需要较长时间，可在底部任务栏随时取消与继续。
              </p>
            </>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-ink">支持的格式</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {FORMATS.map((f) => (
            <div key={f.key} className="rounded-card border border-line bg-[var(--well)] p-4">
              <p className="text-sm font-medium text-ink">{f.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{f.hint}</p>
            </div>
          ))}
        </div>
      </section>

      {recent !== null && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">最近导出</h2>
            {recent.length > 0 && (
              <Button variant="ghost" onClick={() => goto("library")}>
                前往书库
              </Button>
            )}
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-faint">
              还没有导出记录——第一次导出完成后，最近的书会显示在这里。
            </p>
          ) : (
            <div className="flex flex-wrap gap-5">
              {recent.map((b) => (
                <button
                  key={b.bookId}
                  onClick={() => goto("library")}
                  className="group flex w-[96px] flex-none flex-col gap-1.5 text-left"
                  aria-label={`在书库中查看《${b.title}》`}
                >
                  <BookCover fill path={b.coverPath} title={b.title} />
                  <span className="line-clamp-1 font-serif text-[13px] leading-snug underline-offset-2 group-hover:underline">
                    {b.title}
                  </span>
                  <span className="truncate text-[11px] text-faint">
                    {b.files
                      .map((f) => (f.format === "markdown" ? "Markdown" : f.format.toUpperCase()))
                      .join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
