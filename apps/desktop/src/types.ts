/** 统一错误对象（docs/06 §5）—— 前端与 Rust 的错误契约 */
export interface AppError {
  code: string;
  category:
    | "AUTH"
    | "NETWORK"
    | "ENGINE"
    | "EXPORT"
    | "FILESYSTEM"
    | "DATABASE"
    | "SYSTEM";
  message: string;
  userMessage: string;
  recoverable: boolean;
  details?: unknown;
  timestamp: string;
}

export interface Stats {
  books: number;
  tasks_total: number;
  tasks_completed: number;
  tasks_running: number;
}

export interface AppPaths {
  app_data: string;
  db: string;
  logs: string;
  browser_profile: string;
}

export interface PathsInfo {
  app_data: string;
  db: string;
  logs: string;
  browser_profile: string;
  default_output_dir: string;
}

export type ThemeMode = "system" | "light" | "dark";
export type ExportFormat = "pdf" | "epub" | "markdown";

export type SettingsMap = Record<string, unknown>;
