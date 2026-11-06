import { invoke } from "@tauri-apps/api/core";
import type { AppError, EngineStatus, PathsInfo, SettingsMap, Stats } from "../types";

/** 将 Rust command / IPC 异常归一为 AppError */
export function toAppError(e: unknown): AppError {
  const message = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
  return {
    code: "IPC_ERROR",
    category: "SYSTEM",
    message,
    userMessage: message,
    recoverable: true,
    timestamp: new Date().toISOString(),
  };
}

export const api = {
  stats: () => invoke<Stats>("get_stats"),
  settings: () => invoke<SettingsMap>("get_settings"),
  setSetting: (key: string, value: unknown) =>
    invoke<void>("set_setting", { key, value }),
  paths: () => invoke<PathsInfo>("get_paths"),
  revealPath: (path: string) => invoke<void>("reveal_path", { path }),
  engineStatus: () => invoke<EngineStatus>("engine_status"),

  /** 一次性引擎操作：返回 op_id，事件经 engine://event（task_id=op_id）推送 */
  startOp: (kind: "auth_check" | "login" | "book_info", params: Record<string, unknown> = {}) =>
    invoke<string>("start_op", { kind, params }),
  cancelOp: (opId: string) => invoke<void>("cancel_op", { opId }),
  logout: () => invoke<void>("logout"),
  importBook: (b: { bookId: string; title: string; author: string; intro: string; coverPath: string }) =>
    invoke<void>("import_book", b),
  createTask: (bookId: string, format: string, outputDir?: string) =>
    invoke<number>("create_task", { bookId, format, outputDir }),
  cancelTask: (taskId: number) => invoke<void>("cancel_task", { taskId }),
};
