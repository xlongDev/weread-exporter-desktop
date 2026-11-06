# 07 - 数据库设计（SQLite）

## 1. 基本策略

- 位置：`<app_data_dir>/weread-exporter.db`；WAL 模式；`foreign_keys=ON`；`busy_timeout=5s`。
- 迁移：`PRAGMA user_version` 顺序迁移，Rust 内嵌 `migrations: &[(u32, &str)]` 数组，启动时在事务中逐个执行；每个迁移前自动备份数据库文件（`db.bak-v{n}`，保留最近 3 份）；迁移记录写入启动日志。
- 事务：所有多表写入（任务创建、完成落库）用事务；任务状态更新均为单行原子 UPDATE。

## 2. Schema v1（user_version = 1）

```sql
-- 书籍（导入过的书）
CREATE TABLE books (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id       TEXT NOT NULL UNIQUE,          -- weread bookId
  title         TEXT NOT NULL,
  author        TEXT DEFAULT '',
  cover_path    TEXT,                          -- 本地缓存封面路径
  metadata_json TEXT DEFAULT '{}',             -- 简介/出版社等原始元数据
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 导出任务
CREATE TABLE export_tasks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id        TEXT NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
  format         TEXT NOT NULL CHECK (format IN ('pdf','epub','markdown')),
  output_dir     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'waiting'
                 CHECK (status IN ('waiting','running','completed','cancelled','failed')),
  progress       REAL NOT NULL DEFAULT 0,      -- 0-100
  current_stage  TEXT DEFAULT '',
  current_chapter TEXT DEFAULT '',
  pages_done     INTEGER NOT NULL DEFAULT 0,
  words_done     INTEGER NOT NULL DEFAULT 0,
  resumed_from   INTEGER REFERENCES export_tasks(id) ON DELETE SET NULL, -- 继续导出来源
  error_code     TEXT,
  error_message  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  started_at     TEXT,
  finished_at    TEXT,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tasks_status ON export_tasks(status, created_at DESC);
CREATE INDEX idx_tasks_book   ON export_tasks(book_id);

-- 任务章节级进度（断点续导的账本，引擎落盘的镜像）
CREATE TABLE task_chapters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     INTEGER NOT NULL REFERENCES export_tasks(id) ON DELETE CASCADE,
  chapter_idx INTEGER NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','done','failed')),
  error_message TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (task_id, chapter_idx)
);
CREATE INDEX idx_chapters_task ON task_chapters(task_id, chapter_idx);

-- 导出产物（书库）
CREATE TABLE exported_files (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id    TEXT NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
  task_id    INTEGER REFERENCES export_tasks(id) ON DELETE SET NULL,
  format     TEXT NOT NULL CHECK (format IN ('pdf','epub','markdown')),
  file_path  TEXT NOT NULL,
  file_name  TEXT NOT NULL,
  file_size  INTEGER NOT NULL DEFAULT 0,
  exists_ok  INTEGER NOT NULL DEFAULT 1,       -- 打开时校验，文件丢失置 0
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_files_book ON exported_files(book_id);
CREATE INDEX idx_files_created ON exported_files(created_at DESC);

-- 设置键值
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,                    -- JSON 值
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## 3. 关键约定

- 时间统一 UTC ISO-8601 字符串；UI 层本地化显示。
- `settings` 预置键：`general.output_dir`、`general.default_format`、`general.theme`、`general.language`、`export.naming`、`export.overwrite`、`export.save_cover`。
- 敏感数据（Cookie/profile）**不入库**，只在浏览器 profile 目录（见 10）。
- 数据完整性：启动时 `PRAGMA integrity_check`（quick_check），失败则从最近备份恢复并告警。
- 应用数据备份（设置内"导出诊断"不含任何认证数据；DB 备份仅含任务/书库记录）。
