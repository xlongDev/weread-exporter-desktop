//! 极简文件日志：应用数据目录/logs/app.log，超过 5MB 轮转为 app.log.1。
//! 红线（docs/10）：调用方不得写入 Cookie 等敏感值；redact() 兜底过滤。

use std::io::Write;
use std::path::PathBuf;
use std::sync::OnceLock;

const MAX_SIZE: u64 = 5 * 1024 * 1024;
static LOGGER: OnceLock<Option<Logger>> = OnceLock::new();

pub struct Logger {
    path: PathBuf,
}

pub fn init(logs_dir: PathBuf) {
    let _ = std::fs::create_dir_all(&logs_dir);
    let _ = LOGGER.set(Some(Logger { path: logs_dir.join("app.log") }));
}

pub fn write(level: &str, msg: &str) {
    let Some(Some(logger)) = LOGGER.get() else { return };
    // 敏感值兜底脱敏
    let msg = redact(msg);
    if let Ok(meta) = std::fs::metadata(&logger.path)
        && meta.len() > MAX_SIZE
    {
        let _ = std::fs::rename(&logger.path, logger.path.with_extension("log.1"));
    }
    let now = std::time::SystemTime::now();
    let ts = humantime::format_rfc3339_millis(now);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&logger.path) {
        let _ = writeln!(f, "{ts} [{level}] {msg}");
    }
}

/// 过滤 wr_skey / wr_vid / wr_rt 等凭证值的明文
pub fn redact(msg: &str) -> String {
    let mut out = String::with_capacity(msg.len());
    for token in msg.split_whitespace() {
        let lower = token.to_ascii_lowercase();
        if ["wr_skey=", "wr_vid=", "wr_rt="].iter().any(|p| lower.contains(p)) {
            out.push_str("[REDACTED]");
        } else {
            out.push_str(token);
        }
        out.push(' ');
    }
    out.trim_end().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_session_cookies() {
        let s = redact("cookie header wr_skey=abc123 and wr_vid=999 ok");
        assert!(!s.contains("abc123"));
        assert!(!s.contains("999"));
        assert!(s.contains("[REDACTED]"));
    }
}
