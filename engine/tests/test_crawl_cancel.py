"""取消响应性回归：长停顿/翻页延迟必须可被 should_cancel 快速打断（docs/08 §5.3）。"""
import asyncio
import time

import crawl_weread


def test_sleep_cancellable_returns_immediately_on_cancel():
    async def run():
        t0 = time.monotonic()
        ok = await crawl_weread.sleep_cancellable(120, should_cancel=lambda: True, slice_sec=5)
        return ok, time.monotonic() - t0

    ok, elapsed = asyncio.run(run())
    assert ok is False
    assert elapsed < 6, f"取消应在一个切片内生效，实际 {elapsed:.1f}s"


def test_sleep_cancellable_without_callback_sleeps_full():
    async def run():
        t0 = time.monotonic()
        ok = await crawl_weread.sleep_cancellable(1.2, should_cancel=None)
        return ok, time.monotonic() - t0

    ok, elapsed = asyncio.run(run())
    assert ok is True
    assert elapsed >= 1.1  # CLI 行为不变：睡满


def test_sleep_cancellable_cancel_late_in_slices():
    """取消标记在睡眠中途置位 → 应在下一个切片边界返回。"""
    async def run():
        flag = {"cancelled": False}

        def should_cancel():
            return flag["cancelled"]

        async def set_later():
            await asyncio.sleep(2.5)
            flag["cancelled"] = True

        t0 = time.monotonic()
        asyncio.create_task(set_later())
        ok = await crawl_weread.sleep_cancellable(120, should_cancel=should_cancel, slice_sec=1)
        return ok, time.monotonic() - t0

    ok, elapsed = asyncio.run(run())
    assert ok is False
    assert elapsed < 5, f"中途取消应在切片边界生效，实际 {elapsed:.1f}s"
