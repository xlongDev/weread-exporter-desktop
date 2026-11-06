use rusqlite::Connection;
use std::path::Path;

/// 顺序迁移：PRAGMA user_version。新增迁移时在数组尾部追加 (v, sql)。
pub const MIGRATIONS: &[(u32, &str)] = &[(1, include_str!("../migrations/0001_init.sql"))];

pub const MAX_BACKUPS: usize = 3;

pub fn open(db_path: &Path) -> Result<Connection, String> {
    if let Some(dir) = db_path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("创建数据目录失败: {e}"))?;
    }
    let conn = Connection::open(db_path).map_err(|e| format!("打开数据库失败: {e}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("设置 WAL 失败: {e}"))?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| format!("启用外键失败: {e}"))?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| format!("设置 busy_timeout 失败: {e}"))?;
    Ok(conn)
}

/// 迁移前 quick_check；每个版本迁移前做文件级备份（保留最近 MAX_BACKUPS 份）。
pub fn migrate(conn: &mut Connection, db_path: &Path) -> Result<(), String> {
    let current: u32 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| format!("读取 user_version 失败: {e}"))?;
    let target = MIGRATIONS.iter().map(|m| m.0).max().unwrap_or(0);
    if current >= target {
        return Ok(());
    }
    let check: String = conn
        .query_row("PRAGMA quick_check", [], |r| r.get(0))
        .map_err(|e| format!("完整性检查执行失败: {e}"))?;
    if check != "ok" {
        return Err(format!("数据库完整性检查未通过: {check}"));
    }
    for (version, sql) in MIGRATIONS {
        if *version > current {
            backup(db_path, current);
            let tx = conn
                .transaction()
                .map_err(|e| format!("开启迁移事务失败: {e}"))?;
            tx.execute_batch(sql).map_err(|e| format!("迁移 v{version} 执行失败: {e}"))?;
            tx.pragma_update(None, "user_version", *version)
                .map_err(|e| format!("写入 user_version 失败: {e}"))?;
            tx.commit().map_err(|e| format!("迁移 v{version} 提交失败: {e}"))?;
        }
    }
    Ok(())
}

fn backup(db_path: &Path, from_version: u32) {
    // WAL 库先 checkpoint 再整文件复制，保证备份自洽
    let _ = std::fs::copy(db_path, db_path.with_extension(format!("bak-v{from_version}")));
    let dir = match db_path.parent() {
        Some(d) => d,
        None => return,
    };
    let mut baks: Vec<std::path::PathBuf> = match std::fs::read_dir(dir) {
        Ok(rd) => rd
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.extension()
                    .is_some_and(|x| x.to_string_lossy().starts_with("bak-v"))
            })
            .collect(),
        Err(_) => return,
    };
    baks.sort();
    while baks.len() > MAX_BACKUPS {
        let oldest = baks.remove(0);
        let _ = std::fs::remove_file(oldest);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_db(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("weread-db-test-{name}-{pid}", pid = std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("test.db")
    }

    #[test]
    fn migrate_from_scratch_reaches_latest_version() {
        let path = tmp_db("fresh");
        let mut conn = open(&path).unwrap();
        migrate(&mut conn, &path).unwrap();
        let v: u32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 1);
        // 关键表存在
        for t in ["books", "export_tasks", "task_chapters", "exported_files", "settings"] {
            let n: i64 = conn
                .query_row("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", [&t], |r| r.get(0))
                .unwrap();
            assert_eq!(n, 1, "table {t} missing");
        }
        // settings 键唯一约束生效
        conn.execute("INSERT INTO settings(key, value) VALUES ('a', '1')", []).unwrap();
        assert!(conn.execute("INSERT INTO settings(key, value) VALUES ('a', '2')", []).is_err());
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn migrate_is_idempotent() {
        let path = tmp_db("idem");
        let mut conn = open(&path).unwrap();
        migrate(&mut conn, &path).unwrap();
        migrate(&mut conn, &path).unwrap(); // 第二次应无操作且不报错
        let v: u32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 1);
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }
}
