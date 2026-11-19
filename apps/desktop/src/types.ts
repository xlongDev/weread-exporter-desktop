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
export type ExportFormat = "pdf" | "epub" | "markdown" | "notes";

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

/** 引擎 shelf.books 事件负载中的书籍卡片（微信读书书架） */
export interface ShelfItem {
  book_id: string;
  title: string;
  author: string;
  cover: string;
  /** bookDetail/抓取管线用的 v-hash（数字 bookId 的 bookDetail 页 404）；缺失时回退 book_id */
  book_hash: string;
  /** 微信读书书架分组名（来自 shelf/sync archive[]；无分组/未分组为 ""，前端据此平铺） */
  group?: string;
}

/** 引擎 notes.summary_progress 事件负载（书架划线汇总） */
export interface NotesSummaryProgress {
  done: number;
  total: number;
  title: string;
}

/** 引擎 notes.summary_done 事件负载（书架划线汇总产物） */
export interface NotesSummaryDone {
  file_path: string;
  file_size: number;
  books_ok: number;
  books_empty: number;
  total_highlights: number;
  total_reviews: number;
}

/** 引擎 auth.status 事件负载 */
export interface AuthStatusData {
  logged_in: boolean;
  error?: string;
  reason?: string;
  cancelled?: boolean;
  mock?: boolean;
}

/** 任务列表行（Rust list_tasks） */
export interface TaskRow {
  id: number;
  book_id: string;
  title: string;
  cover_path: string;
  format: string;
  status: "waiting" | "running" | "completed" | "cancelled" | "failed";
  progress: number;
  current_stage: string;
  current_chapter: string;
  pages_done: number;
  words_done: number;
  chapters_done: number;
  total_chapters: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  error_message: string | null;
  output_dir: string;
}

/** 书库文件行（Rust list_files） */
export interface LibraryFile {
  id: number;
  book_id: string;
  title: string;
  author: string;
  cover_path: string;
  format: string;
  file_path: string;
  file_name: string;
  file_size: number;
  exists_ok: boolean;
  created_at: string;
}

/** 章节进度行 */
export interface ChapterRow {
  chapter_idx: number;
  title: string;
  status: "pending" | "done" | "failed";
}

/** 任务详情（任务行 + 章节进度） */
export type TaskDetail = TaskRow & { chapters: ChapterRow[] };
