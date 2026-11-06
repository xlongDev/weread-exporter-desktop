//! 协议 v1 消息（docs/08-engine-protocol.md）的 Rust 侧定义与解析。

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineEvent {
    #[serde(rename = "protocol_version")]
    pub protocol_version: u32,
    #[serde(rename = "event")]
    pub event: String,
    #[serde(rename = "task_id")]
    pub task_id: Option<String>,
    #[serde(default)]
    pub timestamp: String,
    #[serde(default)]
    pub data: Value,
}

/// 解析一行协议消息。空行 / 损坏行 / 未知主版本 → None（调用方丢弃并计数，docs/08 §5）。
pub fn parse_line(line: &str) -> Option<EngineEvent> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    match serde_json::from_str::<EngineEvent>(trimmed) {
        Ok(ev) if ev.protocol_version == PROTOCOL_VERSION && !ev.event.is_empty() => Some(ev),
        _ => None,
    }
}

/// 构造发给 worker 的指令行（Rust → stdin）。
pub fn command_line(cmd: &str, task_id: Option<&str>, params: Option<Value>) -> String {
    let obj = serde_json::json!({
        "protocol_version": PROTOCOL_VERSION,
        "cmd": cmd,
        "task_id": task_id,
        "params": params,
    });
    obj.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_valid_event() {
        let line = r#"{"protocol_version":1,"event":"task.progress","task_id":"t1","timestamp":"2026-01-01T00:00:00Z","data":{"page":3}}"#;
        let ev = parse_line(line).expect("should parse");
        assert_eq!(ev.event, "task.progress");
        assert_eq!(ev.task_id.as_deref(), Some("t1"));
        assert_eq!(ev.data["page"], 3);
    }

    #[test]
    fn rejects_corrupt_and_foreign_lines() {
        assert!(parse_line("").is_none());
        assert!(parse_line("   \n").is_none());
        assert!(parse_line("not json at all").is_none());
        assert!(parse_line(r#"{"protocol_version":2,"event":"x"}"#).is_none());
        assert!(parse_line(r#"{"protocol_version":1}"#).is_none()); // 缺 event
    }

    #[test]
    fn parses_event_with_missing_optionals() {
        let ev = parse_line(r#"{"protocol_version":1,"event":"engine.ready","data":{}}"#).unwrap();
        assert_eq!(ev.task_id, None);
        assert_eq!(ev.timestamp, "");
    }

    #[test]
    fn command_line_roundtrip() {
        let line = command_line("start_task", Some("42"), Some(json!({"book_id":"abc","format":"pdf"})));
        let v: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(v["cmd"], "start_task");
        assert_eq!(v["task_id"], "42");
        assert_eq!(v["params"]["format"], "pdf");
        assert_eq!(v["protocol_version"], 1);
    }
}
