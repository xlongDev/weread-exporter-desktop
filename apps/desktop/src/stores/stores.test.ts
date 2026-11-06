import { beforeEach, describe, expect, it, vi } from "vitest";

// Tauri IPC 边界统一 mock（docs/11 §3：stores 与 services 是前端可测逻辑层）
const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
const listenMock = vi.hoisted(() => vi.fn(async () => () => {}));
let lastListener: ((ev: { payload: unknown }) => void) | null = null;
listenMock.mockImplementation(async (...args: unknown[]) => {
  lastListener = args[1] as unknown as (ev: { payload: unknown }) => void;
  return () => {};
});
vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

import { useEngine, initEngineListener } from "./engine";
import { useSettings } from "./settings";
import { useTasks } from "./tasks";
import { useAuth, initAuthListener } from "./auth";

beforeEach(() => {
  invokeMock.mockReset();
  useEngine.setState({ status: "unknown", engineVersion: "", pythonVersion: "", error: null });
  useSettings.setState({ settings: null, loadError: null });
  useTasks.setState({ tasks: [], loadError: null });
  useAuth.setState({ status: "unknown", waiting: false, lastError: null, loginOpId: null });
});

describe("engine store", () => {
  it("refresh 成功 → ready 并记录版本", async () => {
    invokeMock.mockResolvedValue({
      ready: true,
      engine_version: "0.1.0",
      python_version: "3.12.16",
      error: null,
    });
    await useEngine.getState().refresh();
    const s = useEngine.getState();
    expect(s.status).toBe("ready");
    expect(s.engineVersion).toBe("0.1.0");
    expect(s.pythonVersion).toBe("3.12.16");
  });

  it("refresh 失败 → error 态并携带用户可读信息", async () => {
    invokeMock.mockRejectedValue("引擎握手超时");
    await useEngine.getState().refresh();
    const s = useEngine.getState();
    expect(s.status).toBe("error");
    expect(s.error).toBe("引擎握手超时");
  });

  it("engine.error 事件 → 状态转为 error（事件订阅真实转换逻辑）", async () => {

    await initEngineListener();
    expect(lastListener).toBeTruthy();
    lastListener!({ payload: { event: "engine.error" } });
    expect(useEngine.getState().status).toBe("error");
  });
});

describe("settings store", () => {
  it("load 成功写入缓存", async () => {
    invokeMock.mockResolvedValue({ "general.theme": "dark" });
    await useSettings.getState().load();
    expect(useSettings.getState().settings?.["general.theme"]).toBe("dark");
    expect(useSettings.getState().loadError).toBeNull();
  });

  it("load 失败记录 loadError", async () => {
    invokeMock.mockRejectedValue("db locked");
    await useSettings.getState().load();
    expect(useSettings.getState().loadError).toBe("db locked");
  });

  it("set 先写后更新本地缓存（乐观一致性）", async () => {
    invokeMock.mockResolvedValue(undefined);
    useSettings.setState({ settings: { "general.theme": "system" } });
    await useSettings.getState().set("general.theme", "dark");
    expect(invokeMock).toHaveBeenCalledWith("set_setting", {
      key: "general.theme",
      value: "dark",
    });
    expect(useSettings.getState().settings?.["general.theme"]).toBe("dark");
  });
});

describe("tasks store", () => {
  it("load 拉取任务列表", async () => {
    invokeMock.mockResolvedValue([
      { id: 1, status: "completed", title: "书" },
      { id: 2, status: "running", title: "书二" },
    ]);
    await useTasks.getState().load();
    expect(useTasks.getState().tasks).toHaveLength(2);
    expect(useTasks.getState().loadError).toBeNull();
  });

  it("load 失败记录 loadError 而非清空列表", async () => {
    useTasks.setState({ tasks: [{ id: 1 } as never] });
    invokeMock.mockRejectedValue("ipc down");
    await useTasks.getState().load();
    expect(useTasks.getState().loadError).toBe("ipc down");
    expect(useTasks.getState().tasks).toHaveLength(1);
  });
});

describe("auth store（事件驱动状态机）", () => {
  it("auth.status logged_in=true → in 态并清 waiting", async () => {

    await useAuth.getState().startLogin().catch(() => {});
    await initAuthListener();
    lastListener!({ payload: { event: "auth.status", data: { logged_in: true } } });
    const s = useAuth.getState();
    expect(s.status).toBe("in");
    expect(s.waiting).toBe(false);
  });

  it("auth.required → waiting=true；超时 → out 态 + 提示", async () => {

    await initAuthListener();
    const fire = (event: string, data: Record<string, unknown>) =>
      lastListener!({ payload: { event, data } });

    fire("auth.required", {});
    expect(useAuth.getState().waiting).toBe(true);

    fire("auth.status", { logged_in: false, reason: "timeout" });
    const s = useAuth.getState();
    expect(s.status).toBe("out");
    expect(s.waiting).toBe(false);
    expect(s.lastError).toBe("扫码超时，请重试");
  });

  it("check 失败 → out 态", async () => {
    invokeMock.mockRejectedValue("浏览器启动失败");
    await useAuth.getState().check();
    const s = useAuth.getState();
    expect(s.status).toBe("out");
    expect(s.lastError).toContain("浏览器启动失败");
  });
});
