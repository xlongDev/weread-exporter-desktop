//! 引擎任务编排：派生 worker、路由协议事件、维护 SQLite 任务状态机（docs/06 §4）。

use crate::engine::protocol::{self, EngineEvent};
use crate::engine::worker::{resolve_python, EngineWorker};
use crate::log;
use crate::state::AppState;
use rusqlite::Connection;
use serde::Serialize;
use serde_json::Value;
use std::io::BufRead;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// 引擎根目录：dev = 仓库 engine/；打包 = 资源目录 engine/（Phase 8 放置）。
pub fn engine_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        manifest
            .join("../../../engine")
            .canonicalize()
            .map_err(|e| format!("定位引擎目录失败: {e}"))
    } else {
        app.path()
            .resource_dir()
            .map_err(|e| format!("资源目录不可用: {e}"))
            .map(|p| p.join("engine"))
    }
}

#[derive(Debug, Clone)]
pub struct QueuedTask {
    pub task_id: i64,
    pub book_id: String,
    pub format: String,
    pub output_dir: String,
    pub options: Value,
}

/// 无运行中任务则立即启动；否则入队（浏览器 profile 单实例，docs/02 #5）。
pub fn enqueue_or_start<R: Runtime>(app: &AppHandle<R>, qt: QueuedTask) -> Result<bool, String> {
    let state = app.state::<AppState>();
    let idle = {
        let running = state.running.lock().map_err(|_| "运行表锁损坏")?;
        running.is_empty()
    };
    if idle {
        start_task_run(
            app.clone(),
            qt.task_id,
            qt.book_id,
            qt.format,
            qt.output_dir,
            qt.options,
            std::env::var("WEREAD_ENGINE_MOCK").as_deref() == Ok("1"),
        )?;
        return Ok(true);
    }
    state
        .queue
        .lock()
        .map_err(|_| "队列锁损坏")?
        .push_back(qt);
    Ok(false)
}

/// 任务终态后调用：若队列有等待任务则启动下一个（跳过已取消的）。
fn start_next_queued<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    let next = {
        let running = match state.running.lock() {
            Ok(r) => r,
            Err(_) => return,
        };
        if !running.is_empty() {
            return;
        }
        let mut queue = match state.queue.lock() {
            Ok(q) => q,
            Err(_) => return,
        };
        loop {
            match queue.pop_front() {
                Some(qt) => {
                    let cancelled = state.db.lock().ok().and_then(|c| {
                        c.query_row(
                            "SELECT status FROM export_tasks WHERE id=?1",
                            [qt.task_id],
                            |r| r.get::<_, String>(0),
                        )
                        .ok()
                    });
                    if cancelled.as_deref() != Some("cancelled") {
                        break Some(qt);
                    }
                }
                None => break None,
            }
        }
    };
    if let Some(qt) = next
        && let Err(e) = start_task_run(
            app.clone(),
            qt.task_id,
            qt.book_id,
            qt.format,
            qt.output_dir,
            qt.options,
            std::env::var("WEREAD_ENGINE_MOCK").as_deref() == Ok("1"),
        )
    {
        log::write("ERROR", &format!("启动排队任务失败: {e}"));
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct OutputFile {
    pub format: String,
    pub file_path: String,
    #[serde(rename = "file_size")]
    pub size: i64,
}

pub struct RunningTask {
    pub worker: Arc<EngineWorker>,
    pub cancel_requested: AtomicBool,
    pub terminal_seen: Mutex<Option<String>>,
    pub outputs: Mutex<Vec<OutputFile>>,
}

#[derive(Debug, Serialize)]
pub struct EngineStatus {
    pub ready: bool,
    pub engine_version: String,
    pub python_version: String,
    pub error: Option<String>,
}

/// 引擎握手：启动 worker 直到 engine.ready，随后优雅关闭。
pub fn engine_status<R: Runtime>(app: &AppHandle<R>) -> Result<EngineStatus, String> {
    let root = engine_root(app)?;
    let python = resolve_python(&root);
    let cwd = root.parent().ok_or("引擎目录缺少父目录")?;
    let worker = EngineWorker::spawn(&python, cwd, false)?;

    let stdout = worker.take_stdout()?;

    let (tx, rx) = mpsc::channel::<Option<EngineEvent>>();
    thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);
        if let Some(Ok(first)) = reader.lines().next() {
            let _ = tx.send(protocol::parse_line(&first));
        } else {
            let _ = tx.send(None);
        }
    });

    let first = rx
        .recv_timeout(std::time::Duration::from_secs(20))
        .map_err(|_| "引擎握手超时".to_string());

    // 无论成败都优雅收尾
    let _ = worker.send_line(&protocol::command_line("shutdown", None, None));
    worker.close_and_wait_for_child();

    let ev = match first? {
        Some(ev) => ev,
        None => {
            return Ok(EngineStatus {
                ready: false,
                engine_version: String::new(),
                python_version: String::new(),
                error: Some("引擎未发送握手消息".into()),
            })
        }
    };
    if ev.event != "engine.ready" {
        return Ok(EngineStatus {
            ready: false,
            engine_version: String::new(),
            python_version: String::new(),
            error: Some(format!("引擎首条消息异常: {}", ev.event)),
        });
    }
    Ok(EngineStatus {
        ready: true,
        engine_version: ev.data["engine_version"].as_str().unwrap_or("").into(),
        python_version: ev.data["python_version"].as_str().unwrap_or("").into(),
        error: None,
    })
}

/// 引擎握手（带诊断日志）：确认 worker 可启动并返回版本信息。
pub fn engine_status_logged(app: &AppHandle) -> EngineStatus {
    match engine_status(app) {
        Ok(st) => {
            if st.ready {
                log::write(
                    "INFO",
                    &format!("engine handshake ok: v{} (python {})", st.engine_version, st.python_version),
                );
            } else {
                log::write("WARN", &format!("engine handshake failed: {}", st.error.clone().unwrap_or_default()));
            }
            st
        }
        Err(e) => {
            log::write("WARN", &format!("engine handshake error: {e}"));
            EngineStatus {
                ready: false,
                engine_version: String::new(),
                python_version: String::new(),
                error: Some(e),
            }
        }
    }
}

/// 一次性引擎操作（登录 / 会话检查 / 书籍信息）：派生 worker、路由事件、终态后回收。
/// 与任务的区别：不写任务状态机，只向前端转发事件（task_id 字段承载 op_id）。
pub fn start_op<R: Runtime>(
    app: &AppHandle<R>,
    op_id: &str,
    cmd: &str,
    params: Value,
    profile_dir: &std::path::Path,
    logs_dir: &std::path::Path,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let ops = state.ops.lock().map_err(|_| "ops 表锁损坏")?;
        if ops.contains_key(op_id) {
            return Err("同名操作正在进行中".into());
        }
    }
    let root = engine_root(app)?;
    let python = resolve_python(&root);
    let cwd = root.parent().ok_or("引擎目录缺少父目录")?.to_path_buf();
    let worker = Arc::new(EngineWorker::spawn_with_profile(&python, &cwd, false, Some(profile_dir))?);
    state
        .ops
        .lock()
        .map_err(|_| "ops 表锁损坏")?
        .insert(op_id.to_string(), worker.clone());

    let log_path = logs_dir.join(format!("op-{op_id}.log"));
    if let Ok(stderr) = worker.take_stderr() {
        thread::spawn(move || {
            let reader = std::io::BufReader::new(stderr);
            let mut file = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_path)
                .ok();
            for line in reader.lines().map_while(Result::ok) {
                let safe = crate::log::redact(&line);
                if let Some(f) = file.as_mut() {
                    use std::io::Write;
                    let _ = writeln!(f, "{safe}");
                }
            }
        });
    }

    let stdout = worker.take_stdout()?;
    let op_id_owned = op_id.to_string();
    let terminal = terminal_event_of(cmd).to_string();
    let app_ev = app.clone();
    let worker_for_route = worker.clone();
    thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            let Some(ev) = protocol::parse_line(&line) else { continue };
            let is_mine = ev.task_id.as_deref() == Some(op_id_owned.as_str());
            let _ = app_ev.emit("engine://event", &ev);
            if is_mine && ev.event == terminal {
                let _ = worker_for_route.send_line(&protocol::command_line("shutdown", None, None));
                worker_for_route.close_and_wait_for_child();
                if let Some(state) = app_ev.try_state::<AppState>()
                    && let Ok(mut ops) = state.ops.lock()
                {
                    ops.remove(&op_id_owned);
                }
                break;
            }
        }
    });

    worker.send_line(&protocol::command_line(cmd, Some(op_id), Some(params)))?;
    Ok(())
}

fn terminal_event_of(cmd: &str) -> &'static str {
    match cmd {
        "auth_check" | "login" => "auth.status",
        "book_info" => "book.validation",
        _ => "engine.shutdown",
    }
}
/// 启动一次真实任务执行（worker 生命周期 + 事件路由）。
pub fn start_task_run<R: Runtime>(
    app: AppHandle<R>,
    task_id: i64,
    book_id: String,
    format: String,
    output_dir: String,
    options: Value,
    mock: bool,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let root = engine_root(&app)?;
    let python = resolve_python(&root);
    let cwd = root.parent().ok_or("引擎目录缺少父目录")?.to_path_buf();
    let _ = std::fs::create_dir_all(&state.paths.browser_profile);

    let worker = Arc::new(EngineWorker::spawn_with_profile(
        &python,
        &cwd,
        mock,
        Some(&state.paths.browser_profile),
    )?);
    let running = Arc::new(RunningTask {
        worker: worker.clone(),
        cancel_requested: AtomicBool::new(false),
        terminal_seen: Mutex::new(None),
        outputs: Mutex::new(Vec::new()),
    });
    state
        .running
        .lock()
        .map_err(|_| "运行表锁损坏")?
        .insert(task_id, running.clone());

    // 任务日志：stderr 全量落盘
    let log_path = state.paths.logs.join(format!("task-{task_id}.log"));
    if let Ok(stderr) = worker.take_stderr() {
        thread::spawn(move || {
            let reader = std::io::BufReader::new(stderr);
            let mut file = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_path)
                .ok();
            for line in reader.lines().map_while(Result::ok) {
                let safe = crate::log::redact(&line);
                if let Some(f) = file.as_mut() {
                    use std::io::Write;
                    let _ = writeln!(f, "{safe}");
                }
            }
        });
    }

    let params = serde_json::json!({
        "book_id": book_id,
        "format": format,
        "output_dir": output_dir,
        "options": options,
    });
    let engine_task_id = task_id.to_string();
    worker.send_line(&protocol::command_line(
        "start_task",
        Some(&engine_task_id),
        Some(params),
    ))?;

    // stdout → 协议事件路由（线程内随 stdout EOF 自然结束）
    let stdout = worker.take_stdout()?;
    let app_ev = app.clone();
    thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);
        let mut corrupted = 0u32;
        for line in reader.lines().map_while(Result::ok) {
            match protocol::parse_line(&line) {
                Some(ev) => route_event(&app_ev, &engine_task_id, &running, ev),
                None => {
                    corrupted += 1;
                    if corrupted <= 3 {
                        log::write("WARN", &format!("丢弃损坏协议行 #{corrupted}"));
                    }
                }
            }
        }
        finalize_on_exit(&app_ev, &engine_task_id, &running);
    });

    Ok(())
}

fn route_event<R: Runtime>(app: &AppHandle<R>, engine_task_id: &str, running: &Arc<RunningTask>, ev: EngineEvent) {
    let _ = app.emit("engine://event", &ev);
    let is_mine = ev.task_id.as_deref() == Some(engine_task_id);
    if !is_mine {
        return;
    }
    match ev.event.as_str() {
        "task.output" => {
            let of = OutputFile {
                format: ev.data["format"].as_str().unwrap_or("").into(),
                file_path: ev.data["file_path"].as_str().unwrap_or("").into(),
                size: ev.data["file_size"].as_i64().unwrap_or(0),
            };
            if !of.file_path.is_empty() {
                running.outputs.lock().map(|mut v| v.push(of)).ok();
            }
        }
        "task.completed" | "task.cancelled" | "task.failed" => {
            if let Ok(mut t) = running.terminal_seen.lock() {
                *t = Some(ev.event.clone());
            }
            let state = app.state::<AppState>();
            {
                // 锁作用域显式收敛：后续 start_next_queued 需要再次取 DB 锁（不可重入）
                let conn = match state.db.lock() {
                    Ok(c) => c,
                    Err(e) => {
                        log::write("ERROR", &format!("任务事件落库失败（DB 锁）: {e}"));
                        return;
                    }
                };
                let mut outputs = running.outputs.lock().map(|mut v| std::mem::take(&mut *v)).unwrap_or_default();
                if let Err(e) = apply_task_event(&conn, engine_task_id, &ev, &mut outputs) {
                    log::write("ERROR", &format!("任务事件落库失败: {e}"));
                }
            }
            // 任务结束：通知 worker 退出并回收
            let _ = running
                .worker
                .send_line(&protocol::command_line("shutdown", None, None));
            running.worker.close_and_wait_for_child();
            if let Ok(mut map) = app.state::<AppState>().running.lock()
                && let Ok(id) = engine_task_id.parse::<i64>()
            {
                map.remove(&id);
            }
            start_next_queued(app);
        }
        _ => {
            // 进度类事件落库
            let state = app.state::<AppState>();
            if let Ok(conn) = state.db.lock() {
                let mut outputs = Vec::new();
                let _ = apply_task_event(&conn, engine_task_id, &ev, &mut outputs);
            }
        }
    }
}

/// stdout EOF：若未见终态事件 → 引擎异常退出，收敛任务状态（docs/08 §5.4）。
fn finalize_on_exit<R: Runtime>(app: &AppHandle<R>, engine_task_id: &str, running: &Arc<RunningTask>) {
    let terminal = running.terminal_seen.lock().ok().and_then(|t| t.clone());
    if terminal.is_some() {
        return;
    }
    let cancelled = running.cancel_requested.load(Ordering::SeqCst);
    let (event, code, user_message) = if cancelled {
        ("task.cancelled", "", String::new())
    } else {
        (
            "task.failed",
            "ENGINE_EXITED",
            "引擎进程异常退出，已保存的进度不会丢失，可重试或继续导出".to_string(),
        )
    };
    let ev = EngineEvent {
        protocol_version: protocol::PROTOCOL_VERSION,
        event: event.into(),
        task_id: Some(engine_task_id.into()),
        timestamp: String::new(),
        data: serde_json::json!({"code": code, "message": "worker stdout closed without terminal event", "user_message": user_message}),
    };
    let _ = app.emit("engine://event", &ev);
    let state = app.state::<AppState>();
    if let Ok(conn) = state.db.lock() {
        let mut outputs = Vec::new();
        let _ = apply_task_event(&conn, engine_task_id, &ev, &mut outputs);
    }
    if let Ok(mut map) = app.state::<AppState>().running.lock()
        && let Ok(id) = engine_task_id.parse::<i64>()
    {
        map.remove(&id);
    }
    start_next_queued(app);
    log::write("WARN", &format!("任务 {engine_task_id} 的引擎进程在终态事件前退出"));
}

/// 把引擎事件落到 SQLite 任务状态机。返回值表示是否为终态事件。
/// （独立函数便于内存库单测；outputs 由调用方持有，completed 时插入 exported_files。）
pub fn apply_task_event(
    conn: &Connection,
    engine_task_id: &str,
    ev: &EngineEvent,
    outputs: &mut Vec<OutputFile>,
) -> Result<bool, String> {
    let task_id: i64 = engine_task_id
        .parse()
        .map_err(|_| format!("无效任务编号: {engine_task_id}"))?;
    match ev.event.as_str() {
        "task.started" => {
            conn.execute(
                "UPDATE export_tasks SET status='running', started_at=datetime('now'),
                 current_stage='crawl', updated_at=datetime('now') WHERE id=?1",
                rusqlite::params![task_id],
            )
            .map_err(|e| format!("更新任务启动状态失败: {e}"))?;
            Ok(false)
        }
        "task.progress" => {
            let total = ev.data["total_chapters"].as_i64();
            let done = ev.data["chapters_done"].as_i64();
            let ratio: Option<f64> = match (total, done) {
                (Some(t), Some(d)) if t > 0 => Some((d as f64 / t as f64 * 100.0).min(99.0)),
                _ => None,
            };
            conn.execute(
                "UPDATE export_tasks SET
                   current_stage = COALESCE(?2, current_stage),
                   current_chapter = COALESCE(?3, current_chapter),
                   pages_done = COALESCE(?4, pages_done),
                   words_done = COALESCE(?5, words_done),
                   progress = COALESCE(?6, progress),
                   updated_at = datetime('now')
                 WHERE id=?1",
                rusqlite::params![
                    task_id,
                    ev.data["stage"].as_str(),
                    ev.data["chapter_title"].as_str(),
                    ev.data["page"].as_i64(),
                    ev.data["words"].as_i64(),
                    ratio,
                ],
            )
            .map_err(|e| format!("更新任务进度失败: {e}"))?;
            Ok(false)
        }
        "task.chapter_done" => {
            conn.execute(
                "INSERT INTO task_chapters(task_id, chapter_idx, title, status, updated_at)
                 VALUES (?1, ?2, ?3, 'done', datetime('now'))
                 ON CONFLICT(task_id, chapter_idx) DO UPDATE SET
                   title=excluded.title, status='done', updated_at=datetime('now')",
                rusqlite::params![
                    task_id,
                    ev.data["chapter_idx"].as_i64().unwrap_or(0),
                    ev.data["title"].as_str().unwrap_or(""),
                ],
            )
            .map_err(|e| format!("记录章节进度失败: {e}"))?;
            Ok(false)
        }
        "task.output" => {
            outputs.push(OutputFile {
                format: ev.data["format"].as_str().unwrap_or("").into(),
                file_path: ev.data["file_path"].as_str().unwrap_or("").into(),
                size: ev.data["file_size"].as_i64().unwrap_or(0),
            });
            Ok(false)
        }
        "task.completed" => {
            insert_outputs(conn, task_id, ev, outputs)?;
            conn.execute(
                "UPDATE export_tasks SET status='completed', progress=100,
                 finished_at=datetime('now'), updated_at=datetime('now') WHERE id=?1",
                rusqlite::params![task_id],
            )
            .map_err(|e| format!("完成任务落库失败: {e}"))?;
            Ok(true)
        }
        "task.cancelled" => {
            conn.execute(
                "UPDATE export_tasks SET status='cancelled', finished_at=datetime('now'),
                 updated_at=datetime('now') WHERE id=?1",
                rusqlite::params![task_id],
            )
            .map_err(|e| format!("取消任务落库失败: {e}"))?;
            Ok(true)
        }
        "task.failed" => {
            let code = ev.data["code"].as_str().unwrap_or("ENGINE_ERROR");
            let user_message = ev.data["user_message"].as_str().unwrap_or("导出失败");
            conn.execute(
                "UPDATE export_tasks SET status='failed', error_code=?2, error_message=?3,
                 finished_at=datetime('now'), updated_at=datetime('now') WHERE id=?1",
                rusqlite::params![task_id, code, user_message],
            )
            .map_err(|e| format!("失败任务落库失败: {e}"))?;
            Ok(true)
        }
        _ => Ok(false),
    }
}

fn insert_outputs(conn: &Connection, task_id: i64, ev: &EngineEvent, outputs: &[OutputFile]) -> Result<(), String> {
    let book_id: String = conn
        .query_row("SELECT book_id FROM export_tasks WHERE id=?1", [task_id], |r| r.get(0))
        .map_err(|e| format!("查询任务书籍失败: {e}"))?;
    let mut from_event = outputs.to_vec();
    if let Some(arr) = ev.data["outputs"].as_array() {
        for o in arr {
            let path = o["file_path"].as_str().unwrap_or("").to_string();
            if path.is_empty() || from_event.iter().any(|x| x.file_path == path) {
                continue;
            }
            let size = std::fs::metadata(&path).map(|m| m.len() as i64).unwrap_or(0);
            from_event.push(OutputFile {
                format: o["format"].as_str().unwrap_or("").into(),
                file_path: path,
                size,
            });
        }
    }
    for of in &from_event {
        if of.file_path.is_empty() {
            continue;
        }
        let file_name = std::path::Path::new(&of.file_path)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        conn.execute(
            "INSERT INTO exported_files(book_id, task_id, format, file_path, file_name, file_size)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![book_id, task_id, of.format, of.file_path, file_name, of.size],
        )
        .map_err(|e| format!("记录产物失败: {e}"))?;
    }
    Ok(())
}

/// 供测试使用：内存库 + 迁移
#[cfg(test)]
pub fn test_conn() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    for (version, sql) in crate::db::MIGRATIONS {
        conn.execute_batch(sql).unwrap();
        conn.pragma_update(None, "user_version", *version).unwrap();
    }
    conn
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed_task(conn: &Connection) -> i64 {
        conn.execute(
            "INSERT INTO books(book_id, title) VALUES ('bk12345678', '测试书')
             ON CONFLICT(book_id) DO NOTHING",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO export_tasks(book_id, format, output_dir) VALUES ('bk12345678', 'markdown', '/tmp/x')",
            [],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn ev(event: &str, data: Value) -> EngineEvent {
        EngineEvent {
            protocol_version: 1,
            event: event.into(),
            task_id: None,
            timestamp: String::new(),
            data,
        }
    }

    #[test]
    fn task_state_machine_full_lifecycle() {
        let conn = test_conn();
        let id = seed_task(&conn);
        let tid = id.to_string();
        let mut outputs = Vec::new();

        assert!(!apply_task_event(&conn, &tid, &ev("task.started", serde_json::json!({})), &mut outputs).unwrap());
        let (status, started): (String, Option<String>) = conn
            .query_row("SELECT status, started_at FROM export_tasks WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(status, "running");
        assert!(started.is_some());

        assert!(!apply_task_event(&conn, &tid, &ev("task.progress", serde_json::json!({"stage":"crawl","chapter_title":"第一章","page":3,"words":120,"total_chapters":10,"chapters_done":2})), &mut outputs).unwrap());
        let (stage, chapter, pages, words, progress): (String, String, i64, i64, f64) = conn
            .query_row("SELECT current_stage, current_chapter, pages_done, words_done, progress FROM export_tasks WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))
            .unwrap();
        assert_eq!((stage.as_str(), chapter.as_str(), pages, words), ("crawl", "第一章", 3, 120));
        assert!((progress - 20.0).abs() < 0.01);

        assert!(!apply_task_event(&conn, &tid, &ev("task.chapter_done", serde_json::json!({"chapter_idx":1,"title":"第一章","words":60})), &mut outputs).unwrap());
        let n: i64 = conn.query_row("SELECT count(*) FROM task_chapters WHERE task_id=?1 AND status='done'", [id], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);

        outputs.push(OutputFile { format: "markdown".into(), file_path: "/tmp/a.md".into(), size: 55 });
        let terminal = apply_task_event(&conn, &tid, &ev("task.completed", serde_json::json!({"outputs":[{"format":"markdown","file_path":"/tmp/a.md"}]})), &mut outputs).unwrap();
        assert!(terminal);
        let status: String = conn.query_row("SELECT status FROM export_tasks WHERE id=?1", [id], |r| r.get(0)).unwrap();
        assert_eq!(status, "completed");
        let (files, size): (i64, i64) = conn
            .query_row("SELECT count(*), COALESCE(sum(file_size),0) FROM exported_files WHERE task_id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(files, 1);
        assert_eq!(size, 55);
    }

    #[test]
    fn task_failure_and_cancel_paths() {
        let conn = test_conn();
        let id = seed_task(&conn);
        let mut outputs = Vec::new();
        let terminal = apply_task_event(&conn, &id.to_string(), &ev("task.failed", serde_json::json!({"code":"CRAWL_FAILED","user_message":"抓取未完成"})), &mut outputs).unwrap();
        assert!(terminal);
        let (status, code, msg): (String, String, String) = conn
            .query_row("SELECT status, error_code, error_message FROM export_tasks WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap();
        assert_eq!((status.as_str(), code.as_str(), msg.as_str()), ("failed", "CRAWL_FAILED", "抓取未完成"));

        let id2 = seed_task(&conn);
        let terminal = apply_task_event(&conn, &id2.to_string(), &ev("task.cancelled", serde_json::json!({})), &mut outputs).unwrap();
        assert!(terminal);
        let status: String = conn.query_row("SELECT status FROM export_tasks WHERE id=?1", [id2], |r| r.get(0)).unwrap();
        assert_eq!(status, "cancelled");
    }

    #[test]
    fn full_task_run_via_mock_worker() {
        use crate::db;
        use std::collections::HashMap;

        // 全链路：Rust 派生真实 python worker（WEREAD_ENGINE_MOCK=1 回放协议）→ 事件路由 → SQLite 状态机
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let dir = std::env::temp_dir().join(format!("weread-mgr-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("t.db");
        let mut conn = db::open(&db_path).unwrap();
        db::migrate(&mut conn, &db_path).unwrap();
        conn.execute("INSERT INTO books(book_id, title) VALUES ('mockbook123', 'Mock 书')", []).unwrap();
        let dir_str = dir.to_string_lossy().into_owned();
        conn.execute(
            "INSERT INTO export_tasks(book_id, format, output_dir, status) VALUES ('mockbook123', 'markdown', ?1, 'waiting')",
            [&dir_str],
        )
        .unwrap();
        let task_id = conn.last_insert_rowid();
        drop(conn);

        app.manage(AppState {
            db: Mutex::new(db::open(&db_path).unwrap()),
            paths: crate::state::paths_of(),
            running: Mutex::new(HashMap::new()),
            ops: Mutex::new(HashMap::new()),
            queue: Mutex::new(std::collections::VecDeque::new()),
        });
        let handle = app.handle().clone();
        start_task_run(
            handle,
            task_id,
            "mockbook123".into(),
            "markdown".into(),
            dir.to_string_lossy().into_owned(),
            serde_json::json!({}),
            true,
        )
        .expect("启动 mock 任务失败");

        // 轮询等待终态（mock 回放 <1s）
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
        let mut status = String::from("waiting");
        while std::time::Instant::now() < deadline {
            let state = app.state::<AppState>();
            let conn = state.db.lock().unwrap();
            status = conn
                .query_row("SELECT status FROM export_tasks WHERE id=?1", [task_id], |r| r.get(0))
                .unwrap();
            drop(conn);
            drop(state);
            if status == "completed" || status == "failed" || status == "cancelled" {
                break;
            }
            thread::sleep(std::time::Duration::from_millis(100));
        }
        assert_eq!(status, "completed", "mock 任务应真实跑完状态机");
        let n: i64 = app
            .state::<AppState>()
            .db
            .lock()
            .unwrap()
            .query_row("SELECT count(*) FROM exported_files WHERE task_id=?1", [task_id], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1, "completed 应记录产物");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn full_task_run_with_real_engine_and_data() {
        // 真实引擎（非 mock）+ 仓库真实抓取数据 → Markdown 导出全链路。
        // 数据复制到隔离临时目录，不触碰真实 output/。
        use crate::db;
        use std::collections::HashMap;

        let repo = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../");
        let output_dir_repo = repo.join("output");
        let Ok(entries) = std::fs::read_dir(&output_dir_repo) else {
            eprintln!("跳过：仓库无 output/ 数据");
            return;
        };
        let book_dir = entries
            .flatten()
            .map(|e| e.path())
            .find(|p| p.is_dir() && p.to_string_lossy().ends_with("_v2"));
        let Some(book_dir) = book_dir else {
            eprintln!("跳过：output/ 内无书籍数据目录");
            return;
        };
        let book_id = book_dir.file_name().unwrap().to_string_lossy().to_string();
        let book_id = book_id.strip_suffix("_v2").unwrap().to_string();

        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let dir = std::env::temp_dir().join(format!("weread-real-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let data_dir = dir.join("data");
        std::fs::create_dir_all(&data_dir).unwrap();
        // 仅复制 chapters 与 meta（导出 markdown 所需），避免拷贝整包 raw/插图
        let src = book_dir.clone();
        let dst = data_dir.join(format!("{book_id}_v2"));
        std::fs::create_dir_all(dst.join("chapters")).unwrap();
        for entry in std::fs::read_dir(src.join("chapters")).unwrap().flatten() {
            let _ = std::fs::copy(entry.path(), dst.join("chapters").join(entry.file_name()));
        }
        for f in ["meta.json"] {
            let _ = std::fs::copy(src.join(f), dst.join(f));
        }

        let db_path = dir.join("t.db");
        let mut conn = db::open(&db_path).unwrap();
        db::migrate(&mut conn, &db_path).unwrap();
        conn.execute(
            "INSERT INTO books(book_id, title) VALUES (?1, '真实回归书')",
            [&book_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO export_tasks(book_id, format, output_dir, status) VALUES (?1, 'markdown', ?2, 'waiting')",
            rusqlite::params![book_id, data_dir.to_string_lossy().into_owned()],
        )
        .unwrap();
        let task_id = conn.last_insert_rowid();
        drop(conn);

        app.manage(AppState {
            db: Mutex::new(db::open(&db_path).unwrap()),
            paths: crate::state::paths_of(),
            running: Mutex::new(HashMap::new()),
            ops: Mutex::new(HashMap::new()),
            queue: Mutex::new(std::collections::VecDeque::new()),
        });
        let handle = app.handle().clone();
        start_task_run(
            handle,
            task_id,
            book_id.clone(),
            "markdown".into(),
            data_dir.to_string_lossy().into_owned(),
            serde_json::json!({"skip_crawl": true}),
            false,
        )
        .expect("启动真实任务失败");

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(120);
        let mut status = String::from("waiting");
        while std::time::Instant::now() < deadline {
            let state = app.state::<AppState>();
            let conn = state.db.lock().unwrap();
            status = conn
                .query_row("SELECT status FROM export_tasks WHERE id=?1", [task_id], |r| r.get(0))
                .unwrap();
            drop(conn);
            drop(state);
            if status == "completed" || status == "failed" {
                break;
            }
            thread::sleep(std::time::Duration::from_millis(200));
        }
        assert_eq!(status, "completed", "真实引擎导出应完成");
        eprintln!("[real-test] status={status}");
        let (n, total_size): (i64, i64) = app
            .state::<AppState>()
            .db
            .lock()
            .unwrap()
            .query_row(
                "SELECT count(*), COALESCE(sum(file_size),0) FROM exported_files WHERE task_id=?1",
                [task_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert!(n >= 1, "应记录产物文件");
        assert!(total_size > 0, "产物应有真实大小");
        eprintln!("[real-test] outputs={n} total_size={total_size}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn task_queue_serializes_execution() {
        // 队列约束：同一时刻仅一个任务占用引擎（浏览器 profile 单实例）。
        use crate::db;
        use std::collections::HashMap;

        unsafe { std::env::set_var("WEREAD_ENGINE_MOCK", "1") };

        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let dir = std::env::temp_dir().join(format!("weread-queue-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("t.db");
        let mut conn = db::open(&db_path).unwrap();
        db::migrate(&mut conn, &db_path).unwrap();
        for bid in ["bookaaa111", "bookbbb222"] {
            conn.execute("INSERT INTO books(book_id, title) VALUES (?1, '队列书')", [bid]).unwrap();
        }
        let mk_task = |bid: &str| -> i64 {
            conn.execute(
                "INSERT INTO export_tasks(book_id, format, output_dir, status) VALUES (?1, 'markdown', '/tmp', 'waiting')",
                [bid],
            )
            .unwrap();
            conn.last_insert_rowid()
        };
        let t1 = mk_task("bookaaa111");
        let t2 = mk_task("bookbbb222");
        drop(conn);

        app.manage(AppState {
            db: Mutex::new(db::open(&db_path).unwrap()),
            paths: crate::state::paths_of(),
            running: Mutex::new(HashMap::new()),
            ops: Mutex::new(HashMap::new()),
            queue: Mutex::new(std::collections::VecDeque::new()),
        });
        let handle = app.handle().clone();

        let started1 = enqueue_or_start(
            &handle,
            QueuedTask { task_id: t1, book_id: "bookaaa111".into(), format: "markdown".into(), output_dir: dir.to_string_lossy().into_owned(), options: serde_json::json!({}) },
        )
        .unwrap();
        assert!(started1, "空闲时应立即启动");
        let started2 = enqueue_or_start(
            &handle,
            QueuedTask { task_id: t2, book_id: "bookbbb222".into(), format: "markdown".into(), output_dir: dir.to_string_lossy().into_owned(), options: serde_json::json!({}) },
        )
        .unwrap();
        assert!(!started2, "占用时应排队");

        // 两个任务都应最终完成（队列依次启动）
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        loop {
            let state = app.state::<AppState>();
            let statuses: Vec<String> = {
                let c = state.db.lock().unwrap();
                let mut stmt = c.prepare("SELECT status FROM export_tasks ORDER BY id").unwrap();
                let rows = stmt.query_map([], |r| r.get(0)).unwrap();
                rows.map_while(Result::ok).collect()
            };
            drop(state);
            if statuses.iter().all(|s| s != "running" && s != "waiting")
                || std::time::Instant::now() > deadline
            {
                assert!(
                    statuses.iter().all(|s| s == "completed"),
                    "两个任务都应完成，实际: {statuses:?}"
                );
                break;
            }
            thread::sleep(std::time::Duration::from_millis(150));
        }
        unsafe { std::env::remove_var("WEREAD_ENGINE_MOCK") };
        let _ = std::fs::remove_dir_all(&dir);
    }
}
