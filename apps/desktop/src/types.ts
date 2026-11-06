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

export interface EngineStatus {
  ready: boolean;
  engine_version: string;
  python_version: string;
  error: string | null;
}

/** 引擎 book.metadata 事件负载 */
export interface BookMeta {
  book_id: string;
  title: string;
  author: string;
  intro: string;
  cover_path: string;
  logged_in?: boolean;
}

/** 引擎 book.validation 事件负载 */
export interface BookValidation {
  ok: boolean;
  reason: string;
  user_message: string;
  logged_in?: boolean;
}

/** 引擎 auth.status 事件负载 */
export interface AuthStatusData {
  logged_in: boolean;
  error?: string;
  reason?: string;
  cancelled?: boolean;
  mock?: boolean;
}
