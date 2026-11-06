import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { api, toAppError } from "../services/api";
import type { AuthStatusData } from "../types";

export type AuthStatus = "unknown" | "checking" | "in" | "out";

interface AuthStore {
  status: AuthStatus;
  /** 正在等待用户扫码 */
  waiting: boolean;
  lastError: string | null;
  loginOpId: string | null;
  check: () => Promise<void>;
  startLogin: () => Promise<void>;
  cancelLogin: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthStore>((set, get) => ({
  status: "unknown",
  waiting: false,
  lastError: null,
  loginOpId: null,

  check: async () => {
    set({ status: "checking", lastError: null });
    try {
      await api.startOp("auth_check");
    } catch (e) {
      set({ status: "out", lastError: toAppError(e).userMessage });
    }
  },

  startLogin: async () => {
    set({ waiting: true, lastError: null });
    try {
      const opId = await api.startOp("login");
      set({ loginOpId: opId });
    } catch (e) {
      set({ waiting: false, lastError: toAppError(e).userMessage });
    }
  },

  cancelLogin: async () => {
    const opId = get().loginOpId;
    if (opId) {
      try {
        await api.cancelOp(opId);
      } catch {
        // worker 可能已自行结束
      }
    }
    set({ waiting: false, loginOpId: null });
  },

  logout: async () => {
    try {
      await api.logout();
    } catch (e) {
      set({ lastError: toAppError(e).userMessage });
      return;
    }
    set({ status: "out", lastError: null });
  },
}));

let unlisten: UnlistenFn | null = null;

/** 订阅 auth.* 事件（engine://event，task_id=op_id） */
export async function initAuthListener(): Promise<void> {
  if (unlisten) return;
  unlisten = await listen("engine://event", (event) => {
    const ev = event.payload as { event?: string; data?: Record<string, unknown> };
    if (ev?.event === "auth.required") {
      useAuth.setState({ waiting: true });
      return;
    }
    if (ev?.event === "auth.status") {
      const data = (ev.data ?? {}) as unknown as AuthStatusData;
      useAuth.setState({
        waiting: false,
        loginOpId: null,
        status: data.logged_in ? "in" : "out",
        lastError: data.error
          ? `登录检查失败：${data.error}`
          : data.reason === "timeout"
            ? "扫码超时，请重试"
            : data.cancelled
              ? null
              : null,
      });
    }
  });
}
