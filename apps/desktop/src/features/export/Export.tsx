import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { Check } from "lucide-react";
import { api, toAppError } from "../../services/api";
import { useNav } from "../../stores/nav";
import { useSettings } from "../../stores/settings";
import { useAuth } from "../../stores/auth";
import { extractBookId, looksLikeBookId } from "../../utils/bookId";
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

  const goto = useNav((s) => s.goto);
  const auth = useAuth();
  const { settings } = useSettings();

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
      goto("tasks");
    } catch (e) {
      setCreateError(toAppError(e).userMessage);
    } finally {
      setCreating(false);
    }
  }

  const canExport = imported && formats.length > 0 && !!outputDir;

  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <h1 className="text-2xl font-bold text-ink">导出书籍</h1>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void parse()}
            placeholder="粘贴微信读书书籍链接或 ID"
            spellCheck={false}
            className="h-9 flex-1 rounded-[6px] border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-faint focus:border-[var(--data)]"
            aria-label="微信读书书籍链接或 ID"
          />
          <Button variant="secondary" disabled={phase === "parsing"} onClick={() => void pasteAndFetch()}>
            粘贴并获取
          </Button>
          <Button variant="primary" disabled={phase === "parsing" || !raw.trim()} onClick={() => void parse()}>
            {phase === "parsing" ? "获取中…" : "获取书籍"}
          </Button>
        </div>
        {error && <p className="text-sm text-negative-text">{error}</p>}
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
              {validation && !validation.logged_in && validation.ok && (
                <p className="text-sm text-warning-text">尚未登录：导出前需要先登录微信读书。</p>
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

              {auth.status !== "in" && (
                <div className="flex items-center gap-3 rounded-card bg-[var(--pill-warning-bg)] px-4 py-2.5">
                  <p className="text-sm" style={{ color: "var(--pill-warning-ink)" }}>
                    尚未登录微信读书，开始导出时会弹出浏览器等待扫码。
                  </p>
                  <Button onClick={() => void auth.startLogin()}>登录</Button>
                </div>
              )}
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
                同名文件将被覆盖；抓取速度固定为温和模式，整本导出需要较长时间，可在任务中心随时取消与继续。
              </p>
            </>
          )}
        </section>
      )}

      {phase === "parsing" && (
        <p className="text-sm text-faint">正在通过引擎获取书籍信息（需要启动浏览器，约数秒）…</p>
      )}
    </div>
  );
}
