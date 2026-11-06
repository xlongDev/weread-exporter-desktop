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
};
