/** 设置页「检查更新」：GitHub Releases 最新版比对 + 一键安装命令生成。 */

const RELEASE_API = "https://api.github.com/repos/xlongDev/weread-exporter-desktop/releases/latest";
const SCRIPTS_RAW = "https://raw.githubusercontent.com/xlongDev/weread-exporter-desktop/main/scripts";

/** 语义化版本号比较（主.次.修订）：a>b 返回 1，a<b 返回 -1，相等返回 0；非数字段按 0 处理。 */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export interface LatestRelease {
  tag: string;
  url: string;
}

/** 拉取最新发布版（GitHub API 支持跨域，未认证限额对手动按钮足够）；无发布或网络失败返回 null。 */
export async function fetchLatestRelease(): Promise<LatestRelease | null> {
  try {
    const res = await fetch(RELEASE_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    if (!data.tag_name || !data.html_url) return null;
    return { tag: data.tag_name, url: data.html_url };
  } catch {
    return null;
  }
}

/** 当前平台对应的一键安装命令（curl 链路下载的应用无 quarantine 标记，规避未签名拦截）。 */
export function installCommand(userAgent: string): string {
  if (/Windows/i.test(userAgent)) {
    return `irm ${SCRIPTS_RAW}/install-windows.ps1 | iex`;
  }
  return `curl -fsSL ${SCRIPTS_RAW}/install-macos.sh | bash`;
}

// ---- 应用内更新（tauri-plugin-updater；latest.json 未挂到 Release 时回退 GitHub API 比对） ----

export type UpdaterResult =
  | { kind: "latest" }
  | { kind: "available"; version: string }
  | { kind: "unavailable" }; // 端点无 latest.json（旧版 Release）或平台无产物

/** 经 updater 端点检查；任何失败（含 404/网络）返回 unavailable，由调用方回退手动流程。 */
export async function checkViaUpdater(): Promise<UpdaterResult> {
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check({ timeout: 15000 });
    if (!update) return { kind: "unavailable" };
    return { kind: "available", version: update.version };
  } catch {
    return { kind: "unavailable" };
  }
}

export interface UpdateProgress {
  downloaded: number;
  total: number | null; // Content-Length 缺失时为 null
}

/** 下载并安装更新（校验 minisign 签名后替换应用）；完成后需手动重启应用。 */
export async function downloadAndInstall(
  onProgress: (p: UpdateProgress) => void,
): Promise<void> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check({ timeout: 15000 });
  if (!update) throw new Error("更新已不可用，请重新检查");
  let total: number | null = null;
  let downloaded = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started" && event.data.contentLength) total = event.data.contentLength;
    if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress({ downloaded, total });
    }
  });
}
