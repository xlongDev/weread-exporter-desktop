"""桌面协议 Worker（docs/08-engine-protocol.md）。

以独立进程运行：`python -m engine.adapter.worker`（cwd = 仓库根）。
- stdin  : JSON 指令行（start_task / cancel / auth_check / shutdown）
- stdout : JSON 协议事件行（唯一的协议通道）
- stderr : 人类可读日志（Rust 侧落盘为任务日志）

WEREAD_MOCK=1 时为 Mock 模式：不启动浏览器、不发真实网络请求，按脚本回放事件流，
用于协议与 UI 生命周期的自动化验证（不代表真实平台导出）。
"""
import asyncio
import json
import os
import sys
import threading

# 保证 engine/ 目录内模块（crawl_weread/export_book）可按顶层模块导入（与原布局一致）
ENGINE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ENGINE_DIR not in sys.path:
    sys.path.insert(0, ENGINE_DIR)

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from engine import ENGINE_VERSION, protocol  # noqa: E402

MOCK = os.environ.get("WEREAD_MOCK", "") == "1"


class Worker:
    def __init__(self):
        self.cancel_event = asyncio.Event()
        self.current_task_id = None
        self.busy = False
        self.closing = False

    # ---- 输出辅助 ----
    def emit(self, event, data, task_id=None):
        protocol.emit_event(event, data, task_id)

    def log(self, message):
        protocol.log(message)

    # ---- 指令处理 ----
    async def handle(self, cmd):
        action = cmd.get("cmd")
        task_id = cmd.get("task_id")

        if action == "shutdown":
            self.closing = True
            return
        if action == "cancel":
            if self.current_task_id and task_id == self.current_task_id:
                self.cancel_event.set()
                self.log(f"cancel requested for {task_id}")
            return
        if action == "start_task":
            if self.busy:
                self.emit("engine.error", {"code": "WORKER_BUSY", "message": "worker 正在执行其他任务"}, task_id)
                return
            self.busy = True
            self.current_task_id = task_id
            self.cancel_event.clear()
            try:
                await self.run_task(task_id, cmd.get("params") or {})
            finally:
                self.busy = False
                self.current_task_id = None
            return
        if action == "auth_check":
            await self.auth_check(task_id)
            return
        if action == "login":
            await self.login(task_id)
            return
        if action == "book_info":
            await self.book_info(task_id, cmd.get("params") or {})
            return

        self.emit("engine.error", {"code": "UNKNOWN_CMD", "message": f"未知指令: {action}"}, task_id)

    # ---- 任务执行 ----
    def make_progress(self, task_id):
        def progress(payload):
            kind = payload.get("kind")
            if kind == "auth_required":
                self.emit("auth.required", {"wait_seconds": 300}, task_id)
            elif kind == "auth_success":
                self.emit("auth.success", {}, task_id)
            elif kind == "chapter":
                self.emit("task.chapter_done", {"chapter_idx": payload.get("idx"), "title": payload.get("title", ""), "words": payload.get("words", 0)}, task_id)
            elif kind == "output":
                self.emit("task.output", {"format": payload.get("format"), "file_path": payload.get("path"), "file_size": payload.get("size", 0)}, task_id)
            else:
                stage = payload.get("stage", "crawl" if kind == "page" else kind)
                self.emit("task.progress", {
                    "stage": stage,
                    "page": payload.get("page"),
                    "chapter_title": payload.get("chapter", ""),
                    "chapters_done": payload.get("chapters_done"),
                    "total_chapters": payload.get("total_chapters"),
                    "words": payload.get("words", 0),
                }, task_id)
        return progress

    async def run_task(self, task_id, params):
        import crawl_weread
        import export_book

        book_id = crawl_weread.extract_book_id(params.get("book_id", ""))
        fmt = params.get("format", "markdown")
        if fmt not in ("pdf", "epub", "markdown"):
            self.emit("task.failed", {"code": "BAD_FORMAT", "message": f"不支持的格式: {fmt}", "user_message": f"暂不支持导出为 {fmt}", "recoverable": False}, task_id)
            return
        if not book_id:
            self.emit("task.failed", {"code": "BAD_BOOK_ID", "message": "无法解析书籍 ID", "user_message": "书籍链接或 ID 无效", "recoverable": False}, task_id)
            return

        output_dir = params.get("output_dir") or None
        options = params.get("options") or {}
        force = bool(options.get("force"))
        skip_crawl = bool(options.get("skip_crawl"))

        self.emit("task.started", {"book_id": book_id, "format": fmt}, task_id)

        if MOCK:
            await self.run_task_mock(task_id, book_id, fmt, output_dir)
            return

        if not skip_crawl:
            try:
                crawl_ok = await crawl_weread.main(
                    book_id,
                    force=force,
                    progress=self.make_progress(task_id),
                    should_cancel=self.cancel_event.is_set,
                    output_dir=output_dir,
                )
            except Exception as e:
                self.log("crawl exception: " + repr(e))
                self.emit("task.failed", {"code": "CRAWL_ERROR", "message": repr(e), "user_message": "抓取过程出现异常（详见任务日志），可重试或继续导出已抓取部分", "recoverable": True}, task_id)
                return

            if not crawl_ok:
                if self.cancel_event.is_set():
                    self.emit("task.cancelled", {}, task_id)
                else:
                    self.emit("task.failed", {"code": "CRAWL_FAILED", "message": "crawl returned failure", "user_message": "抓取未完成（未登录、登录过期或网络异常）", "recoverable": True}, task_id)
                return

        try:
            outputs = await export_book.main(
                book_id,
                output_dir=output_dir,
                formats=[fmt],
                progress=self.make_progress(task_id),
            )
        except Exception as e:
            self.log("export exception: " + repr(e))
            self.emit("task.failed", {"code": "EXPORT_ERROR", "message": repr(e), "user_message": "导出生成文件时出现异常（详见任务日志）", "recoverable": True}, task_id)
            return

        if not outputs:
            self.emit("task.failed", {"code": "EXPORT_EMPTY", "message": "export produced no files", "user_message": "没有可导出的章节内容", "recoverable": True}, task_id)
            return

        self.emit("task.completed", {"outputs": [
            {"format": fmt, "file_path": p} for p in outputs
        ]}, task_id)

    async def run_task_mock(self, task_id, book_id, fmt, output_dir):
        """Mock 事件回放：验证协议与任务生命周期，不访问真实平台。"""
        self.emit("task.progress", {"stage": "metadata", "chapter_title": "示例章节", "chapters_done": 0, "total_chapters": 3, "words": 0}, task_id)
        for i in range(1, 4):
            await asyncio.sleep(0.1)
            self.emit("task.progress", {"stage": "crawl", "page": i, "chapter_title": f"示例章节 {i}", "chapters_done": i - 1, "total_chapters": 3, "words": 500 * i}, task_id)
            self.emit("task.chapter_done", {"chapter_idx": i, "title": f"示例章节 {i}", "words": 500}, task_id)
        fake_path = os.path.join(output_dir or os.path.join(ENGINE_DIR, "..", "output"), f"mock-{book_id}.{ 'epub' if fmt == 'epub' else fmt }")
        self.emit("task.output", {"format": fmt, "file_path": fake_path, "file_size": 1024}, task_id)
        self.emit("task.completed", {"outputs": [{"format": fmt, "file_path": fake_path}]}, task_id)

    # ---- 会话检查 ----
    async def auth_check(self, task_id=None):
        logged_in = False
        error = None
        try:
            if MOCK:
                logged_in = False
            else:
                import crawl_weread
                from playwright.async_api import async_playwright
                async with async_playwright() as p:
                    ctx = await crawl_weread.launch_browser_context(p, crawl_weread.USER_DATA_DIR, headless=True)
                    logged_in = await crawl_weread.check_cookies_login(ctx)
                    await ctx.close()
        except Exception as e:
            self.log("auth_check exception: " + repr(e))
            error = str(e)
        data = {"logged_in": logged_in}
        if error:
            data["error"] = error
        self.emit("auth.status", data, task_id)

    # ---- 扫码登录（可见浏览器窗口）----
    async def login(self, task_id):
        import crawl_weread
        from playwright.async_api import async_playwright

        if MOCK:
            await asyncio.sleep(0.2)
            self.emit("auth.required", {"wait_seconds": 1}, task_id)
            await asyncio.sleep(0.3)
            self.emit("auth.status", {"logged_in": True, "mock": True}, task_id)
            return

        try:
            async with async_playwright() as p:
                ctx = await crawl_weread.launch_browser_context(p, crawl_weread.USER_DATA_DIR, headless=False)
                try:
                    if await crawl_weread.check_cookies_login(ctx):
                        self.emit("auth.status", {"logged_in": True}, task_id)
                        return
                    page = await ctx.new_page()
                    # 必须实际打开微信读书登录页，用户才有二维码可扫（独立登录流程此前漏了导航）
                    await page.goto("https://weread.qq.com/#login", wait_until="domcontentloaded", timeout=60000)
                    self.emit("auth.required", {"wait_seconds": 300}, task_id)
                    self.log("等待微信扫码登录（最长 300 秒）...")
                    for _ in range(150):
                        await asyncio.sleep(2)
                        if self.cancel_event.is_set():
                            self.emit("auth.status", {"logged_in": False, "cancelled": True}, task_id)
                            return
                        if await crawl_weread.check_cookies_login(ctx):
                            self.emit("auth.status", {"logged_in": True}, task_id)
                            return
                    self.emit("auth.status", {"logged_in": False, "reason": "timeout"}, task_id)
                finally:
                    await ctx.close()
        except Exception as e:
            self.log("login exception: " + repr(e))
            self.emit("auth.status", {"logged_in": False, "error": str(e)}, task_id)

    # ---- 书籍元数据（含封面下载与可访问性校验）----
    async def book_info(self, task_id, params):
        import urllib.request

        import crawl_weread
        from playwright.async_api import async_playwright

        book_id = crawl_weread.extract_book_id(params.get("book_id", ""))
        cover_dir = params.get("cover_dir") or os.path.join(ENGINE_DIR, "..", "output")
        if not book_id:
            self.emit("book.validation", {"ok": False, "reason": "invalid_id", "user_message": "书籍链接或 ID 无效"}, task_id)
            return
        if MOCK:
            self.emit("book.metadata", {"book_id": book_id, "title": "Mock 书籍", "author": "Mock 作者",
                                        "intro": "这是 Mock 模式的书籍简介。", "cover_path": ""}, task_id)
            self.emit("book.validation", {"ok": True}, task_id)
            return

        try:
            async with async_playwright() as p:
                ctx = await crawl_weread.launch_browser_context(p, crawl_weread.USER_DATA_DIR, headless=True)
                try:
                    logged_in = await crawl_weread.check_cookies_login(ctx)
                    page = await ctx.new_page()
                    target_url = f"https://weread.qq.com/web/reader/{book_id}"
                    self.log(f"获取书籍信息: {target_url}")
                    await page.goto(target_url, wait_until="domcontentloaded", timeout=60000)
                    await asyncio.sleep(3)
                    meta = await page.evaluate("""() => {
                        let info = (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.reader && window.__INITIAL_STATE__.reader.bookInfo) || {};
                        return {
                            title: info.title || document.title.replace(' - 微信读书', '').trim(),
                            author: info.author || '',
                            cover: info.cover || '',
                            intro: info.intro || '',
                            publisher: info.publisher || ''
                        };
                    }""")
                    cover_path = ""
                    cover_url = meta.get("cover")
                    if cover_url:
                        try:
                            os.makedirs(cover_dir, exist_ok=True)
                            cover_path = os.path.join(cover_dir, f"{book_id}.jpg")
                            req = urllib.request.Request(cover_url, headers={"Referer": "https://weread.qq.com/", "User-Agent": "Mozilla/5.0"})
                            raw = urllib.request.urlopen(req, timeout=15).read()
                            if len(raw) > 500:
                                with open(cover_path, "wb") as f:
                                    f.write(raw)
                            else:
                                cover_path = ""
                        except Exception as e:
                            self.log(f"封面下载失败: {e}")
                            cover_path = ""

                    title = (meta.get("title") or "").strip()
                    ok = bool(title) and "微信读书" not in title[:6]
                    self.emit("book.metadata", {
                        "book_id": book_id,
                        "title": title,
                        "author": meta.get("author", ""),
                        "intro": meta.get("intro", ""),
                        "cover_path": cover_path,
                        "logged_in": logged_in,
                    }, task_id)
                    self.emit("book.validation", {
                        "ok": ok,
                        "reason": "" if ok else "not_found",
                        "user_message": "" if ok else "未找到该书籍，请确认链接是否正确、书籍是否存在",
                        "logged_in": logged_in,
                    }, task_id)
                finally:
                    await ctx.close()
        except Exception as e:
            self.log("book_info exception: " + repr(e))
            self.emit("book.validation", {"ok": False, "reason": "error", "user_message": f"获取书籍信息失败：{e}"}, task_id)


async def amain():
    # 引擎内部的普通 print 一律转为 stderr 日志；协议消息经 protocol.OUT 走真实 stdout
    sys.stdout = sys.stderr
    worker = Worker()
    worker.emit("engine.ready", {
        "engine_version": ENGINE_VERSION,
        "python_version": sys.version.split()[0],
        "mock": MOCK,
    })

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def stdin_reader():
        for line in sys.stdin:
            loop.call_soon_threadsafe(queue.put_nowait, line)
        loop.call_soon_threadsafe(queue.put_nowait, None)  # EOF 哨兵

    threading.Thread(target=stdin_reader, daemon=True).start()

    while True:
        line = await queue.get()
        if line is None:
            break  # stdin EOF：Rust 侧关闭管道，worker 优雅退出
        cmd = protocol.parse_command(line)
        if cmd is None:
            worker.log("ignored malformed command line")
            continue
        await worker.handle(cmd)
        if worker.closing:
            break

    worker.emit("engine.shutdown", {"reason": "stdin closed" if not worker.closing else "shutdown command"})
    worker.log("worker exit")


if __name__ == "__main__":
    asyncio.run(amain())
