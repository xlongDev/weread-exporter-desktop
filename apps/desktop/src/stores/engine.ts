import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { api, toAppError } from "../services/api";
import { useTasks } from "./tasks";

export type EngineStateStatus = "unknown" | "checking" | "ready" | "error";

interface EngineStore {
  status: EngineStateStatus;
  engineVersion: string;
  pythonVersion: string;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useEngine = create<EngineStore>((set) => ({
  status: "unknown",
  engineVersion: "",
  pythonVersion: "",
  error: null,
  refresh: async () => {
    set({ status: "checking", error: null });
    try {
      const st = await api.engineStatus();
      set({
        status: st.ready ? "ready" : "error",
        engineVersion: st.engine_version,
        pythonVersion: st.python_version,
        error: st.error,
      });
    } catch (e) {
      set({ status: "error", error: toAppError(e).userMessage });
    }
  },
}));

let unlisten: UnlistenFn | null = null;

/** 订阅引擎事件流：引擎状态 + 任务事件刷新任务列表 */
export async function initEngineListener(): Promise<void> {
  if (unlisten) return;
  unlisten = await listen("engine://event", (event) => {
    const ev = event.payload as { event?: string };
    if (ev?.event === "engine.error") {
      useEngine.setState({ status: "error" });
    }
    if (ev?.event?.startsWith("task.")) {
      // 任务事件：SQLite 已由 Rust 路由更新，这里刷新前端投影
      void useTasks.getState().load();
    }
  });
}
