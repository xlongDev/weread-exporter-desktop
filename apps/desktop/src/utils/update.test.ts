import { describe, expect, it, vi } from "vitest";
import { compareVersions, installCommand } from "./update";

describe("compareVersions", () => {
  it("相等返回 0", () => {
    expect(compareVersions("0.1.4", "v0.1.4")).toBe(0);
  });

  it("主版本号更大", () => {
    expect(compareVersions("v1.0.0", "0.9.9")).toBe(1);
    expect(compareVersions("0.1.4", "1.0.0")).toBe(-1);
  });

  it("次版本号 / 修订号更大", () => {
    expect(compareVersions("0.2.0", "0.1.9")).toBe(1);
    expect(compareVersions("0.1.5", "0.1.4")).toBe(1);
  });

  it("位数不齐按 0 补齐", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.1.4.1", "0.1.4")).toBe(1);
  });

  it("非法数字段按 0 处理", () => {
    expect(compareVersions("v0.1.x", "0.1.0")).toBe(0);
  });
});

describe("installCommand", () => {
  it("macOS 平台给 curl 命令", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
    expect(installCommand(ua)).toContain("install-macos.sh | bash");
  });

  it("Windows 平台给 PowerShell 命令", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
    expect(installCommand(ua)).toContain("install-windows.ps1 | iex");
  });
});

// checkViaUpdater 的动态 import 在 vitest 里 mock 掉插件
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

import { checkViaUpdater } from "./update";
import { check } from "@tauri-apps/plugin-updater";

const mockedCheck = vi.mocked(check);

describe("checkViaUpdater（应用内更新检查）", () => {
  it("发现更新返回 available + 版本号", async () => {
    mockedCheck.mockResolvedValue({ version: "0.2.0", currentVersion: "0.1.9" } as never);
    const r = await checkViaUpdater();
    expect(r).toEqual({ kind: "available", version: "0.2.0" });
  });

  it("端点无更新返回 unavailable（触发回退 GitHub API）", async () => {
    mockedCheck.mockResolvedValue(null as never);
    expect(await checkViaUpdater()).toEqual({ kind: "unavailable" });
  });

  it("插件异常（404/网络）返回 unavailable，不抛错", async () => {
    mockedCheck.mockRejectedValue(new Error("404"));
    expect(await checkViaUpdater()).toEqual({ kind: "unavailable" });
  });
});
