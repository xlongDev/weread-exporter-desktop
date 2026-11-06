mod commands;
mod db;
mod log;
mod state;

use state::{paths_of, AppState};

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

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            db: std::sync::Mutex::new(conn),
            paths,
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_stats,
            commands::get_settings,
            commands::set_setting,
            commands::get_paths,
            commands::reveal_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
