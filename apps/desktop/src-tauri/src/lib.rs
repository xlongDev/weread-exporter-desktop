mod commands;
mod db;
mod engine;
mod log;
mod state;

use state::{paths_of, AppState};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let paths = paths_of();
    log::init(paths.logs.clone());

    let db_path = paths.db.clone();
    let conn = match db::open(&db_path) {
        Ok(mut c) => match db::migrate(&mut c, &db_path) {
            Ok(()) => c,
            Err(e) => {
                log::write("ERROR", &e);
                panic!("数据库迁移失败: {e}");
            }
        },
        Err(e) => panic!("{e}"),
    };
    log::write("INFO", "app starting");

    // 启动预热：后台握手一次引擎（结果缓存于日志；前端仍可随时主动握手）
    let handle_builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            db: std::sync::Mutex::new(conn),
            paths: paths.clone(),
            running: std::sync::Mutex::new(std::collections::HashMap::new()),
            ops: std::sync::Mutex::new(std::collections::HashMap::new()),
            queue: std::sync::Mutex::new(std::collections::VecDeque::new()),
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_stats,
            commands::get_settings,
            commands::set_setting,
            commands::get_paths,
            commands::reveal_path,
            commands::engine_status,
            commands::list_tasks,
            commands::create_task,
            commands::cancel_task,
            commands::reveal_task_dir,
            commands::list_files,
            commands::open_file,
            commands::reveal_exported_file,
            commands::delete_exported_file,
            commands::get_task_detail,
            commands::reveal_task_log,
            commands::force_close,
            commands::start_op,
            commands::cancel_op,
            commands::logout,
            commands::import_book
        ]);

    handle_builder
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                // 启动预热握手：确认引擎可用并落日志（前端也可随时主动握手）
                let _ = engine::manager::engine_status_logged(&handle);
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            // 任务运行时关闭窗口 → 前端确认（docs/05 F8）
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state: tauri::State<AppState> = window.app_handle().state();
                let busy = state
                    .running
                    .lock()
                    .map(|m| !m.is_empty())
                    .unwrap_or(false)
                    || state
                        .ops
                        .lock()
                        .map(|m| !m.is_empty())
                        .unwrap_or(false);
                if busy {
                    api.prevent_close();
                    use tauri::Emitter;
                    let _ = window.app_handle().emit("app://close-requested", ());
                }
            }
        })
        .on_page_load(|_webview, payload| {
            log::write("INFO", &format!("page load [{:?}]: {}", payload.event(), payload.url()));
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
