"""登录失效链路回归：crawl 抛 LoginExpiredError → worker 发 task.failed(LOGIN_EXPIRED)。

无网络、无浏览器：直接 monkeypatch crawl_weread.main，验证 worker 侧错误码映射。
"""
import asyncio
import os
import sys

import crawl_weread

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from engine.adapter.worker import Worker  # noqa: E402


def test_login_expired_error_is_runtime_error():
    assert issubclass(crawl_weread.LoginExpiredError, RuntimeError)


def test_worker_maps_login_expired(monkeypatch):
    async def boom(*args, **kwargs):
        raise crawl_weread.LoginExpiredError("登录态在抓取过程中失效")

    monkeypatch.setattr(crawl_weread, "main", boom)

    w = Worker()
    events = []
    w.emit = lambda event, data, task_id=None: events.append((event, data, task_id))

    asyncio.run(w.run_task("t1", {"book_id": "3b132980813ab94eeg013129", "format": "markdown"}))

    started = [d for e, d, _ in events if e == "task.started"]
    failed = [d for e, d, _ in events if e == "task.failed"]
    assert started, "应先发 task.started"
    assert len(failed) == 1
    data = failed[0]
    assert data["code"] == "LOGIN_EXPIRED"
    assert data["recoverable"] is True
    assert "重新扫码" in data["user_message"]
