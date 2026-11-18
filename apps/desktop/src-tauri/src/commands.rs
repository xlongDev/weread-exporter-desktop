//! Tauri 命令面（docs/10 安全设计）：前端唯一可触达的 Rust 接口。

use crate::engine::manager;
use crate::engine::protocol;
use crate::log;
use crate::state::{paths_of, AppPaths, AppState};
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use tauri::State;

/// settings 允许写入的键（白名单，docs/07 §3）
const SETTING_KEYS: &[&str] = &[
    "general.output_dir",
    "general.default_format",
    "general.theme",
    "general.language",
    "export.naming",
    "export.overwrite",
    "export.save_cover",
    "export.font_size",
    "export.page_margin",
];

const FORMATS: &[&str] = &["pdf", "epub", "markdown", "notes"];

#[derive(Serialize)]
pub struct Stats {
    books: i64,
    tasks_total: i64,
    tasks_completed: i64,
    tasks_running: i64,
}

#[derive(Serialize)]
pub struct EngineStatusInfo {
    ready: bool,
    engine_version: String,
    python_version: String,
    error: Option<String>,
}

fn lock_err<T>(e: std::sync::PoisonError<T>) -> String {
    let msg = format!("数据库访问失败: {e}");
    log::write("ERROR", &msg);
    msg
}

#[tauri::command]
pub fn get_stats(state: State<'_, AppState>) -> Result<Stats, String> {
    let conn = state.db.lock().map_err(lock_err)?;
    let one = |sql: &str| -> Result<i64, String> {
        conn.query_row(sql, [], |r| r.get(0)).map_err(|e| format!("统计查询失败: {e}"))
    };
    Ok(Stats {
        // 「已导出书籍」按实际导出记录计（清除书库记录后同步归零），而非导入书数
        books: one("SELECT count(DISTINCT book_id) FROM exported_files")?,
        tasks_total: one("SELECT count(*) FROM export_tasks")?,
        tasks_completed: one("SELECT count(*) FROM export_tasks WHERE status='completed'")?,
        tasks_running: one(
            "SELECT count(*) FROM export_tasks WHERE status IN ('waiting','running')",
        )?,
    })
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<HashMap<String, Value>, String> {
    let conn = state.db.lock().map_err(lock_err)?;
    read_settings(&conn)
}

fn read_settings(conn: &Connection) -> Result<HashMap<String, Value>, String> {
    let mut stmt = conn
        .prepare("SELECT key, value FROM settings")
        .map_err(|e| format!("读取设置失败: {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .map_err(|e| format!("读取设置失败: {e}"))?;
    let mut map = HashMap::new();
    for row in rows {
        let (k, v) = row.map_err(|e| format!("读取设置行失败: {e}"))?;
        let parsed = serde_json::from_str::<Value>(&v).unwrap_or(Value::String(v));
        map.insert(k, parsed);
    }
    Ok(map)
}

#[tauri::command]
pub fn set_setting(state: State<'_, AppState>, key: String, value: Value) -> Result<(), String> {
    if !SETTING_KEYS.contains(&key.as_str()) {
        return Err(format!("不允许写入的设置键: {key}"));
    }
    let conn = state.db.lock().map_err(lock_err)?;
    conn.execute(
        "INSERT INTO settings(key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value=?2, updated_at=datetime('now')",
        rusqlite::params![key, value.to_string()],
    )
    .map_err(|e| format!("写入设置失败: {e}"))?;
    log::write("INFO", &format!("setting updated: {key}"));
    Ok(())
}

#[derive(Serialize)]
pub struct PathsInfo {
    #[serde(flatten)]
    paths: AppPaths,
    default_output_dir: String,
}

#[tauri::command]
pub fn get_paths() -> Result<PathsInfo, String> {
    let paths = paths_of();
    let default_output = dirs::document_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default())
        .join("WeRead-Exports");
    Ok(PathsInfo {
        paths,
        default_output_dir: default_output.to_string_lossy().into_owned(),
    })
}

/// 打开/定位文件或文件夹。路径白名单：应用数据目录内的路径。
#[tauri::command]
pub fn reveal_path(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    let canonical = p
        .canonicalize()
        .map_err(|e| format!("路径不存在或无法访问: {e}"))?;
    let app_data = state.paths.app_data.clone();
    let allowed = canonical.starts_with(app_data.canonicalize().unwrap_or(app_data.clone()));
    if !allowed {
        return Err("拒绝访问白名单以外的路径".into());
    }
    tauri_plugin_opener::reveal_item_in_dir(&canonical).map_err(|e| format!("打开失败: {e}"))
}

/// 引擎握手：确认 worker 可启动并返回版本信息（设置-关于 / 状态展示）。
#[tauri::command]
pub fn engine_status(app: tauri::AppHandle) -> Result<EngineStatusInfo, String> {
    let st = manager::engine_status_logged(&app);
    Ok(EngineStatusInfo {
        ready: st.ready,
        engine_version: st.engine_version,
        python_version: st.python_version,
        error: st.error,
    })
}

fn default_output_dir() -> String {
    dirs::document_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default())
        .join("WeRead-Exports")
        .to_string_lossy()
        .into_owned()
}

/// 书籍 ID 校验（与引擎 extract_book_id 纯 ID 规则一致，docs/10 §5）
fn valid_book_id(s: &str) -> bool {
    let n = s.len();
    (6..=36).contains(&n)
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// 创建真实导出任务并立即启动引擎执行（排队机制在 Phase 5 引入）。
#[tauri::command]
pub fn create_task(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    book_id: String,
    format: String,
    output_dir: Option<String>,
    resumed_from: Option<i64>,
) -> Result<i64, String> {
    if !valid_book_id(&book_id) {
        return Err("书籍 ID 格式无效".into());
    }
    if !FORMATS.contains(&format.as_str()) {
        return Err(format!("不支持的导出格式: {format}"));
    }
    let dir = match output_dir {
        Some(d) if !d.trim().is_empty() => d,
        _ => {
            let conn = state.db.lock().map_err(lock_err)?;
            read_settings(&conn)?
                .get("general.output_dir")
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .unwrap_or_else(default_output_dir)
        }
    };
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建输出目录失败: {e}"))?;

    // 文件名模板（export.naming，空 = 引擎默认命名）与排版参数（字号/页边距，
    // 值为 "default" 或空串 = 引擎默认排版）：随任务参数传给引擎
    let mut options = serde_json::json!({});
    {
        let conn = state.db.lock().map_err(lock_err)?;
        let settings = read_settings(&conn)?;
        let tmpl = settings
            .get("export.naming")
            .and_then(|v| v.as_str().map(|s| s.trim().to_string()))
            .unwrap_or_default();
        if !tmpl.is_empty() {
            options["filename_template"] = Value::String(tmpl);
        }
        let font_size = settings
            .get("export.font_size")
            .and_then(|v| v.as_str())
            .unwrap_or("default");
        let page_margin = settings
            .get("export.page_margin")
            .and_then(|v| v.as_str())
            .unwrap_or("default");
        if font_size != "default" || page_margin != "default" {
            let mut layout = serde_json::json!({});
            if font_size != "default" {
                layout["font_size"] = Value::String(font_size.to_string());
            }
            if page_margin != "default" {
                layout["page_margin"] = Value::String(page_margin.to_string());
            }
            options["layout"] = layout;
        }
    }

    let task_id = {
        let conn = state.db.lock().map_err(lock_err)?;
        let exists: Option<bool> = conn
            .query_row("SELECT 1 FROM books WHERE book_id=?1", [&book_id], |_r| Ok(true))
            .optional()
            .map_err(|e| format!("查询书籍失败: {e}"))?;
        if !exists.unwrap_or(false) {
            return Err("书籍尚未导入，请先在导出向导中完成导入".into());
        }
        conn.execute(
            "INSERT INTO export_tasks(book_id, format, output_dir, status, resumed_from)
             VALUES (?1, ?2, ?3, 'waiting', ?4)",
            rusqlite::params![book_id, format, dir, resumed_from],
        )
        .map_err(|e| format!("创建任务失败: {e}"))?;
        conn.last_insert_rowid()
    };
    log::write("INFO", &format!("task {task_id} created: {book_id} -> {format}"));

    let started = manager::enqueue_or_start(
        &app,
        manager::QueuedTask {
            task_id,
            book_id,
            format,
            output_dir: dir,
            options,
        },
    )?;
    if started {
        log::write("INFO", &format!("task {task_id} started immediately"));
    } else {
        log::write("INFO", &format!("task {task_id} queued"));
    }
    Ok(task_id)
}

/// 取消任务：运行中 → 向引擎发送优雅取消；等待中 → 直接标记取消。
#[tauri::command]
pub fn cancel_task(state: State<'_, AppState>, task_id: i64) -> Result<(), String> {
    {
        let running = state.running.lock().map_err(|_| "运行表锁损坏".to_string())?;
        if let Some(rt) = running.get(&task_id) {
            rt.cancel_requested
                .store(true, std::sync::atomic::Ordering::SeqCst);
            return rt.worker.send_line(&protocol::command_line(
                "cancel",
                Some(&task_id.to_string()),
                None,
            ));
        }
    }
    {
        let mut queue = state.queue.lock().map_err(|_| "队列锁损坏".to_string())?;
        queue.retain(|qt| qt.task_id != task_id);
    }
    let conn = state.db.lock().map_err(lock_err)?;
    let n = conn
        .execute(
            "UPDATE export_tasks SET status='cancelled', finished_at=datetime('now'),
             updated_at=datetime('now') WHERE id=?1 AND status='waiting'",
            [task_id],
        )
        .map_err(|e| format!("取消任务失败: {e}"))?;
    if n > 0 {
        Ok(())
    } else {
        Err("任务不在可取消状态".into())
    }
}

#[derive(Serialize)]
pub struct TaskRow {
    id: i64,
    book_id: String,
    title: String,
    cover_path: String,
    format: String,
    status: String,
    progress: f64,
    current_stage: String,
    current_chapter: String,
    pages_done: i64,
    words_done: i64,
    chapters_done: i64,
    total_chapters: Option<i64>,
    created_at: String,
    started_at: Option<String>,
    finished_at: Option<String>,
    error_code: Option<String>,
    error_message: Option<String>,
    output_dir: String,
}

#[tauri::command]
pub fn list_tasks(state: State<'_, AppState>, limit: i64) -> Result<Vec<TaskRow>, String> {
    let mut out = {
        let conn = state.db.lock().map_err(lock_err)?;
        let mut stmt = conn
            .prepare(
                "SELECT t.id, t.book_id, b.title, COALESCE(b.cover_path,''), t.format, t.status,
                        t.progress, COALESCE(t.current_stage,''), COALESCE(t.current_chapter,''),
                        t.pages_done, t.words_done,
                        (SELECT count(*) FROM task_chapters c WHERE c.task_id=t.id AND c.status='done'),
                        t.created_at, t.started_at, t.finished_at, t.error_code, t.error_message, t.output_dir, t.total_chapters
                 FROM export_tasks t LEFT JOIN books b ON b.book_id = t.book_id
                 ORDER BY t.created_at DESC, t.id DESC LIMIT ?1",
            )
            .map_err(|e| format!("查询任务失败: {e}"))?;
        let rows = stmt
            .query_map([limit], |r| {
                Ok(TaskRow {
                    id: r.get(0)?,
                    book_id: r.get(1)?,
                    title: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    cover_path: r.get(3)?,
                    format: r.get(4)?,
                    status: r.get(5)?,
                    progress: r.get(6)?,
                    current_stage: r.get(7)?,
                    current_chapter: r.get(8)?,
                    pages_done: r.get(9)?,
                    words_done: r.get(10)?,
                    chapters_done: r.get(11)?,
                    total_chapters: r.get(18)?,
                    created_at: r.get(12)?,
                    started_at: r.get(13)?,
                    finished_at: r.get(14)?,
                    error_code: r.get(15)?,
                    error_message: r.get(16)?,
                    output_dir: r.get(17)?,
                })
            })
            .map_err(|e| format!("查询任务失败: {e}"))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| format!("读取任务行失败: {e}"))?);
        }
        out
    };
    // 封面兜底修复（锁外，理由同 list_files）：任务行的封面同样随书修复
    for t in out.iter_mut() {
        let dir = std::path::Path::new(&t.output_dir).to_path_buf();
        t.cover_path = repair_book_cover(&state, &t.book_id, &t.cover_path, Some(&dir));
    }
    Ok(out)
}

/// 发起一次性引擎操作（登录 / 会话检查 / 书籍信息）。
#[tauri::command]
pub fn start_op(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    kind: String,
    params: Value,
) -> Result<String, String> {
    let cmd = match kind.as_str() {
        "auth_check" => "auth_check",
        "login" => "login",
        "book_info" => "book_info",
        "shelf_fetch" => "shelf_fetch",
        _ => return Err(format!("未知操作类型: {kind}")),
    };
    let op_id = format!("{kind}-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
    let mut p = params;
    if kind == "book_info" {
        // 封面统一存到应用数据目录
        let cover_dir = state.paths.app_data.join("covers");
        p["cover_dir"] = Value::String(cover_dir.to_string_lossy().into_owned());
    }
    let _ = std::fs::create_dir_all(&state.paths.browser_profile);
    manager::start_op(&app, &op_id, cmd, p, &state.paths.browser_profile, &state.paths.logs)?;
    Ok(op_id)
}

/// 取消进行中的一次性操作（如等待扫码）。
#[tauri::command]
pub fn cancel_op(state: State<'_, AppState>, op_id: String) -> Result<(), String> {
    let ops = state.ops.lock().map_err(|_| "ops 表锁损坏".to_string())?;
    if let Some(w) = ops.get(&op_id) {
        w.send_line(&protocol::command_line("cancel", Some(&op_id), None))
    } else {
        Err("操作不存在或已结束".into())
    }
}

/// 退出登录：清空浏览器 profile（会话数据仅存于本机，docs/10 §4）。
#[tauri::command]
pub fn logout(state: State<'_, AppState>) -> Result<(), String> {
    let dir = &state.paths.browser_profile;
    if dir.exists() {
        std::fs::remove_dir_all(dir).map_err(|e| format!("清除会话失败: {e}"))?;
    }
    std::fs::create_dir_all(dir).map_err(|e| format!("重建 profile 目录失败: {e}"))?;
    log::write("INFO", "browser profile cleared (logout)");
    Ok(())
}

#[derive(Serialize)]
pub struct LibraryFile {
    id: i64,
    book_id: String,
    title: String,
    author: String,
    cover_path: String,
    format: String,
    file_path: String,
    file_name: String,
    file_size: i64,
    exists_ok: bool,
    created_at: String,
}

/// 封面兜底修复：cover_path 为空或文件丢失时，从随书数据根（<dir>/<book_id>_v2/cover.jpg）
/// 拷入应用数据目录（命中 asset 协议范围）并回写 books.cover_path —— 任务行/书库行都 join books，
/// 一次修复处处生效。返回修复后的路径（无候选时原样返回）。
fn repair_book_cover(
    state: &AppState,
    book_id: &str,
    cover_path: &str,
    data_dir: Option<&std::path::Path>,
) -> String {
    if !cover_path.is_empty() && std::path::Path::new(cover_path).is_file() {
        return cover_path.to_string();
    }
    let Some(dir) = data_dir else {
        return cover_path.to_string();
    };
    let src = dir.join(format!("{book_id}_v2")).join("cover.jpg");
    if !src.is_file() {
        return cover_path.to_string();
    }
    let dest_dir = state.paths.app_data.join("covers");
    let _ = std::fs::create_dir_all(&dest_dir);
    let dest = dest_dir.join(format!("{book_id}_export.jpg"));
    if !dest.is_file() {
        let _ = std::fs::copy(&src, &dest);
    }
    if !dest.is_file() {
        return cover_path.to_string();
    }
    let repaired = dest.to_string_lossy().into_owned();
    if let Ok(conn) = state.db.lock() {
        let _ = conn.execute(
            "UPDATE books SET cover_path=?2 WHERE book_id=?1",
            rusqlite::params![book_id, repaired],
        );
    }
    repaired
}

/// 书库列表：导出产物 join 书籍；顺带回写文件存在性。
#[tauri::command]
pub fn list_files(state: State<'_, AppState>) -> Result<Vec<LibraryFile>, String> {
    let mut out = {
        let conn = state.db.lock().map_err(lock_err)?;
        let mut stmt = conn
            .prepare(
                "SELECT f.id, f.book_id, COALESCE(b.title,''), COALESCE(b.author,''),
                        COALESCE(b.cover_path,''), f.format, f.file_path, f.file_name,
                        f.file_size, f.created_at
                 FROM exported_files f LEFT JOIN books b ON b.book_id = f.book_id
                 ORDER BY f.created_at DESC, f.id DESC",
            )
            .map_err(|e| format!("查询书库失败: {e}"))?;
        let rows = stmt
            .query_map([], |r| {
                Ok(LibraryFile {
                    id: r.get(0)?,
                    book_id: r.get(1)?,
                    title: r.get(2)?,
                    author: r.get(3)?,
                    cover_path: r.get(4)?,
                    format: r.get(5)?,
                    file_path: r.get(6)?,
                    file_name: r.get(7)?,
                    file_size: r.get(8)?,
                    created_at: r.get(9)?,
                    exists_ok: false,
                })
            })
            .map_err(|e| format!("查询书库失败: {e}"))?;
        let mut out = Vec::new();
        for row in rows {
            let mut f = row.map_err(|e| format!("读取书库行失败: {e}"))?;
            f.exists_ok = std::path::Path::new(&f.file_path).is_file();
            let _ = conn.execute(
                "UPDATE exported_files SET exists_ok=?2 WHERE id=?1",
                rusqlite::params![f.id, f.exists_ok as i64],
            );
            out.push(f);
        }
        out
    };
    // 封面兜底修复在锁外执行：repair 内部会短暂持锁回写 books（std Mutex 不可重入）
    for f in out.iter_mut() {
        let dir = std::path::Path::new(&f.file_path)
            .parent()
            .map(|p| p.to_path_buf());
        f.cover_path = repair_book_cover(&state, &f.book_id, &f.cover_path, dir.as_deref());
    }
    Ok(out)
}

/// 用系统默认程序打开导出文件（路径取自数据库记录）。
#[tauri::command]
pub fn open_file(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let path: String = {
        let conn = state.db.lock().map_err(lock_err)?;
        conn.query_row("SELECT file_path FROM exported_files WHERE id=?1", [id], |r| r.get(0))
            .optional()
            .map_err(|e| format!("查询文件失败: {e}"))?
            .ok_or("记录不存在")?
    };
    let p = std::path::PathBuf::from(&path);
    if !p.is_file() {
        return Err("文件不存在（可能已被移动或删除）".into());
    }
    tauri_plugin_opener::open_path(p, None::<&str>).map_err(|e| format!("打开失败: {e}"))
}

/// 删除书库记录；delete_file=true 时同时删除磁盘文件。
#[tauri::command]
pub fn delete_exported_file(
    state: State<'_, AppState>,
    id: i64,
    delete_file: bool,
) -> Result<(), String> {
    let (path, exists): (String, bool) = {
        let conn = state.db.lock().map_err(lock_err)?;
        conn.query_row(
            "SELECT file_path, exists_ok FROM exported_files WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get::<_, i64>(1)? != 0)),
        )
        .optional()
        .map_err(|e| format!("查询文件失败: {e}"))?
        .ok_or("记录不存在")?
    };
    if delete_file && exists {
        std::fs::remove_file(&path).map_err(|e| format!("删除文件失败: {e}"))?;
        log::write("INFO", &format!("file deleted: {path}"));
    }
    let conn = state.db.lock().map_err(lock_err)?;
    conn.execute("DELETE FROM exported_files WHERE id=?1", [id])
        .map_err(|e| format!("删除记录失败: {e}"))?;
    Ok(())
}

#[derive(Serialize)]
pub struct ChapterRow {
    chapter_idx: i64,
    title: String,
    status: String,
}

#[derive(Serialize)]
pub struct TaskDetail {
    #[serde(flatten)]
    row: TaskRow,
    chapters: Vec<ChapterRow>,
}

/// 任务详情：任务行 + 章节级进度（断点续导依据）。
#[tauri::command]
pub fn get_task_detail(state: State<'_, AppState>, task_id: i64) -> Result<TaskDetail, String> {
    let conn = state.db.lock().map_err(lock_err)?;
    let row = conn
        .query_row(
            "SELECT t.id, t.book_id, COALESCE(b.title,''), COALESCE(b.cover_path,''), t.format, t.status,
                    t.progress, COALESCE(t.current_stage,''), COALESCE(t.current_chapter,''),
                    t.pages_done, t.words_done,
                    (SELECT count(*) FROM task_chapters c WHERE c.task_id=t.id AND c.status='done'),
                    t.created_at, t.started_at, t.finished_at, t.error_code, t.error_message, t.output_dir, t.total_chapters
             FROM export_tasks t LEFT JOIN books b ON b.book_id = t.book_id WHERE t.id=?1",
            [task_id],
            |r| {
                Ok(TaskRow {
                    id: r.get(0)?,
                    book_id: r.get(1)?,
                    title: r.get(2)?,
                    cover_path: r.get(3)?,
                    format: r.get(4)?,
                    status: r.get(5)?,
                    progress: r.get(6)?,
                    current_stage: r.get(7)?,
                    current_chapter: r.get(8)?,
                    pages_done: r.get(9)?,
                    words_done: r.get(10)?,
                    chapters_done: r.get(11)?,
                    total_chapters: r.get(18)?,
                    created_at: r.get(12)?,
                    started_at: r.get(13)?,
                    finished_at: r.get(14)?,
                    error_code: r.get(15)?,
                    error_message: r.get(16)?,
                    output_dir: r.get(17)?,
                })
            },
        )
        .optional()
        .map_err(|e| format!("查询任务失败: {e}"))?
        .ok_or("任务不存在")?;
    let mut stmt = conn
        .prepare("SELECT chapter_idx, title, status FROM task_chapters WHERE task_id=?1 ORDER BY chapter_idx")
        .map_err(|e| format!("查询章节失败: {e}"))?;
    let chapters = stmt
        .query_map([task_id], |r| {
            Ok(ChapterRow {
                chapter_idx: r.get(0)?,
                title: r.get(1)?,
                status: r.get(2)?,
            })
        })
        .map_err(|e| format!("查询章节失败: {e}"))?
        .map_while(Result::ok)
        .collect();
    Ok(TaskDetail { row, chapters })
}

/// 打开任务日志文件所在目录（stderr 全量日志，含脱敏）。
#[tauri::command]
pub fn reveal_task_log(state: State<'_, AppState>, task_id: i64) -> Result<(), String> {
    let path = state.paths.logs.join(format!("task-{task_id}.log"));
    if !path.exists() {
        return Err("暂无任务日志".into());
    }
    tauri_plugin_opener::reveal_item_in_dir(&path).map_err(|e| format!("打开失败: {e}"))
}

/// 清除已结束的任务历史（completed/cancelled/failed）；进行中的任务不受影响。
pub fn clear_finished_tasks_conn(conn: &Connection) -> Result<u64, String> {
    Ok(conn
        .execute(
            "DELETE FROM export_tasks WHERE status IN ('completed','cancelled','failed')",
            [],
        )
        .map_err(|e| format!("清除任务历史失败: {e}"))? as u64)
}

#[tauri::command]
pub fn clear_finished_tasks(state: State<'_, AppState>) -> Result<u64, String> {
    let conn = state.db.lock().map_err(lock_err)?;
    let n = clear_finished_tasks_conn(&conn)?;
    log::write("INFO", &format!("cleared {n} finished tasks"));
    Ok(n)
}

/// 删除单条任务记录（仅允许已结束的任务；章节随 ON DELETE CASCADE 级联删除，
/// 导出文件与书库记录不受影响）。
pub fn delete_task_conn(conn: &Connection, task_id: i64) -> Result<u64, String> {
    Ok(conn
        .execute(
            "DELETE FROM export_tasks WHERE id=?1 AND status IN ('completed','cancelled','failed')",
            [task_id],
        )
        .map_err(|e| format!("删除任务记录失败: {e}"))? as u64)
}

#[tauri::command]
pub fn delete_task(state: State<'_, AppState>, task_id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(lock_err)?;
    let n = delete_task_conn(&conn, task_id)?;
    if n == 0 {
        return Err("任务不存在或仍在进行中；进行中的任务请先取消".into());
    }
    log::write("INFO", &format!("task {task_id} record deleted"));
    Ok(())
}

/// 一键清除书库记录（仅记录，磁盘文件不动）。
pub fn clear_library_records_conn(conn: &Connection) -> Result<u64, String> {
    Ok(conn
        .execute("DELETE FROM exported_files", [])
        .map_err(|e| format!("清除书库记录失败: {e}"))? as u64)
}

#[tauri::command]
pub fn clear_library_records(state: State<'_, AppState>) -> Result<u64, String> {
    let conn = state.db.lock().map_err(lock_err)?;
    let n = clear_library_records_conn(&conn)?;
    log::write("INFO", &format!("cleared {n} library records"));
    Ok(n)
}

/// 定位导出文件（在文件管理器中显示该文件）。
#[tauri::command]
pub fn reveal_exported_file(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let path: String = {
        let conn = state.db.lock().map_err(lock_err)?;
        conn.query_row("SELECT file_path FROM exported_files WHERE id=?1", [id], |r| r.get(0))
            .optional()
            .map_err(|e| format!("查询文件失败: {e}"))?
            .ok_or("记录不存在")?
    };
    let p = std::path::PathBuf::from(&path);
    if !p.is_file() {
        return Err("文件不存在（可能已被移动或删除）".into());
    }
    tauri_plugin_opener::reveal_item_in_dir(&p).map_err(|e| format!("打开失败: {e}"))
}

/// 用户确认关闭后：强制终止所有引擎进程并退出应用。
#[tauri::command]
pub fn force_close(app: tauri::AppHandle, state: State<'_, AppState>) {
    if let Ok(map) = state.running.lock() {
        for rt in map.values() {
            rt.worker.kill();
        }
    }
    if let Ok(ops) = state.ops.lock() {
        for w in ops.values() {
            w.kill();
        }
    }
    log::write("INFO", "force close: engine workers killed");
    app.exit(0);
}

/// 定位任务的输出目录（目录取自数据库记录，非前端任意路径）。
#[tauri::command]
pub fn reveal_task_dir(state: State<'_, AppState>, task_id: i64) -> Result<(), String> {
    let dir: String = {
        let conn = state.db.lock().map_err(lock_err)?;
        conn.query_row(
            "SELECT output_dir FROM export_tasks WHERE id=?1",
            [task_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("查询任务失败: {e}"))?
        .ok_or("任务不存在")?
    };
    let p = std::path::PathBuf::from(&dir);
    let p = if p.exists() {
        p.canonicalize().map_err(|e| format!("目录不可访问: {e}"))?
    } else {
        std::fs::create_dir_all(&p).map_err(|e| format!("目录不存在且创建失败: {e}"))?;
        p
    };
    tauri_plugin_opener::reveal_item_in_dir(&p).map_err(|e| format!("打开失败: {e}"))
}

/// 导入书籍（向导第一步完成时调用）：upsert books 表 + 校验封面路径。
#[tauri::command]
pub fn import_book(
    state: State<'_, AppState>,
    book_id: String,
    title: String,
    author: String,
    intro: String,
    cover_path: String,
) -> Result<(), String> {
    if !valid_book_id(&book_id) {
        return Err("书籍 ID 格式无效".into());
    }
    if title.trim().is_empty() {
        return Err("书名不能为空".into());
    }
    // 封面路径必须位于应用数据目录内（engine 事件中的路径，防御性校验）
    let cover_in_app_data = {
        if cover_path.is_empty() {
            String::new()
        } else {
            let p = std::path::PathBuf::from(&cover_path);
            let app_data = state.paths.app_data.clone();
            match p.canonicalize() {
                Ok(c) if c.starts_with(app_data.canonicalize().unwrap_or(app_data.clone())) => c.to_string_lossy().into_owned(),
                _ => String::new(),
            }
        }
    };
    let meta = serde_json::json!({ "intro": intro });
    let conn = state.db.lock().map_err(lock_err)?;
    conn.execute(
        "INSERT INTO books(book_id, title, author, cover_path, metadata_json, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
         ON CONFLICT(book_id) DO UPDATE SET
           title=excluded.title, author=excluded.author,
           cover_path=CASE WHEN excluded.cover_path != '' THEN excluded.cover_path ELSE books.cover_path END,
           metadata_json=excluded.metadata_json, updated_at=datetime('now')",
        rusqlite::params![book_id, title.trim(), author.trim(), cover_in_app_data, meta.to_string()],
    )
    .map_err(|e| format!("导入书籍失败: {e}"))?;
    log::write("INFO", &format!("book imported: {book_id}"));
    Ok(())
}

/// 组装诊断文本（纯函数，便于测试）：版本/平台 + 近期失败任务 + 日志尾部。
pub fn format_diagnostics(version: &str, os: &str, arch: &str, failed_tasks: &[String], log_tail: &str) -> String {
    let mut out = format!("WeRead Exporter 诊断信息\n版本: {version}\n系统: {os} ({arch})\n");
    out.push_str("\n== 近期失败任务（最多 5 条）==\n");
    if failed_tasks.is_empty() {
        out.push_str("（无）\n");
    }
    for t in failed_tasks {
        out.push_str(t);
        out.push('\n');
    }
    out.push_str("\n== 应用日志尾部 ==\n");
    out.push_str(log_tail);
    out
}

/// 读应用日志尾部（log.rs 已脱敏凭证，单文件上限 5MB，整读可接受）。
fn read_log_tail(path: &std::path::Path, max_lines: usize) -> String {
    match std::fs::read_to_string(path) {
        Ok(content) => {
            let lines: Vec<&str> = content.lines().collect();
            let start = lines.len().saturating_sub(max_lines);
            lines[start..].join("\n")
        }
        Err(_) => String::new(),
    }
}

/// 诊断信息（设置页一键复制）：问题反馈时附带，免多轮追问。
#[tauri::command]
pub fn diagnostics_text(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let version = app.package_info().version.to_string();
    let mut failed_tasks = Vec::new();
    {
        let conn = state.db.lock().map_err(lock_err)?;
        let mut stmt = conn
            .prepare(
                "SELECT id, format, COALESCE(error_code,''), COALESCE(error_message,''), COALESCE(created_at,'')
                 FROM export_tasks WHERE status='failed' ORDER BY id DESC LIMIT 5",
            )
            .map_err(|e| format!("查询失败任务失败: {e}"))?;
        let rows = stmt
            .query_map([], |r| {
                Ok(format!(
                    "#{} {} {} {} {}",
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| format!("查询失败任务失败: {e}"))?;
        for row in rows {
            failed_tasks.push(row.map_err(|e| format!("读取失败任务失败: {e}"))?);
        }
    }
    let log_tail = read_log_tail(&state.paths.logs.join("app.log"), 100);
    Ok(format_diagnostics(
        &version,
        std::env::consts::OS,
        std::env::consts::ARCH,
        &failed_tasks,
        &log_tail,
    ))
}

#[cfg(test)]
mod tests {
    use super::format_diagnostics;

    #[test]
    fn diagnostics_contains_versions_failed_tasks_and_log() {
        let s = format_diagnostics(
            "0.1.4",
            "macos",
            "aarch64",
            &["#3 epub LOGIN_EXPIRED 登录已失效 2026-11-17".to_string()],
            "2026-11-17 [INFO] app starting\n2026-11-17 [WARN] engine handshake failed: x",
        );
        assert!(s.contains("0.1.4"));
        assert!(s.contains("macos (aarch64)"));
        assert!(s.contains("LOGIN_EXPIRED"));
        assert!(s.ends_with("engine handshake failed: x"));
    }

    #[test]
    fn diagnostics_without_failures_shows_placeholder() {
        let s = format_diagnostics("0.1.4", "windows", "x86_64", &[], "");
        assert!(s.contains("（无）"));
    }
}
