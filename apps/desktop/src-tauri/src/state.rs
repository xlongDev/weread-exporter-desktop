use rusqlite::Connection;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Serialize, Clone)]
pub struct AppPaths {
    pub app_data: PathBuf,
    pub db: PathBuf,
    pub logs: PathBuf,
    pub browser_profile: PathBuf,
}

pub struct AppState {
    pub db: Mutex<Connection>,
    pub paths: AppPaths,
}

pub fn paths_of() -> AppPaths {
    let base = dirs::data_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join(".local/share"))
        .join("weread-exporter");
    AppPaths {
        app_data: base.clone(),
        db: base.join("weread-exporter.db"),
        logs: base.join("logs"),
        browser_profile: base.join("browser_profile"),
    }
}
