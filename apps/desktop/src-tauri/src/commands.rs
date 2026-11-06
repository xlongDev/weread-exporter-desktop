//! Tauri 命令面（docs/10 安全设计）：前端唯一可触达的 Rust 接口。

use crate::log;
use crate::state::{paths_of, AppPaths, AppState};
use rusqlite::Connection;
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
];

#[derive(Serialize)]
pub struct Stats {
    books: i64,
    tasks_total: i64,
    tasks_completed: i64,
    tasks_running: i64,
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
        books: one("SELECT count(*) FROM books")?,
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
