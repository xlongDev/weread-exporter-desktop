"""协议 v1（docs/08-engine-protocol.md）。

- stdout 只输出协议消息：每行一个独立 JSON 对象（JSON Lines）。
- 人类可读日志一律走 stderr。
"""
import json
import sys
from datetime import datetime, timezone

PROTOCOL_VERSION = 1

# 协议通道在导入时固定绑定真实 stdout；
# worker 模式下 sys.stdout 会被重定向到 stderr（引擎的普通 print 变日志），
# 协议消息始终走 OUT，不受重定向影响。
OUT = sys.stdout


def envelope(event, data, task_id=None):
    return {
        "protocol_version": PROTOCOL_VERSION,
        "event": event,
        "task_id": task_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }


def emit(msg):
    """写一行协议消息到协议通道（独立可解析，立即冲刷）。"""
    OUT.write(json.dumps(msg, ensure_ascii=False) + "\n")
    OUT.flush()


def emit_event(event, data, task_id=None):
    emit(envelope(event, data, task_id))


def log(message):
    """人类可读日志 → stderr（禁止输出到 stdout）。"""
    print(message, file=sys.stderr, flush=True)


def parse_command(line):
    """解析一条 stdin 指令。返回 dict；损坏行返回 None（调用方记数忽略）。"""
    line = line.strip()
    if not line:
        return None
    try:
        obj = json.loads(line)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(obj, dict):
        return None
    return obj
