import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Monitor, Moon, Sun } from "lucide-react";
import { api, toAppError } from "../../services/api";
import { useSettings } from "../../stores/settings";
import { useEngine } from "../../stores/engine";
import { useAuth } from "../../stores/auth";
import { applyTheme, type ThemeMode } from "../../stores/theme";
import type { PathsInfo } from "../../types";
import { Button } from "../../components/Button";
import { StatusPill } from "../../components/StatusPill";
import { compareVersions, fetchLatestRelease, installCommand } from "../../utils/update";

type UpdateStatus =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "latest" }
  | { status: "available"; tag: string; url: string }
  | { status: "error" };

/** 设置：玻璃卡片模块化网格——每区一张卡，字段纵向堆叠（docs/09 §4） */
export function Settings() {
  const { settings, loadError, load, set } = useSettings();
  const engine = useEngine();
  const auth = useAuth();
  const [paths, setPaths] = useState<PathsInfo | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateStatus>({ status: "idle" });
  const [namingDraft, setNamingDraft] = useState("");

  useEffect(() => {
    void load();
    void api
      .paths()
      .then(setPaths)
      .catch((e) => setActionError(toAppError(e).userMessage));
    void getVersion().then(setAppVersion).catch(() => setAppVersion("unknown"));
  }, [load]);

  // 文件名模板草稿：跟随已保存设置刷新（保存后与本地草稿对齐）
  useEffect(() => {
    const v = settings?.["export.naming"];
    setNamingDraft(typeof v === "string" ? v : "");
  }, [settings]);

  async function write(key: string, value: unknown, label: string) {
    try {
      await set(key, value);
      flashSaved(label);
      setActionError(null);
    } catch (e) {
      setActionError(toAppError(e).userMessage);
    }
  }

  function flashSaved(label: string) {
    setSaved(label);
    window.setTimeout(() => {
      setSaved((cur) => (cur === label ? null : cur));
    }, 1600);
  }

  async function pickOutputDir() {
    try {
      const dir = await open({ directory: true, multiple: false });
      if (typeof dir === "string") {
        await write("general.output_dir", dir, "output_dir");
      }
    } catch (e) {
      setActionError(toAppError(e).userMessage);
    }
  }

  async function revealDataDir() {
    if (!paths) return;
    try {
      await api.revealPath(paths.app_data);
      setActionError(null);
    } catch (e) {
      setActionError(toAppError(e).userMessage);
    }
  }

  async function checkUpdate() {
    setUpdate({ status: "checking" });
    const release = await fetchLatestRelease();
    if (!release) {
      setUpdate({ status: "error" });
      return;
    }
    setUpdate(
      compareVersions(release.tag, appVersion) > 0
        ? { status: "available", tag: release.tag, url: release.url }
        : { status: "latest" },
    );
  }

  async function copyInstallCommand() {
    try {
      await writeText(installCommand(navigator.userAgent));
      flashSaved("install_cmd");
    } catch (e) {
      setActionError(toAppError(e).userMessage);
    }
  }

  async function copyDiagnostics() {
    try {
      const text = await api.diagnostics();
      await writeText(text);
      flashSaved("diagnostics");
      setActionError(null);
    } catch (e) {
      setActionError(toAppError(e).userMessage);
    }
  }

  const themeMode = (settings?.["general.theme"] as ThemeMode) ?? "system";
  const outputDir = (settings?.["general.output_dir"] as string) ?? paths?.default_output_dir ?? "";

  return (
    <div className="flex min-h-full flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold text-ink">设置</h1>
        <p className="text-sm text-muted">应用偏好与本地数据管理，全部保存在本机。</p>
      </div>

      {loadError && (
        <p className="text-sm text-negative-text">
          设置读取失败：{loadError}
          <button className="ml-2 underline" onClick={() => void load()}>
            重试
          </button>
        </p>
      )}
      {actionError && <p className="text-sm text-negative-text">{actionError}</p>}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <SettingsCard
          title="外观"
          description="界面跟随系统，或手动选择浅色 / 深色，立即生效并记住。"
        >
          <Field label="主题">
            <ThemeSwitcher
              value={themeMode}
              onChange={(mode) => {
                applyTheme(mode);
                void write("general.theme", mode, "theme");
              }}
            />
          </Field>
        </SettingsCard>

        <SettingsCard
          title="导出"
          description="默认保存位置与命名规则，导出前也可以临时更改。"
        >
          <Field label="默认导出目录">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="selectable min-w-0 flex-1 truncate text-sm text-muted"
                title={outputDir}
              >
                {outputDir || "—"}
              </span>
              <Button onClick={() => void pickOutputDir()}>选择目录…</Button>
            </div>
            {saved === "output_dir" && <SavedStamp />}
          </Field>
          <Field label="文件名模板">
            <div className="flex flex-col gap-1.5">
              <input
                value={namingDraft}
                onChange={(e) => setNamingDraft(e.target.value)}
                onBlur={() => void saveNaming()}
                onKeyDown={(e) => e.key === "Enter" && void saveNaming()}
                placeholder="留空使用默认命名"
                spellCheck={false}
                className="input-glass h-9 w-full rounded-full px-3.5 text-sm outline-none placeholder:text-faint"
                aria-label="导出文件名模板"
              />
              <p className="text-xs text-faint">
                可用占位符：<code className="tnum">{"{书名}"} {"{作者}"} {"{格式}"} {"{日期}"}</code>
                ；失焦或回车保存，例：<code className="tnum">{"{书名}"}-{"{作者}"}</code>
              </p>
            </div>
            {saved === "naming" && <SavedStamp />}
          </Field>
        </SettingsCard>

        <SettingsCard
          title="数据与隐私"
          description="任务记录、设置与浏览器会话均保存在本机，不会上传。"
        >
          <Field label="数据目录">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="selectable min-w-0 flex-1 truncate text-sm text-muted"
                title={paths?.app_data}
              >
                {paths?.app_data ?? "—"}
              </span>
              <Button onClick={() => void revealDataDir()}>打开</Button>
            </div>
          </Field>
          <Field label="登录会话">
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-muted">
                登录态保存在本机浏览器配置目录，可随时清除。
              </span>
              {auth.status === "in" && <StatusPill tone="positive">已登录</StatusPill>}
              {auth.status === "out" && <StatusPill tone="neutral">未登录</StatusPill>}
              {auth.status === "checking" && <StatusPill tone="neutral">检查中…</StatusPill>}
              <Button onClick={() => void auth.logout()}>退出登录</Button>
            </div>
          </Field>
        </SettingsCard>

        <SettingsCard title="关于" description="版本与开源信息。">
          <Field label="应用版本">
            <span className="tnum text-sm text-muted">{appVersion || "—"}</span>
          </Field>
          <Field label="检查更新">
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 text-sm text-muted">
                {update.status === "idle" && "从 GitHub Releases 检查新版本"}
                {update.status === "checking" && "检查中…"}
                {update.status === "latest" && `已是最新（${appVersion}）`}
                {update.status === "available" && `发现新版本 ${update.tag}（当前 ${appVersion}）`}
                {update.status === "error" && "检查失败（需要能访问 GitHub），请稍后重试"}
              </span>
              {update.status === "idle" && (
                <Button onClick={() => void checkUpdate()}>检查更新</Button>
              )}
              {update.status === "checking" && <Button disabled>检查中…</Button>}
              {update.status === "error" && (
                <Button onClick={() => void checkUpdate()}>重试</Button>
              )}
              {update.status === "available" && (
                <>
                  <Button onClick={() => void openUrl(update.url).catch(() => {})}>打开发布页</Button>
                  <Button variant="ghost" onClick={() => void copyInstallCommand()}>
                    复制安装命令
                  </Button>
                </>
              )}
            </div>
          </Field>
          <Field label="诊断信息">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted">
                复制版本、近期失败任务与应用日志（已脱敏），问题反馈时附上可加快定位。
              </p>
              <div className="flex items-center gap-2">
                <Button onClick={() => void copyDiagnostics()}>复制诊断信息</Button>
                {saved === "diagnostics" && <SavedStamp />}
              </div>
            </div>
          </Field>
          <Field label="导出引擎">
            <div className="flex min-w-0 items-center gap-2">
              <span className="tnum min-w-0 flex-1 truncate text-sm text-muted">
                {engine.status === "ready" && `v${engine.engineVersion} · Python ${engine.pythonVersion}`}
                {engine.status === "checking" && "检查中…"}
                {engine.status === "unknown" && "—"}
                {(engine.status === "error" || (engine.status === "ready" && !engine.engineVersion)) &&
                  (engine.error ?? "引擎不可用")}
              </span>
              {engine.status === "ready" && <StatusPill tone="positive">就绪</StatusPill>}
              {engine.status === "error" && (
                <>
                  <StatusPill tone="negative">异常</StatusPill>
                  <Button variant="ghost" onClick={() => void engine.refresh()}>
                    重试
                  </Button>
                </>
              )}
            </div>
          </Field>
          <Field label="开源许可">
            <span className="text-sm text-muted">
              MIT License · 基于开源项目{" "}
              <button
                className="text-data underline underline-offset-2"
                onClick={() => void openUrl("https://github.com/WANGXIN-567/weread-book-exporter").catch(() => {})}
              >
                weread-book-exporter
              </button>
            </span>
          </Field>
        </SettingsCard>
      </div>
    </div>
  );

  async function saveNaming() {
    const savedValue = typeof settings?.["export.naming"] === "string" ? (settings?.["export.naming"] as string) : "";
    if (namingDraft.trim() === savedValue.trim()) return;
    await write("export.naming", namingDraft.trim(), "naming");
  }
}

function SavedStamp() {
  return <span className="text-xs text-faint">已保存</span>;
}

const THEME_OPTIONS: { key: ThemeMode; label: string; icon: typeof Monitor }[] = [
  { key: "system", label: "跟随系统", icon: Monitor },
  { key: "light", label: "浅色", icon: Sun },
  { key: "dark", label: "深色", icon: Moon },
];

/** 三档主题切换器：横向分段 + 滑块 320ms 弹性滑动（iOS 分段控件风格） */
function ThemeSwitcher({
  value,
  onChange,
}: {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}) {
  const index = Math.max(
    0,
    THEME_OPTIONS.findIndex((o) => o.key === value),
  );
  return (
    <div
      role="radiogroup"
      aria-label="主题"
      className="relative grid w-full grid-cols-3 rounded-full bg-raised p-1"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 w-[calc((100%-8px)/3)] rounded-full border border-line bg-surface shadow-[0_2px_10px_rgba(0,0,0,0.18)] [transition:transform_320ms_cubic-bezier(0.32,0.72,0,1)]"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {THEME_OPTIONS.map(({ key, label, icon: Icon }) => {
        const selected = value === key;
        return (
          <button
            key={key}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(key)}
            className={`relative z-10 flex h-8 items-center justify-center gap-1.5 rounded-full text-sm transition-colors duration-200 ${
              selected ? "font-medium text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** 玻璃卡片：设置区标题 + 描述 + 字段（半透明填充，不再嵌套 blur） */
function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-[var(--well)] p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="text-xs leading-relaxed text-muted">{description}</p>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** 字段：标签在上，控件在下（窄卡片内的纵向堆叠布局） */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      {children}
    </div>
  );
}
