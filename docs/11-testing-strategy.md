# 11 - 测试策略

## 1. 引擎回归（pytest，Phase 3 起为质量门禁）

位置 `engine/tests/`，运行 `.venv/bin/python -m pytest engine/tests -q`。

- **纯函数单测**（无网络无浏览器）：
  - `extract_book_id`：完整链接/纯 ID/分享链接/非法输入 ≥8 例。
  - `split_pages`：构造 chars 序列，验证 (seq, side) 分页、y 回跳切分、测量字符过滤。
  - `page_lines`：y 聚类、标题行合并。
  - `cls_of/render_md`：四类样式映射、引文/加粗块输出、插图命名。
  - `match_catalog_title`：精确匹配/粘连剥离/已见标题跳过。
  - `refine_chapter_text`：断句合并、插图穿插、引文块合并。
  - `protocol.py`：信封构造、损坏 JSON 行处理。
- **文件级冒烟（golden smoke）**：用仓库真实 `output/` 产物（已导出的书）作为 fixture：`rebuild_chapters_from_raw` 重构结果章节数 = 现有 chapters 数；`build_markdown_files` / `build_epub` 输出文件存在且大小 >0（写入 tmp 目录，不污染真实 output）。
- **协议集成**：`adapter/worker.py` 子进程测试 —— stdin 发 `auth_check`，断言 stdout 首行 `engine.ready` 且 JSON 可解析（浏览器启动类命令在无浏览器 CI 环境跳过并显式标注）。

## 2. Rust 测试（cargo test）

- migrations：v0→v1 迁移幂等、备份生成、user_version 正确。
- 协议解析器：合法行/损坏行/未知事件/超长行。
- 路径校验器：白名单前缀、`..`、绝对路径逃逸拒绝。
- DB 状态机：waiting→running→completed/cancelled/failed 迁移与索引。

## 3. 前端测试（vitest，已实现 ✅）

- utils/bookId：书籍 ID 解析（与引擎 extract_book_id 用例对齐）+ Rust 白名单规则对齐（11 项）。
- services：toAppError 错误归一（字符串/Error/未知类型）。
- 运行：`npm run test`（CI 桌面端 job 已接入）。

## 4. UI 走查（人工 + 脚本辅助）

每 Phase 验收时逐屏核对：空态/加载态/错误态/明暗主题/1280 与 1920 宽度；设计系统 lint（taste-skill lint.mjs --app + inspect.mjs --app）。

## 5. 端到端（诚实分级）

- **Mock Engine**：worker 的 `WEREAD_MOCK=1` 模式（不发真实网络/浏览器请求，按脚本回放事件流）用于驱动任务中心/书库/设置的全流程自动化验证 —— 明确标注为协议与 UI 验证，**不**冒充真实平台导出。
- **真实验收**：扫码登录与真实导出需要用户在场扫码，标记为"待人工验收"清单项；在本机已有真实产物（Phase 0 证据）基础上，Phase 5 由用户配合完成一次真实导出。

## 6. 质量门禁（每 Phase 提交前）

```bash
.venv/bin/python -m pytest engine/tests -q     # 引擎回归
cd apps/desktop && npm run lint && npm run typecheck && npm run test && npm run build
cd src-tauri && cargo check && cargo test && cargo clippy -- -D warnings
```
任何核心逻辑修改后必须重跑引擎回归；禁止删测试/放宽类型制造绿灯。
