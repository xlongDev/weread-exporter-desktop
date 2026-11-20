import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { api, toAppError } from "../../services/api";
import { useSettings } from "../../stores/settings";
import { useEngine } from "../../stores/engine";
import { useAuth } from "../../stores/auth";
import { applyTheme, type ThemeMode } from "../../stores/theme";
import type { PathsInfo } from "../../types";
import { Button } from "../../components/Button";
import { StatusPill } from "../../components/StatusPill";
import { t, useT, useI18n, type Lang } from "../../i18n";
import {
  checkViaUpdater,
  compareVersions,
  downloadAndInstall,
  fetchLatestRelease,
  installCommand,
} from "../../utils/update";

type UpdateStatus =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "latest" }
  | { status: "available"; tag: string; url: string | null } // url=null 时可应用内更新
  | { status: "downloading"; downloaded: number; total: number | null }
  | { status: "installed" }
  | { status: "error" };

// 排版选项（key 存设置表；"default" = 引擎内置排版，engine/export_book.py 同一套预设）
const FONT_SIZE_OPTIONS = [
  { key: "12", label: "小 12" },
  { key: "default", label: "标准" },
  { key: "15", label: "大 15" },
  { key: "17", label: "特大 17" },
];
const PAGE_MARGIN_OPTIONS = [
  { key: "narrow", label: "窄" },
  { key: "default", label: "标准" },
  { key: "wide", label: "宽" },
];
// 一键排版预设（写入 export.font_size + export.page_margin 两个键；命中当前组合的预设高亮）
const LAYOUT_PRESETS = [
  { key: "eink", label: "e-ink / Kindle", font: "17", margin: "wide" },
  { key: "phone", label: "手机", font: "12", margin: "narrow" },
  { key: "print", label: "打印", font: "default", margin: "default" },
] as const;

/** 设置：玻璃卡片模块化网格——每区一张卡，字段纵向堆叠（docs/09 §4） */
export function Settings() {
  const t = useT();
  const { settings, loadError, load, set } = useSettings();
  const engine = useEngine();
  const auth = useAuth();
  const [paths, setPaths] = useState<PathsInfo | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateStatus>({ status: "idle" });
  const [namingDraft, setNamingDraft] = useState("");
  const [proxyDraft, setProxyDraft] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

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
    const pv = settings?.["general.update_proxy"];
    setProxyDraft(typeof pv === "string" ? pv : "");
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

  async function applyPreset(p: (typeof LAYOUT_PRESETS)[number]) {
    try {
      await set("export.font_size", p.font);
      await set("export.page_margin", p.margin);
      flashSaved("preset");
      setActionError(null);
    } catch (e) {
      setActionError(toAppError(e).userMessage);
    }
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
    // 优先应用内更新端点（updater + minisign 校验）；latest.json 未挂上时回退 GitHub API 比对
    const proxy = proxyDraft.trim() || undefined;
    const via = await checkViaUpdater(proxy);
    if (via.kind === "available") {
      setUpdate({ status: "available", tag: via.version, url: null });
      return;
    }
    if (via.kind === "latest") {
      setUpdate({ status: "latest" });
      return;
    }
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

  async function installUpdate() {
    setUpdate({ status: "downloading", downloaded: 0, total: null });
    try {
      await downloadAndInstall((p) => setUpdate({ status: "downloading", ...p }), proxyDraft.trim() || undefined);
      setUpdate({ status: "installed" });
    } catch {
      setUpdate({ status: "error" });
    }
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

  const lang = (useI18n((s) => s.lang));
  const setLang = useI18n((s) => s.setLang);
  const themeMode = (settings?.["general.theme"] as ThemeMode) ?? "system";
  const outputDir = (settings?.["general.output_dir"] as string) ?? paths?.default_output_dir ?? "";
  const fontSize = (settings?.["export.font_size"] as string) || "default";
  const pageMargin = (settings?.["export.page_margin"] as string) || "default";

  // 文件名实时预览：示例书渲染，与引擎 build_base_name 同规则（留空 = 直接用书名）
  const todayTag = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const previewBase = (() => {
    const tmpl = namingDraft.trim();
    const name = tmpl
      ? tmpl
          .replace("{书名}", "华丽人生")
          .replace("{作者}", "伊坂幸太郎")
          .replace("{格式}", "PDF")
          .replace("{日期}", todayTag)
      : "华丽人生";
    return name.replace(/[<>:"/\\|?*]/g, "_").trim() || "华丽人生";
  })();

  return (
    <div className="flex min-h-full flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold text-ink">{t("设置")}</h1>
        <p className="text-sm text-muted">{t("应用偏好与本地数据管理，全部保存在本机。")}</p>
      </div>

      {loadError && (
        <p className="text-sm text-negative-text">
          {t("设置读取失败：{msg}", { msg: loadError })}
          <button className="ml-2 underline" onClick={() => void load()}>
            {t("重试")}
          </button>
        </p>
      )}
      {actionError && <p className="text-sm text-negative-text">{actionError}</p>}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <SettingsCard
          title={t("外观")}
          description={t("界面跟随系统，或手动选择浅色 / 深色，立即生效并记住。")}
          span
        >
          <FieldRow label={t("主题")}>
            <ThemeSwitcher
              value={themeMode}
              onChange={(mode) => {
                applyTheme(mode);
                void write("general.theme", mode, "theme");
              }}
            />
          </FieldRow>
          <FieldRow label={t("语言")}>
            <SegmentedControl
              label={t("语言")}
              value={lang}
              options={[
                { key: "zh", label: "中文" },
                { key: "en", label: "English" },
              ]}
              onChange={(v) => {
                setLang(v as Lang);
                void write("general.language", v, "language");
              }}
            />
          </FieldRow>
        </SettingsCard>

        <SettingsCard
          title={t("导出")}
          description={t("默认保存位置、命名规则与正文排版，导出新任务时应用。")}
        >
          <FieldRow label={t("默认导出目录")}>
            <span
              className="selectable min-w-0 flex-1 truncate text-sm text-muted"
              title={outputDir}
            >
              {outputDir || "—"}
            </span>
            <Button onClick={() => void pickOutputDir()}>{t("选择目录…")}</Button>
            {saved === "output_dir" && <SavedStamp />}
          </FieldRow>
          <FieldRow label={t("文件名模板")}>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <input
                ref={nameInputRef}
                value={namingDraft}
                onChange={(e) => setNamingDraft(e.target.value)}
                onBlur={() => void saveNaming()}
                onKeyDown={(e) => e.key === "Enter" && void saveNaming()}
                placeholder={t("留空则直接使用书名")}
                spellCheck={false}
                className="input-glass h-9 w-full rounded-full px-3.5 text-sm outline-none placeholder:text-faint"
                aria-label={t("导出文件名模板")}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-faint">{t("点击插入")}</span>
                {NAME_PLACEHOLDERS.map((p) => (
                  <button
                    key={p}
                    onClick={() => insertPlaceholder(p)}
                    className="tnum rounded-full border border-line bg-[var(--well)] px-2 py-0.5 text-xs text-muted transition-colors hover:border-[var(--control)] hover:text-ink"
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-[12px] bg-[var(--well)] px-3 py-2">
                <span className="flex-none text-xs text-faint">{t("预览")}</span>
                <span className="tnum min-w-0 flex-1 truncate text-sm text-ink">{previewBase}.pdf</span>
                <span className="flex-none text-[11px] text-faint">{t("示例")}</span>
              </div>
            </div>
            {saved === "naming" && <SavedStamp />}
          </FieldRow>
          <FieldRow label={t("排版预设")}>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {LAYOUT_PRESETS.map((p) => {
                const active = fontSize === p.font && pageMargin === p.margin;
                return (
                  <button
                    key={p.key}
                    onClick={() => void applyPreset(p)}
                    aria-pressed={active}
                    className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                      active ? "bg-raised text-ink" : "border border-line text-muted hover:bg-raised/60"
                    }`}
                  >
                    {active && <Check size={13} strokeWidth={2} aria-hidden="true" />}
                    {t(p.label)}
                  </button>
                );
              })}
              {saved === "preset" && <SavedStamp />}
            </div>
          </FieldRow>
          <FieldRow label={t("正文字号")}>
            <SegmentedControl
              label={t("正文字号")}
              value={fontSize}
              options={FONT_SIZE_OPTIONS}
              onChange={(v) => void write("export.font_size", v, "font_size")}
            />
            {saved === "font_size" && <SavedStamp />}
          </FieldRow>
          <FieldRow label={t("PDF 页边距")}>
            <SegmentedControl
              label={t("PDF 页边距")}
              value={pageMargin}
              options={PAGE_MARGIN_OPTIONS}
              onChange={(v) => void write("export.page_margin", v, "page_margin")}
            />
            {saved === "page_margin" && <SavedStamp />}
          </FieldRow>
          <p className="text-xs text-faint">
            {t("字号对 PDF 与 EPUB 正文生效，页边距仅 PDF；标准 = 内置排版，导出新任务时应用。")}
          </p>
        </SettingsCard>

        <SettingsCard
          title={t("数据与隐私")}
          description={t("任务记录、设置与浏览器会话均保存在本机，不会上传。")}
        >
          <FieldRow label={t("数据目录")}>
            <span
              className="selectable min-w-0 flex-1 truncate text-sm text-muted"
              title={paths?.app_data}
            >
              {paths?.app_data ?? "—"}
            </span>
            <Button onClick={() => void revealDataDir()}>{t("打开")}</Button>
          </FieldRow>
          <FieldRow label={t("登录会话")}>
            <span className="min-w-0 flex-1 truncate text-sm text-muted">
              {t("登录态保存在本机浏览器配置目录，可随时清除。")}
            </span>
            {auth.status === "in" && <StatusPill tone="positive">{t("已登录")}</StatusPill>}
            {auth.status === "out" && <StatusPill tone="neutral">{t("未登录")}</StatusPill>}
            {auth.status === "checking" && <StatusPill tone="neutral">{t("检查中…")}</StatusPill>}
            <Button onClick={() => void auth.logout()}>{t("退出登录")}</Button>
          </FieldRow>
        </SettingsCard>

        <SettingsCard title={t("关于")} description={t("版本与开源信息。")} span>
          <FieldRow label={t("应用版本")}>
            <span className="tnum text-sm text-muted">{appVersion || "—"}</span>
          </FieldRow>
          <FieldRow label={t("检查更新")}>
            <span className="min-w-0 flex-1 text-sm text-muted">
              {update.status === "idle" && t("从 GitHub Releases 检查新版本")}
              {update.status === "checking" && t("检查中…")}
              {update.status === "latest" && t("已是最新（{version}）", { version: appVersion })}
              {update.status === "available" && t("发现新版本 {tag}（当前 {version}）", { tag: update.tag, version: appVersion })}
              {update.status === "downloading" &&
                `下载中 ${update.downloaded >= 1048576 ? `${(update.downloaded / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(update.downloaded / 1024))} KB`}${update.total ? ` / ${(update.total / 1048576).toFixed(1)} MB` : ""}`}
              {update.status === "installed" && t("已安装，重启应用后生效（退出后重新打开即可）")}
              {update.status === "error" && t("检查失败（需要能访问 GitHub），请稍后重试")}
            </span>
            {update.status === "idle" && (
              <Button onClick={() => void checkUpdate()}>{t("检查更新")}</Button>
            )}
            {update.status === "checking" && <Button disabled>{t("检查中…")}</Button>}
            {update.status === "error" && (
              <Button onClick={() => void checkUpdate()}>{t("重试")}</Button>
            )}
            {update.status === "available" && update.url === null && (
              <Button variant="primary" onClick={() => void installUpdate()}>
                {t("下载并安装")}
              </Button>
            )}
            {update.status === "available" && update.url !== null && (
              <>
                <Button onClick={() => void openUrl(update.url as string).catch(() => {})}>{t("打开发布页")}</Button>
                <Button variant="ghost" onClick={() => void copyInstallCommand()}>
                  {t("复制安装命令")}
                </Button>
              </>
            )}
          </FieldRow>
          <FieldRow label={t("更新代理")}>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <input
                value={proxyDraft}
                onChange={(e) => setProxyDraft(e.target.value)}
                onBlur={() => void saveProxy()}
                onKeyDown={(e) => e.key === "Enter" && void saveProxy()}
                placeholder={t("留空直连；代理用户填 http://127.0.0.1:7897 这类地址")}
                spellCheck={false}
                className="input-glass h-9 w-full rounded-full px-3.5 text-sm outline-none placeholder:text-faint"
                aria-label={t("更新代理")}
              />
              <span className="text-xs text-faint">{t("应用内更新的下载通道不走系统代理，需在此显式填写。")}</span>
            </div>
            {saved === "update_proxy" && <SavedStamp />}
          </FieldRow>
          <FieldRow label={t("诊断信息")}>
            <span className="min-w-0 flex-1 text-sm text-muted">
              {t("复制版本、近期失败任务与应用日志（已脱敏），问题反馈时附上可加快定位。")}
            </span>
            <Button onClick={() => void copyDiagnostics()}>{t("复制诊断信息")}</Button>
            {saved === "diagnostics" && <SavedStamp />}
          </FieldRow>
          <FieldRow label={t("导出引擎")}>
            <span className="tnum min-w-0 flex-1 truncate text-sm text-muted">
              {engine.status === "ready" && `v${engine.engineVersion} · Python ${engine.pythonVersion}`}
              {engine.status === "checking" && t("检查中…")}
              {engine.status === "unknown" && "—"}
              {(engine.status === "error" || (engine.status === "ready" && !engine.engineVersion)) &&
                (engine.error ?? t("引擎不可用"))}
            </span>
            {engine.status === "ready" && <StatusPill tone="positive">{t("就绪")}</StatusPill>}
            {engine.status === "error" && (
              <>
                <StatusPill tone="negative">{t("异常")}</StatusPill>
                <Button variant="ghost" onClick={() => void engine.refresh()}>
                  {t("重试")}
                </Button>
              </>
            )}
          </FieldRow>
          <FieldRow label={t("开源许可")}>
            <span className="text-sm text-muted">
              {t("MIT License · 基于开源项目")}{" "}
              <button
                className="text-data underline underline-offset-2"
                onClick={() => void openUrl("https://github.com/WANGXIN-567/weread-book-exporter").catch(() => {})}
              >
                weread-book-exporter
              </button>
            </span>
          </FieldRow>
        </SettingsCard>
      </div>
    </div>
  );

  async function saveProxy() {
    const savedValue = typeof settings?.["general.update_proxy"] === "string" ? (settings?.["general.update_proxy"] as string) : "";
    if (proxyDraft.trim() === savedValue.trim()) return;
    await write("general.update_proxy", proxyDraft.trim(), "update_proxy");
  }

  async function saveNaming() {
    const savedValue = typeof settings?.["export.naming"] === "string" ? (settings?.["export.naming"] as string) : "";
    if (namingDraft.trim() === savedValue.trim()) return;
    await write("export.naming", namingDraft.trim(), "naming");
  }

  // 占位符一键插入到光标处
  function insertPlaceholder(placeholder: string) {
    const input = nameInputRef.current;
    const start = input?.selectionStart ?? namingDraft.length;
    const end = input?.selectionEnd ?? start;
    const next = namingDraft.slice(0, start) + placeholder + namingDraft.slice(end);
    setNamingDraft(next);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  }
}

function SavedStamp() {
  return <span className="text-xs text-faint">{t("已保存")}</span>;
}

const THEME_OPTIONS: { key: ThemeMode; label: string; icon: typeof Monitor }[] = [
  { key: "system", label: "跟随系统", icon: Monitor },
  { key: "light", label: "浅色", icon: Sun },
  { key: "dark", label: "深色", icon: Moon },
];

const NAME_PLACEHOLDERS = ["{书名}", "{作者}", "{格式}", "{日期}"];

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
      aria-label={t("主题")}
      className="relative grid min-w-0 flex-1 max-w-[480px] grid-cols-3 rounded-full bg-raised p-1"
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
            {t(label)}
          </button>
        );
      })}
    </div>
  );
}

/** 玻璃卡片：设置区标题 + 描述 + 字段行（span = 通栏卡，宽窗口下撑满网格行） */
function SettingsCard({
  title,
  description,
  span = false,
  children,
}: {
  title: string;
  description: string;
  span?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-3.5 rounded-[20px] border border-line bg-[var(--well)] p-5 ${
        span ? "lg:col-span-2" : ""
      }`}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="text-xs leading-relaxed text-muted">{description}</p>
      </div>
      <div className="flex flex-col gap-3.5">{children}</div>
    </section>
  );
}

/** 字段行：标签居左（w-24），控件居右弹性填充 */
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <span className="w-24 flex-none text-[13px] font-medium text-ink">{label}</span>
      {children}
    </div>
  );
}

/** 分段单选（ThemeSwitcher 的无图标泛化）：N 档滑块 + 320ms 滑动 */
function SegmentedControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { key: string; label: string }[];
  onChange: (key: string) => void;
}) {
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative grid min-w-0 flex-1 max-w-[480px] rounded-full bg-raised p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-full border border-line bg-surface shadow-[0_2px_10px_rgba(0,0,0,0.18)] [transition:transform_320ms_cubic-bezier(0.32,0.72,0,1)]"
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map(({ key, label: l }) => {
        const selected = value === key;
        return (
          <button
            key={key}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(key)}
            className={`relative z-10 flex h-8 items-center justify-center rounded-full text-sm transition-colors duration-200 ${
              selected ? "font-medium text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
