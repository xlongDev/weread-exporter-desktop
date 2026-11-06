# 00 - 项目审计报告（Phase 0）

> 审计日期：2026-11-06 · 审计对象：https://github.com/WANGXIN-567/weread-book-exporter （本地 main @ 7942175）

## 1. 基本信息确认

| 项目 | 结论 |
| --- | --- |
| 许可证 | MIT（Copyright (c) 2026），允许桌面化改造与二次分发 |
| 语言 / 运行时 | Python 3.9+；本机 venv 实测 Python 3.15.2 可运行 |
| 第三方依赖 | `playwright>=1.40`、`markdown>=3.5`、`EbookLib>=0.18`（venv 实际锁定：playwright 1.64.1 / EbookLib 0.21 / Markdown 3.11.3 / lxml 6.1.3） |
| 浏览器依赖 | Playwright Chromium，**或**系统自带 Edge / Chrome（channel 探测回退，免下载 200MB） |
| 代码规模 | `crawl_weread.py` 885 行 + `export_book.py` 480 行 + `main.py` 83 行，单文件模块，无包结构 |
| 已有测试 | 无（零测试、零 CI） |
| 真实功能证据 | 本机 `output/` 已有《脆弱的心（果麦经典）》完整产物：纯 MD、HTML 排版 MD、EPUB、PDF、封面、插图 —— 端到端管道真实可用 |

## 2. 入口与调用链

```text
main.py（一键入口）
 ├─ crawl_weread.extract_book_id(输入)     # 链接/ID 解析
 ├─ crawl_weread.main(book_id, force)      # 阶段1：抓取全书
 └─ export_book.main(book_id)              # 阶段2：多格式导出
```

## 3. 登录机制（实测代码路径，非假设）

1. `launch_browser_context()`：`launch_persistent_context(USER_DATA_DIR)`，`headless=False`（必须有可见浏览器窗口）。
   - 浏览器候选顺序：`PLAYWRIGHT_CHANNEL` 环境变量 → 系统 Edge(`msedge`) → 系统 Chrome(`chrome`) → Playwright Chromium。
   - `USER_DATA_DIR = $WEREAD_PROFILE` 或 `<项目>/cache/browser_profile`（Cookie 持久化在此，明文）。
2. 登录判定 `check_cookies_login()`：Cookie 中存在 `wr_vid` 且存在 `wr_skey` 或 `wr_rt`。
3. 未登录时在终端打印提示，用户在弹出的浏览器窗口中**微信扫码**，轮询 300 秒（150 次 × 2s）。
4. 已知边界：浏览器 profile 被占用时报 `ProcessSingleton / Lock file` 错误（已有检测与中文提示）。

## 4. 抓取机制

- **页面注入 Hook**：重写 `CanvasRenderingContext2D.fillText/clearRect`，捕获每个字符的文本、坐标、字体、栏位（左右）、页序（seq）。
- **翻页**：双栏水平模式（自动点击切换），`ArrowRight` 模拟翻页；每页随机等待 8~20 秒，每 10~20 页长停顿 60~120 秒（温和防风控）。
- **分页与切栏**：按 `(seq, side)` + y 坐标回跳切分单页（`split_pages`），按 y 聚类成行（`page_lines`）。
- **样式分级**：按字号/字重分 4 类 —— `title`(≥24.5px) / `yw` 引文(≥21px) / `fang` 加粗 / `js` 正文。
- **章节识别**：官方目录（`.readerCatalog_list_item`）+ 正文行匹配（`match_catalog_title`，支持标题与段首粘连剥离）+ 标题样式启发。
- **断点续传**：每页结构化落盘 `raw/page_XXXX.json`；章节实时落盘 `chapters/NNNN.md` + `raw/chap_XXXX.json`；`_state.json` 记录进度；重启后从目录中已完成的最后一章之后继续；`raw/` 与 `chapters/` 不一致时自动重构（`rebuild_chapters_from_raw`）。
- **元数据**：`window.__INITIAL_STATE__.reader.bookInfo` → 书名/作者/简介/封面 URL；封面下载为 `cover.jpg`。
- **插图**：DOM 中 `img[class*="wr_readerImage"]` 且 host 为 `res.weread.qq.com/wrepub`，按左右栏归属插入文本流，事后统一下载（`download_all_images`）。

## 5. 导出机制

- 输入：`output/{book_id}_v2/chapters/*.md`（MD5 去重）。
- `refine_chapter_text()`：跨行断句合并、插图穿插修复、引文/加粗块规整。
- 产物（全部写入 `output/` 根目录，文件名含书名）：
  1. `{书名}_纯Markdown笔记版.md`（引文转 `>` 引用块）
  2. `{书名}_全书合并_HTML排版版.md`
  3. `{书名}（双字体精排）.epub`（EbookLib，内嵌 CSS/插图/目录树）
  4. `{书名}（双字体精排）.pdf`（Playwright headless 打印：封面页 + 双栏目录 + 章节页 + 页眉页脚 + PDF outline；临时 HTML 用后即删）

## 6. 数据布局

```text
output/
├── {book_id}_v2/            # 中间数据（可恢复、可复用）
│   ├── chapters/NNNN.md     # 章节正文（渲染后 Markdown）
│   ├── raw/page_XXXX.json   # 逐页原始捕获（断点保护）
│   ├── raw/chap_XXXX.json   # 章节索引（标题/插图/字数）
│   ├── images/              # 章节插图
│   ├── meta.json            # 书名/作者/简介/封面URL
│   ├── cover.jpg, _catalog.json, _state.json
└── {书名}*.md/.epub/.pdf    # 最终产物
cache/browser_profile/       # Playwright 持久化登录态（敏感）
```

## 7. 环境实测结论

- 本机（macOS arm64，Darwin 27.2.0）：Python 3.15.2、Node 24.22.1、Rust 1.98.0 齐备；venv 内引擎 `import crawl_weread, export_book` 通过，ID 解析通过。
- 引擎对 Python 版本无上限依赖，当前 3.15 可运行。
