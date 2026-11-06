"""Worker 子进程协议集成测试（Mock 模式，不发真实请求）。"""
import json
import os
import subprocess
import sys
import threading

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ENGINE_DIR = os.path.join(ROOT, "engine")


def spawn_worker(mock=True):
    env = dict(os.environ)
    env.pop("PYTHONPATH", None)
    if mock:
        env["WEREAD_MOCK"] = "1"
    proc = subprocess.Popen(
        [sys.executable, "-m", "engine.adapter.worker"],
        cwd=ROOT,
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )
    return proc


def send(proc, obj):
    assert proc.stdin
    proc.stdin.write(json.dumps(obj, ensure_ascii=False) + "\n")
    proc.stdin.flush()


class EventReader:
    """逐行读取 stdout 协议事件。"""

    def __init__(self, proc):
        self.proc = proc
        self.events = []

    def next(self, timeout=15):
        assert self.proc.stdout, "stdout 不可用"
        result = {}

        def run():
            line = self.proc.stdout.readline()
            result["line"] = line

        t = threading.Thread(target=run, daemon=True)
        t.start()
        t.join(timeout)
        if t.is_alive():
            raise TimeoutError("worker event timeout")
        line = result["line"]
        if not line:
            raise EOFError("worker exited: " + self.proc.stderr.read() if self.proc.stderr else "worker exited")
        ev = json.loads(line)
        self.events.append(ev)
        return ev


def test_worker_handshake_and_mock_task(tmp_path):
    proc = spawn_worker(mock=True)
    reader = EventReader(proc)
    try:
        ready = reader.next()
        assert ready["event"] == "engine.ready"
        assert ready["data"]["mock"] is True
        assert ready["data"]["engine_version"]

        send(proc, {"protocol_version": 1, "cmd": "start_task", "task_id": "t1",
                    "params": {"book_id": "mockbook123", "format": "markdown",
                               "output_dir": str(tmp_path)}})
        events = []
        while True:
            ev = reader.next()
            events.append(ev)
            if ev["event"] in ("task.completed", "task.failed"):
                break

        names = [e["event"] for e in events]
        assert names[0] == "task.started"
        assert "task.progress" in names
        assert "task.chapter_done" in names
        completed = events[-1]
        assert completed["event"] == "task.completed"
        assert completed["task_id"] == "t1"
        assert completed["data"]["outputs"][0]["format"] == "markdown"

        # 损坏行不致命：发送垃圾行后再发 shutdown，worker 仍正常退出
        assert proc.stdin
        proc.stdin.write("garbage not json\n")
        proc.stdin.flush()
        send(proc, {"protocol_version": 1, "cmd": "shutdown"})
        code = proc.wait(timeout=10)
        assert code == 0
        # shutdown 事件出现在退出前
        ev = reader.next(timeout=5)
        assert ev["event"] == "engine.shutdown"
    finally:
        if proc.poll() is None:
            proc.kill()


def test_worker_rejects_bad_format():
    proc = spawn_worker(mock=True)
    reader = EventReader(proc)
    try:
        assert reader.next()["event"] == "engine.ready"
        send(proc, {"protocol_version": 1, "cmd": "start_task", "task_id": "t2",
                    "params": {"book_id": "x", "format": "txt"}})
        ev = reader.next()
        assert ev["event"] == "task.failed"
        assert ev["data"]["code"] == "BAD_FORMAT"

        send(proc, {"protocol_version": 1, "cmd": "shutdown"})
        proc.wait(timeout=10)
    finally:
        if proc.poll() is None:
            proc.kill()


def test_worker_real_markdown_export_from_existing_data():
    """真实导出回归：使用仓库内已有真实抓取数据（output/）执行 Markdown 导出。

    该测试验证"引擎真实事件流 + 真实产物"，不访问微信读书平台。
    """
    real_book_dirs = [d for d in os.listdir(os.path.join(ROOT, "output"))
                      if d.endswith("_v2")] if os.path.isdir(os.path.join(ROOT, "output")) else []
    if not real_book_dirs:
        pytest.skip("仓库内暂无真实抓取数据（output/），跳过真实导出回归")
    book_id = real_book_dirs[0].removesuffix("_v2")

    import shutil
    import tempfile
    out_root = tempfile.mkdtemp(prefix="weread-export-test-")
    # 拷贝真实书籍数据到隔离目录：output_dir 同时是数据根与输出根
    shutil.copytree(os.path.join(ROOT, "output", real_book_dirs[0]), os.path.join(out_root, f"{book_id}_v2"))

    proc = spawn_worker(mock=False)
    reader = EventReader(proc)
    try:
        assert reader.next()["event"] == "engine.ready"
        send(proc, {"protocol_version": 1, "cmd": "start_task", "task_id": "t3",
                    "params": {"book_id": book_id, "format": "markdown", "output_dir": out_root,
                               "options": {"skip_crawl": True}}})
        events = []
        while True:
            ev = reader.next(timeout=60)
            events.append(ev)
            if ev["event"] in ("task.completed", "task.failed"):
                break
        completed = events[-1]
        assert completed["event"] == "task.completed", f"真实导出失败: {completed}"
        paths = [o["file_path"] for o in completed["data"]["outputs"]]
        assert len(paths) >= 1
        for p in paths:
            assert os.path.isfile(p) and os.path.getsize(p) > 0
        send(proc, {"protocol_version": 1, "cmd": "shutdown"})
        proc.wait(timeout=10)
    finally:
        if proc.poll() is None:
            proc.kill()
