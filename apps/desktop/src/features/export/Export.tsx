import { useEffect, useState, type ReactNode } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { Check } from "lucide-react";
import { api, toAppError } from "../../services/api";
import { useNav } from "../../stores/nav";
import { useSettings } from "../../stores/settings";
import { useAuth } from "../../stores/auth";
import { extractBookId, looksLikeBookId } from "../../utils/bookId";
import type { BookMeta, BookValidation, ExportFormat } from "../../types";
import { Button } from "../../components/Button";
import { BookCover } from "../../components/BookCover";
import { SectionHeader } from "../../components/SectionHeader";
import { StatusPill } from "../../components/StatusPill";

type ParsePhase = "idle" | "parsing" | "ready" | "error";

const STEPS = ["选书", "格式", "选项", "确认"] as const;

const FORMATS: { key: ExportFormat; name: string; desc: string; note: string }[] = [
  {
    key: "pdf",
    name: "精排 PDF",
    desc: "大字号出版级排版，含封面、可点击目录与 PDF 书签大纲。",
    note: "适合 iPad 批注与打印；使用无头浏览器渲染，耗时较长。",
  },
  {
    key: "epub",
    name: "EPUB",
    desc: "双字体排版，内嵌目录树与原书插图。",
    note: "适合 Apple Books / Kindle 等阅读器。",
  },
  {
    key: "markdown",
    name: "Markdown",
    desc: "生成纯笔记版与 HTML 排版版两个文件。",
    note: "适合 Obsidian / Notion 等知识库。",
  },
];

/** 导出向导：选书 → 格式 → 选项 → 确认（docs/04 §4.2） */
export function Export() {
  const [step, setStep] = useState(1);

  // 第一步：选书
  const [raw, setRaw] = useState("");
  const [phase, setPhase] = useState<ParsePhase>("idle");
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [validation, setValidation] = useState<BookValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [opId, setOpId] = useState<string | null>(null);

  // 第二步：格式（多选，每格式一个任务）
  const [formats, setFormats] = useState<ExportFormat[]>([]);

  // 第三步：选项
  const { settings } = useSettings();
  const [outputDir, setOutputDir] = useState<string>("");

  // 第四步：确认
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const goto = useNav((s) => s.goto);
  const auth = useAuth();

  useEffect(() => {
    if (!outputDir) {
      const saved = settings?.["general.output_dir"];
      if (typeof saved === "string" && saved) setOutputDir(saved);
    }
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

  const canNext =
    (step === 1 && imported && !!meta) ||
    (step === 2 && formats.length > 0) ||
    step === 3;

  return (
    <div className="flex max-w-[860px] flex-col gap-8">
      <h1 className="text-2xl font-bold text-ink">导出书籍</h1>

      <StepIndicator step={step} />

      {step === 1 && (
        <>
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
                {meta.intro && <p className="selectable line-clamp-3 text-sm text-muted">{meta.intro}</p>}
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
                </div>
              </div>
            </section>
          )}
          {phase === "parsing" && (
            <p className="text-sm text-faint">正在通过引擎获取书籍信息（需要启动浏览器，约数秒）…</p>
          )}
        </>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="选择导出格式（可多选，每种格式生成一个任务）" />
          <div className="flex flex-col gap-2">
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
                  className={`flex flex-col gap-1 rounded-card border px-5 py-4 text-left transition-colors ${
                    selected ? "border-ink bg-raised" : "border-line bg-surface hover:bg-raised/60"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {selected && <Check size={14} strokeWidth={2} aria-hidden="true" />}
                    {f.name}
                  </span>
                  <span className="text-sm text-muted">{f.desc}</span>
                  <span className="text-xs text-faint">{f.note}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="导出选项" />
          <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
            <div className="flex items-center gap-4">
              <span className="w-24 flex-none text-sm font-medium">输出目录</span>
              <span className="selectable min-w-0 flex-1 truncate text-sm text-muted" title={outputDir}>
                {outputDir || "—"}
              </span>
              <Button onClick={() => void pickDir()}>选择目录…</Button>
            </div>
            <p className="text-xs text-faint">
              同名文件将被覆盖；为保证账号安全，抓取速度固定为温和模式（随机 8~20 秒翻页间隔），整本书导出通常需要较长时间。
            </p>
          </div>
        </section>
      )}

      {step === 4 && meta && (
        <section className="flex flex-col gap-4">
          <SectionHeader title="确认导出" />
          <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
            <div className="flex items-center gap-4">
              <BookCover path={meta.cover_path} title={meta.title} width={56} />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{meta.title}</span>
                {meta.author && <span className="text-xs text-muted">{meta.author}</span>}
              </div>
            </div>
            <SummaryRow label="导出格式">
              {formats.map((f) => FORMATS.find((x) => x.key === f)?.name).join("、")}
            </SummaryRow>
            <SummaryRow label="输出目录">{outputDir || "—"}</SummaryRow>
            <SummaryRow label="预计任务">
              {formats.length} 个任务，按顺序执行（同一时刻一个任务占用浏览器）
            </SummaryRow>
          </div>

          {auth.status !== "in" && (
            <div className="flex items-center gap-3 rounded-card bg-[var(--pill-warning-bg)] px-4 py-3">
              <p className="text-sm" style={{ color: "var(--pill-warning-ink)" }}>
                尚未登录微信读书。任务启动后会弹出浏览器等待扫码，也可以先登录。
              </p>
              <Button onClick={() => void auth.startLogin()}>登录</Button>
            </div>
          )}
          {createError && <p className="text-sm text-negative">{createError}</p>}

          <div>
            <Button variant="primary" disabled={creating} onClick={() => void createTasks()}>
              {creating ? "创建中…" : `创建 ${formats.length} 个导出任务`}
            </Button>
          </div>
        </section>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          className={step === 1 ? "invisible" : ""}
          onClick={() => setStep((s) => Math.max(1, s - 1))}
        >
          上一步
        </Button>
        {step < 4 ? (
          <Button variant="primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            下一步
          </Button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`向导第 ${STEPS[step - 1]} 步`}>
      {STEPS.map((label, i) => {
        const active = i + 1 === step;
        const done = i + 1 < step;
        return (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-6 bg-line" aria-hidden="true" />}
            <span
              className={`text-sm ${active ? "font-medium text-ink" : done ? "text-muted" : "text-faint"}`}
              aria-current={active ? "step" : undefined}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="w-20 flex-none text-sm text-muted">{label}</span>
      <span className="selectable min-w-0 flex-1 break-all text-sm">{children}</span>
    </div>
  );
}
