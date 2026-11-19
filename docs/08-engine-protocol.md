# 08 - 引擎通信协议 v1

## 1. 传输与分帧

- Worker 由 Rust 派生：`python -m engine.adapter.worker`（cwd=仓库根）。
- **stdout 只输出协议消息**：每行一个独立 JSON 对象（JSON Lines，UTF-8，无 BOM）。
- 人类可读日志一律走 **stderr**（Rust 落到任务日志文件）。
- stdin 接收指令行；worker 忽略空行/损坏行（stderr 记 warning，不崩溃）；未知事件/字段忽略并计数。

## 2. 消息信封

```json
{
  "protocol_version": 1,
  "event": "task.progress",
  "task_id": "task-8f3a",
  "timestamp": "2026-11-06T12:00:00.123Z",
  "data": { }
}
```

指令（Rust → stdin）：

```json
{"protocol_version":1, "cmd":"start_task", "task_id":"task-8f3a",
 "params":{"book_id":"3b13...", "format":"pdf|epub|markdown|notes", "output_dir":"/...",
           "options":{"force":false, "skip_crawl":false, "filename_template":"...", "layout":{"font_size":"15", "page_margin":"narrow"}}}}
{"protocol_version":1, "cmd":"cancel", "task_id":"task-8f3a"}
{"protocol_version":1, "cmd":"shutdown"}
```

`format:"notes"`（划线/想法导出）：不抓页，headless 提取 cookie 后纯 HTTP 拉取该书划线与想法，渲染单文件 `{书名}_划线与想法.md`；无笔记 → `task.failed{code:"NO_NOTES"}`。双 ID 体系：划线端点 v-hash/数字 ID 皆可，**想法端点只认数字 bookId**（v-hash 报 -2003，2026-11-20 实测）——任务为 v-hash 时从 bookDetail 页提取数字 ID；提取失败时降级为仅划线。
`options.filename_template`：文件名模板（设置 export.naming；空 = 默认命名）。
`options.layout`：排版参数（设置 export.font_size/export.page_margin，值 "default" = 引擎内置排版；engine/export_book.py PAGE_MARGINS）。
`options.skip_crawl`：数据已在本地时跳过抓取直接导出（书库"重新导出"与断点续导的完成段使用）。
`WEREAD_ENGINE_MOCK=1`（Rust 侧环境变量）：worker 以 Mock 模式回放事件流，用于协议与 UI 生命周期自动化验证，不代表真实平台导出。

独立命令任务（不占 task 通道长时）：
- `{"cmd":"auth_check"}` → `auth.status`
- `{"cmd":"book_info", "task_id":"...", "params":{"book_id":"..."}}` → `book.metadata` / `book.validation`
- `{"cmd":"shelf_fetch", "task_id":"op-..."}` → `shelf.books` / `shelf.error`（书架一键导入；headless 提取 cookie → 纯 HTTP `GET /web/shelf/sync`；Rust op 路由终态 = 两者皆可）
- `{"cmd":"notes_summary", "task_id":"op-...", "params":{"books":[{"id","review_id","title","author"}], "output_dir":...}}` → `notes.summary_progress` / `notes.summary_done` / `notes.summary_error`（书架划线汇总：逐本纯 HTTP 拉取划线/想法合并为一个 `划线汇总_时间戳.md`；`id` = 划线端点用 v-hash，`review_id` = 想法端点专用数字 bookId，title/author 为书架卡片兜底；书间可 cancel；Rust op 路由终态 = done/error 皆可）
- `{"cmd":"logout"}` → 清除 profile 会话目录 → `auth.status`

## 3. 事件目录（worker → stdout）

| event | data 关键字段 | 说明 |
| --- | --- | --- |
| `engine.ready` | `engine_version`, `python_version` | worker 启动后第一条 |
| `engine.error` | `code`, `message` | 致命错误（随后退出） |
| `engine.shutdown` | `reason` | 优雅退出前 |
| `auth.required` | `wait_seconds` | 需要扫码（浏览器窗口已弹出） |
| `auth.status` | `logged_in: bool` | 会话检查结果 |
| `auth.success` | `{}` | 扫码成功 |
| `auth.expired` | `{}` | 会话失效 |
| `book.metadata` | `book_id,title,author,intro,cover_url,cover_path` | 元数据抓取完成 |
| `book.validation` | `ok, reason?` | 可访问性校验 |
| `shelf.books` | `count, books:[{book_id,title,author,cover,book_hash,group}]` | 书架列表（book_hash = deepLink v-hash，导入/抓取用；数字 bookId 的 bookDetail 页 404；group = 书架分组名，来自 `archive[]`，系统归档组不算，无分组为 ""） |
| `shelf.error` | `code, user_message` | 书架获取失败（`LOGIN_REQUIRED` = 会话失效） |
| `notes.summary_progress` | `done, total, title` | 划线汇总逐本进度 |
| `notes.summary_done` | `file_path, file_size, books_ok, books_empty, total_highlights, total_reviews` | 汇总产物就绪 |
| `notes.summary_error` | `code, user_message` | 汇总失败（`NO_BOOKS`/`LOGIN_REQUIRED`/`CANCELLED`/`NO_NOTES`/`NOTES_ERROR`） |
| `task.started` | `total_chapters?` | 抓取/导出开始 |
| `task.progress` | `stage`, `page`, `chapter_title`, `chapters_done`, `total_chapters`, `words`, `elapsed_sec` | 每页/每章（stage: `auth`/`metadata`/`crawl`/`images`/`render`/`notes`） |
| `task.chapter_done` | `chapter_idx`, `title`, `words` | 章节落盘 |
| `task.output` | `format`, `file_path`, `file_size` | 单个产物文件生成 |
| `task.completed` | `outputs: [{format,file_path,file_size}]` | 全部产物就绪 |
| `task.cancelled` | `{}` | 收到 cancel 并优雅停止 |
| `task.failed` | `code`, `message`, `user_message`, `recoverable` | 失败（唯一用户可读消息字段 user_message） |
| `log.info/warning/error` | `message` | 引擎日志转发 |

## 4. 实现映射（对引擎的侵入面）

- `crawl_weread.main(book_id, force=False, progress=None, should_cancel=None, output_dir=None)`：
  - `progress(event: dict)` 在：登录判定、元数据落定、每页抓取、章节落盘、图片补全、完成等节点调用；默认 None 行为不变。
  - `should_cancel() -> bool` 每次翻页迭代前检查；True 时保存状态、关闭浏览器、返回 "cancelled"。
  - `output_dir` 覆盖 `BASE/output`（None = 原行为）。
- `export_book.main(book_id, output_dir=None, formats=None, progress=None)`：同口径扩展，formats 过滤产物。
- `adapter/worker.py`：asyncio 读取 stdin；`progress` 回调把内部 dict 包装成信封写 stdout（`flush=True`）；cancel 指令置 `asyncio.Event`，作为 `should_cancel` 注入。
- 禁止通过管道传大体积数据：正文/图片一律文件系统（引擎本已逐页落盘），协议只传路径与计数。

## 5. 可靠性约定

1. 每条消息必须可独立解析；Rust 侧解析失败 → 丢弃 + debug 日志 + 错误计数（阈值内不告警）。
2. 心跳：`task.progress` 间隔可能长达 20s（翻页等待）——Rust 以"进程存活 + stderr 活性"判断健康，不设短超时误杀。
3. cancel 语义：引擎在下一次翻页前响应（最长一个翻页周期 8~20s + 长停顿例外时 UI 提示"正在等待安全停止点"）。
4. worker 退出码：0=正常（含任务失败），130=cancel，非 0 非 130=崩溃；Rust 结合最后事件收敛任务状态。
5. 协议版本：信封必带 `protocol_version`；Rust 拒绝不认识的 major 版本并给出明确错误。

## 6. 引擎版本号

`engine/__init__.py` 导出 `ENGINE_VERSION`（semver），`engine.ready` 上报，设置-关于页展示。
