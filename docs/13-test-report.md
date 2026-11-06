# 13 - 测试报告（v0.1.0 · Phase 9）

> 运行环境：macOS 15 (Darwin 27.2.0) arm64 · Python 3.15.2 (venv) / 3.12.16 (bundled) · Rust 1.98 · Node 24
> 原则：只有真实执行并通过的项才标记 ✅；未验证项明确标注 ⏳。

## 1. 自动化测试结果（全部真实执行）

| 套件 | 数量 | 结果 |
| --- | --- | --- |
| 引擎回归 pytest（engine/tests） | 26 | **26 passed** |
| 桌面端 cargo test --lib | 13 | **13 passed** |
| cargo clippy -D warnings | — | 0 error |
| 前端 tsc strict + vite build | — | 通过 |
| taste-skill lint --app | — | 0 FAIL |
| taste-skill inspect --app（1440/768/390） | — | 0 FAIL（3 个有据 WARN） |

引擎测试覆盖：书籍 ID 解析、Canvas 分页/切栏、样式分级、目录标题匹配、章节渲染、断句合并、协议信封与损坏行、**Worker 子进程协议集成（mock）**、**真实数据导出回归（隔离目录）**、登录/书籍信息事件（mock + task_id 传播）。

Rust 测试覆盖：SQLite 迁移（幂等 + 备份）、日志脱敏、协议解析（损坏行/版本拒绝/往返）、Python 解释器解析、**任务状态机全生命周期（内存库）**、**全链路 mock 集成（Rust→真实 python 子进程→事件→SQLite→产物落库）**、**真实引擎全链路（真实数据 → 2 个 Markdown 产物 239KB）**、**队列串行化（抓出 DB 锁自死锁并修复）**。

## 2. 真机验收（真实执行）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 前端三主题渲染 | ✅ | Phase 2 浏览器截图（浅/深） |
| 引擎真实登录态检测 | ✅ | 真实 profile Cookie → `auth.status {logged_in: true}` |
| 真实引擎导出全链路 | ✅ | Rust 集成测试：2 个 Markdown 产物 239KB |
| **真实 PDF/EPUB 导出（worker 管道）** | ✅ | 真实书籍数据 + skip_crawl：EPUB 648KB（zip 完整含 mimetype）· PDF 2.3MB（%PDF 魔数，无头渲染）· 中文文件名正常 —— 三种格式真实导出全部实测 |
| 正式 .app 页面加载 | ✅ | 日志 `page load: tauri://localhost` |
| **捆绑运行时引擎握手** | ✅ | 独立 .app 日志 `engine handshake ok: v0.1.0 (python 3.12.16)`（系统为 3.15，证明用的是捆绑运行时） |
| 独立安装运行 | ✅ | .app 拷贝至 ~/Applications 独立运行握手通过 |
| 设置持久化 | ✅ | settings 表读写 + 主题即时生效（迁移测试 + UI 操作） |
| 任务运行时关闭保护 | ✅ | CloseRequested 拦截 → 确认对话框 → force_close kill 引擎 |
| 设计门禁（lint+inspect） | ✅ | 0 FAIL |

## 3. 待人工验收（⏳，需用户在场）

| 项 | 原因 |
| --- | --- |
| 真实扫码登录 UI 全流程 | 需人工微信扫码（自动化已覆盖扫码等待/超时/取消协议链路） |
| 真实书籍完整抓取+三格式导出（GUI 内） | 需登录态 + 数小时抓取窗口；引擎层三格式真实导出均已实测（MD/EPUB/PDF ✅），抓取层代码即用户 CLI 已多次成功运行的同一实现 |
| Windows NSIS 安装包 | 无 Windows 环境（构建脚本与 icon.ico 已就绪） |
| 长任务中断电/强杀恢复 | 引擎逐页落盘 + 章节账本已就绪，极端场景留待日常使用确认 |

## 4. 质量门禁执行记录

每个 Phase 提交前执行：`pytest engine/tests` + `cargo clippy -D warnings` + `cargo test --lib` + `npm run build`。核心逻辑修改后重跑引擎回归（Phase 3~9 每轮均执行）。未发生过删除测试/放宽类型制造绿灯的情况。
