# DEVELOPMENT LOG

## 2026-11-07 · Phase 3 Python 引擎封装

- **模块**：engine/（平移 + 协议 + 适配器 + 测试），apps/desktop/src-tauri/src/engine/（新），commands.rs，state.rs，lib.rs，run.bat
- **内容**：
  - 引擎平移：crawl_weread.py / export_book.py / main.py → engine/，BASE 自适应仓库根，CLI 用法不变；`main()` 增加 progress / should_cancel / output_dir 三个可选参数（默认 None 时行为与原版完全一致）；export 支持格式过滤并返回产物路径列表。
  - 协议 v1：protocol.py（信封构造 / stdout 固定通道 / stderr 日志 / 损坏行解析）；worker.py（start_task / cancel / auth_check / shutdown / book_info 占位；WEREAD_MOCK=1 脚本回放；sys.stdout→stderr 重定向使引擎 print 变日志且不污染协议通道）。
  - Rust：protocol.rs（解析 + 未知版本拒绝 + 单测）；worker.rs（Mutex<Child> 句柄 / WEREAD_PYTHON→.venv→系统 python 解析，无硬编码路径）；manager.rs（任务状态机 apply_task_event 可单测；start_task_run 派生 worker + stdout 路由到 Tauri 事件与 SQLite + stderr 落任务日志 + EOF 无终态时收敛 failed/cancelled）；commands 增加 create_task（校验 + books 存在性 + 立即执行）/ cancel_task（运行中优雅取消 / 等待中直接取消）/ engine_status（握手）。
  - 前端：engine store（握手 + engine://event 订阅）+ 设置-关于真实引擎版本/状态展示。
- **原因**：Phase 3 交付要求；Rust 管理生命周期、Python 独立运行（用户约束）。
- **测试**：pytest 25/25（含真实数据导出回归，隔离临时目录）；cargo test 11/11（含 mock 全链路：Rust→真实 python 子进程→事件→SQLite）；clippy 干净；npm build 通过；tauri dev 真机验证页面加载 + 前端握手 + worker 派生。
- **问题与修复**：①引擎 print 污染协议 stdout → protocol.OUT 固定通道 + worker 重定向；②真实导出回归触发图片补全网络下载阻塞 → start_task 增加 skip_crawl 选项（与书库"重新导出"需求一致）；③裸 cargo build 的嵌入式资产页面不加载（tauri dev 正常）→ 以官方 tauri build 产物为准，记录为已知观察。

## 2026-11-07 · Phase 2 桌面应用基础工程

- **模块**：apps/desktop/（新建），scripts/dev.sh，.gitignore
- **内容**：create-tauri-app 脚手架（react-ts）→ 按架构文档重组；Rust：db.rs（WAL/外键/busy_timeout + user_version 迁移 + 备份轮换 + quick_check）、commands.rs（get_stats/get_settings/set_setting 白名单/get_paths/reveal_path 路径白名单）、log.rs（5MB 轮转 + 凭证脱敏）、state.rs；tauri.conf（窗口 1280×800/min 1080×720、CSP、identifier com.weread.exporter.desktop）；capability 最小化（core/opener/dialog）。前端：tokens.css（发牌方向 achromatic-ledger + 纸感地面 #f4f3f1 + 深色映射）、Tailwind v4 @theme inline 映射、主题系统（system/light/dark + 首帧应用 + 系统跟随）、Open Plane 壳、4 组件 + 4 页面（总览真实统计/任务/书库真实空态/设置全功能）。
- **原因**：Phase 2 交付要求；UI 先设计系统后页面（用户约束）。
- **测试**：cargo test 3/3；clippy -D warnings 通过；npm build（tsc strict）通过；调试二进制启动 8s 无崩溃且日志落盘；浏览器截图验证浅/深主题渲染。
- **备注**：npm install 在外置 SSD 上耗时 28 分钟（环境因素）；开发中修复了 3 处 Rust 类型/死代码问题（管道吞退出码导致漏检，已改用 pipefail 复核）。

## 2026-11-06 · Phase 1 产品与架构设计

- **模块**：docs/
- **内容**：新增 04~11 共 8 份设计文档；UI 设计系统经 taste-skill `draw.mjs --app` 正式发牌（achromatic-ledger，seed 174849170），记录了 3 项有理由的产品适配（纸感地面 #f4f3f1、中文系统字体栈 + 衬线书名、数据蓝 #1d5fbf 用于进度）；协议 v1 定稿（JSON Lines、信封、17 类事件、对引擎仅 3 个可选参数的侵入面）；SQLite schema v1 + user_version 迁移策略。
- **原因**：总控计划 Phase 1 交付要求；UI 先设计系统后页面（用户约束）。
- **测试**：文档阶段无代码变更；发牌脚本输出复核通过。

## 2026-11-06 · Phase 0 仓库审计

- **模块**：docs/
- **内容**：新增 `00-project-audit.md`（登录/抓取/导出机制全量审计）、`01-existing-features.md`（复用分类）、`02-technical-risks.md`（12 项风险与缓解）、`03-migration-plan.md`（Monorepo 结构 + 引擎最小重构方案 + 阶段映射）；新增 PROJECT_STATUS / DEVELOPMENT_LOG / TODO。
- **原因**：总控计划 Phase 0 交付要求。
- **测试**：`.venv/bin/python -c "import crawl_weread, export_book"` 通过；`extract_book_id` 真实链接解析通过；`output/` 存在真实多格式导出产物。
- **结论**：原项目核心（Canvas 抓取 + 三格式导出 + 章节级断点落盘）全部复用；重构仅限"进度回调 + 输出目录"两个可选参数。
