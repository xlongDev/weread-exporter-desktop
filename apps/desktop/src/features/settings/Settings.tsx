import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, toAppError } from "../../services/api";
import { useSettings } from "../../stores/settings";
import { useEngine } from "../../stores/engine";
import { useAuth } from "../../stores/auth";
import { applyTheme, type ThemeMode } from "../../stores/theme";
import type { PathsInfo } from "../../types";
import { Button } from "../../components/Button";
import { Select } from "../../components/Select";
import { StatusPill } from "../../components/StatusPill";

/** 设置：每区块 = 左侧标签列 + 右侧面板（docs/09 §5 / app-screens §8.2） */
export function Settings() {
  const { settings, loadError, load, set } = useSettings();
  const engine = useEngine();
  const auth = useAuth();
  const [paths, setPaths] = useState<PathsInfo | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    void api
      .paths()
      .then(setPaths)
      .catch((e) => setActionError(toAppError(e).userMessage));
    void getVersion().then(setAppVersion).catch(() => setAppVersion("unknown"));
  }, [load]);

  async function write(key: string, value: unknown, label: string) {
    try {
      await set(key, value);
      setSaved(label);
      setActionError(null);
      window.setTimeout(() => setSaved((s) => (s === label ? null : s)), 1500);
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

  const themeMode = (settings?.["general.theme"] as ThemeMode) ?? "system";
  const outputDir = (settings?.["general.output_dir"] as string) ?? paths?.default_output_dir ?? "";

  return (
    <div className="flex max-w-[1152px] flex-col gap-8">
      <h1 className="text-2xl font-bold text-ink">设置</h1>

      {loadError && (
        <p className="text-sm text-negative">
          设置读取失败：{loadError}
          <button className="ml-2 underline" onClick={() => void load()}>
            重试
          </button>
        </p>
      )}
      {actionError && <p className="text-sm text-negative">{actionError}</p>}

      <SettingSection
        title="外观"
        description="界面跟随系统，或手动选择浅色 / 深色。选择会立即生效并记住。"
      >
        <FieldRow label="主题">
          <Select
            value={themeMode}
            onChange={(e) => {
              const mode = e.target.value as ThemeMode;
              applyTheme(mode);
              void write("general.theme", mode, "theme");
            }}
          >
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </Select>
          {saved === "theme" && <SavedStamp />}
        </FieldRow>
      </SettingSection>

      <SettingSection
        title="导出"
        description="导出文件的默认保存位置。每次导出前也可以临时更改。"
      >
        <FieldRow label="默认导出目录">
          <span className="selectable max-w-[420px] truncate text-sm text-muted" title={outputDir}>
            {outputDir || "—"}
          </span>
          <Button onClick={() => void pickOutputDir()}>选择目录…</Button>
          {saved === "output_dir" && <SavedStamp />}
        </FieldRow>
        <FieldRow label="导出格式">
          <span className="text-sm text-muted">
            PDF / EPUB / Markdown（引擎实际支持的格式，导出时可多选）
          </span>
        </FieldRow>
      </SettingSection>

      <SettingSection
        title="数据与隐私"
        description="任务记录、设置与浏览器会话均保存在本机，不会上传。"
      >
        <FieldRow label="数据目录">
          <span
            className="selectable max-w-[420px] truncate text-sm text-muted"
            title={paths?.app_data}
          >
            {paths?.app_data ?? "—"}
          </span>
          <Button onClick={() => void revealDataDir()}>打开</Button>
        </FieldRow>
        <FieldRow label="登录会话">
          <span className="text-sm text-muted">
            微信读书登录态保存在本机浏览器配置目录，可随时清除。
          </span>
          {auth.status === "in" && <StatusPill tone="positive">已登录</StatusPill>}
          {auth.status === "out" && <StatusPill tone="neutral">未登录</StatusPill>}
          {auth.status === "checking" && <StatusPill tone="neutral">检查中…</StatusPill>}
          <Button onClick={() => void auth.logout()}>退出登录</Button>
        </FieldRow>
      </SettingSection>

      <SettingSection title="关于" description="版本与开源信息。">
        <FieldRow label="应用版本">
          <span className="tnum text-sm text-muted">{appVersion || "—"}</span>
        </FieldRow>
        <FieldRow label="导出引擎">
          <span className="tnum text-sm text-muted">
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
        </FieldRow>
        <FieldRow label="开源许可">
          <span className="text-sm text-muted">
            MIT License · 基于开源项目{" "}
            <button
              className="text-data underline underline-offset-2"
              onClick={() => void openUrl("https://github.com/WANGXIN-567/weread-book-exporter").catch(() => {})}
            >
              weread-book-exporter
            </button>
          </span>
        </FieldRow>
      </SettingSection>
    </div>
  );
}

function SavedStamp() {
  return <span className="text-xs text-faint">已保存</span>;
}

function SettingSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-[440px_1fr] gap-6 border-t border-rule pt-8 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <div className="flex flex-col gap-4 rounded-2xl bg-[var(--well)] p-4">{children}</div>
    </section>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-28 flex-none text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}
