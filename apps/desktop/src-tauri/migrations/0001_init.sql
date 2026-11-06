-- Schema v1（docs/07-database-design.md）
CREATE TABLE books (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id       TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  author        TEXT DEFAULT '',
  cover_path    TEXT,
  metadata_json TEXT DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE export_tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id         TEXT NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
  format          TEXT NOT NULL CHECK (format IN ('pdf','epub','markdown')),
  output_dir      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'waiting'
                  CHECK (status IN ('waiting','running','completed','cancelled','failed')),
  progress        REAL NOT NULL DEFAULT 0,
  current_stage   TEXT DEFAULT '',
  current_chapter TEXT DEFAULT '',
  pages_done      INTEGER NOT NULL DEFAULT 0,
  words_done      INTEGER NOT NULL DEFAULT 0,
  resumed_from    INTEGER REFERENCES export_tasks(id) ON DELETE SET NULL,
  error_code      TEXT,
  error_message   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  started_at      TEXT,
  finished_at     TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tasks_status ON export_tasks(status, created_at DESC);
CREATE INDEX idx_tasks_book   ON export_tasks(book_id);

CREATE TABLE task_chapters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       INTEGER NOT NULL REFERENCES export_tasks(id) ON DELETE CASCADE,
  chapter_idx   INTEGER NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','done','failed')),
  error_message TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (task_id, chapter_idx)
);
CREATE INDEX idx_chapters_task ON task_chapters(task_id, chapter_idx);

CREATE TABLE exported_files (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id    TEXT NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
  task_id    INTEGER REFERENCES export_tasks(id) ON DELETE SET NULL,
  format     TEXT NOT NULL CHECK (format IN ('pdf','epub','markdown')),
  file_path  TEXT NOT NULL,
  file_name  TEXT NOT NULL,
  file_size  INTEGER NOT NULL DEFAULT 0,
  exists_ok  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_files_book    ON exported_files(book_id);
CREATE INDEX idx_files_created ON exported_files(created_at DESC);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
