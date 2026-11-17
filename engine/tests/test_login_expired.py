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


# ---- check_cookies_login：残留 cookie 不得误判为已登录 ----

class _FakeResp:
    def __init__(self, payload):
        self._payload = payload

    async def json(self):
        return self._payload


class _FakeCtx:
    def __init__(self, cookie_names, payload):
        self._names = cookie_names
        self._payload = payload
        self.requested = False

    async def cookies(self):
        return [{"name": n} for n in self._names]

    @property
    def request(self):
        ctx = self

        class _Req:
            async def get(self, url, timeout=None):
                ctx.requested = True
                return _FakeResp(ctx._payload)

        return _Req()


def _check(cookie_names, payload):
    return asyncio.run(crawl_weread.check_cookies_login(_FakeCtx(cookie_names, payload)))


def test_login_check_accepts_valid_session():
    # 实测有效会话的 shelf/sync 形态：返回书架数据，无 errCode 字段
    assert _check(["wr_vid", "wr_skey"], {"pureBookCount": 500, "bookCount": 500, "bookProgress": []}) is True


def test_login_check_rejects_stale_cookies():
    # wr_skey 过期后 cookie 仍残留（bug #v0.1.5：UI 显示已登录但抓取 CRAWL_FAILED）
    assert _check(["wr_vid", "wr_rt"], {"errCode": -2012, "errMsg": "未登录"}) is False
    assert _check(["wr_vid", "wr_skey"], {"errCode": -2010, "errMsg": "用户不存在"}) is False


def test_login_check_rejects_missing_credentials_without_network():
    r = _FakeCtx([], {"succ": 1})
    assert asyncio.run(crawl_weread.check_cookies_login(r)) is False
    assert r.requested is False, "无凭证时不应发起网络请求"
