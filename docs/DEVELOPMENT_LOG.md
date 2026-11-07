# DEVELOPMENT LOG

## 2026-11-07 · v0.1.1：真实首用缺陷修复与发版

- **来源**：用户首次实际使用发现 —— 点「登录微信读书」弹出的浏览器是空白 about:blank，无二维码可扫。
- **根因**：独立登录流程（worker login op）只创建浏览器上下文等待 Cookie，**从未导航到微信读书登录页**（CLI 流程由抓取入口顺带完成导航，独立化时遗漏）。
- **修复**：login op 打开浏览器后先 goto `weread.qq.com/#login`（headless 探测确认渲染「使用微信扫一扫登录」二维码 iframe），再进入 300 秒扫码轮询；端到端验证 auth.required 在 3 秒内（导航完成后）发出。
- **发版**：v0.1.1 三平台（本地 arm64/Intel 交叉构建 + CI arm64/Windows），Release 资产为正本、SHA256SUMS 按发布页点号名生成并实测 `shasum -c` 3×OK；release.yml 补 Release 不存在时自动创建。
- **教训**：①独立化的用户流程必须完整复刻原流程的每一步（含导航）；②网络抖动下的下载会留半截文件 —— 分发产物必须按 API 大小逐字节校验后再入 dist；③本地构建与 CI 构建字节不同（内嵌时间戳），发布校验和必须以 Release 资产为正本。

## 2026-11-07 · 前端测试层补齐 + GitHub Release

- **模块**：apps/desktop（vitest.config.ts、bookId/api/stores 三组测试）、CONTRIBUTING.md（新增）、.github/workflows/release.yml（Release 自动挂载）、README/docs
- **内容**：前端 vitest 22 项 —— bookId 与引擎/Rust 三层规则对齐、toAppError 归一、四个 store 的 IPC 全 mock 测试（engine 握手与事件转换 / settings 读写缓存一致性 / tasks 拉取与失败不清空 / auth 事件驱动状态机）；GitHub Release v0.1.0 发布（三平台产物 + SHA256SUMS 公开下载）；release.yml tag 构建自动挂载 Release；CONTRIBUTING.md（环境/门禁/发版/诚实性与安全红线）。
- **测试**：vitest 22/22 · pytest 29/29 · cargo 14/14 · CI 线上全绿。
- **修复**：listen mock 的展开参数类型（tsc strict TS2556/TS6133）。

## 2026-11-07 · 真实抓取验收与取消响应性改进

- **模块**：engine/crawl_weread.py（sleep_cancellable）、engine/tests/test_crawl_cancel.py（新增）
- **内容**：翻页延迟（8~20s）与温和长停顿（60~120s）切片化为 5s 粒度并在每片检查 should_cancel —— 取消指令从"最长等 2 分钟"降到"≤5 秒生效"；CLI（不传回调）行为不变。真实服务器验证：以用户有效会话抓取 18~23 页真实内容（隔离临时输出），第 1 章完整落盘，取消后断点态正确（completed=false）。
- **测试**：pytest 29/29（+取消响应性 3 项）；发布流程新增三项 CI 修复（占位文件恢复/Windows sha256sum/运行时父目录）。
- **遗留**：（已解决）断点续传续跑以确定性 stdin 文件驱动复测成功：23 页断点 → 页序号 23→27 连续 → 第 2 章自动落盘。此前 wrapper 脚本静默挂起定位为测试外壳复制 profile 的环境怪癖（原 profile 立即成功），非产品缺陷。

## 2026-11-07 · 收尾质量自查（生命周期与关闭路径）

- **修复**：①关闭守卫原来只检查运行中任务 —— 登录窗口（ops）打开时关闭应用会遗留孤儿 worker/浏览器，现 ops 占用同样触发确认对话框；②引擎进程启动失败时任务永久停留 waiting —— 现在 enqueue_or_start / start_next_queued 失败路径调用 mark_task_spawn_failed 显式落库 failed（ENGINE_SPAWN_FAILED），且不改写已终态任务。
- **测试**：新增 spawn_failure_marks_task_failed 确定性回归（不再依赖进程环境变量 + 真实 spawn，规避并行竞态）；ENV_LOCK 毒化容忍；套件连跑三次 14/14 稳定。
- **验证**：pytest 26/26 · cargo 14/14 · clippy 0 · tsc/vite 通过；两个 DMG hdiutil 挂载验证通过；真实 PDF/EPUB 导出实测通过（三格式全实测）。

## 2026-11-07 · Phase 8+9 打包与终验

- **模块**：scripts/prepare-runtime.sh（新增）、scripts/make-icon.py（新增）、tauri.conf.json（资源映射 + 前置命令）、worker.rs（打包运行时解析）、docs/12~15、README、CHANGELOG
- **内容**：python-build-standalone 3.12.16（aarch64，可重定位）+ requirements.txt 锁定依赖 → 捆绑进 .app/Contents/Resources/runtime；引擎源码副本 → Resources/engine；resolve_python 打包分支；自绘几何书脊图标（纯 stdlib PNG 渲染 + iconutil/ico）。
- **验收（真实执行）**：正式 .app 页面加载 ✅；**捆绑运行时引擎握手 ok（python 3.12.16，系统为 3.15，证明自包含）** ✅；拷贝至 ~/Applications 独立运行 ✅；DMG 85MB / .app 260MB。
- **已知限制**：Windows 打包待真实机器；未签名公证；体积主要来自 Playwright 驱动（133MB 刚性）。

## 2026-11-07 · Phase 7 UI/UX 精细化

- **模块**：styles/index.css（动效 keyframes）、AppShell/Dialog/Drawer（动效类）、tokens.css（暗色 faint 提亮 + negative/warning 正文文本色）、Dashboard（两栏下部）、Tasks/Library（图标与样式修正）
- **内容**：页面切换 160ms 淡入上移；遮罩 140ms + 对话框 160ms 缩放 + 抽屉 180ms 滑入；prefers-reduced-motion 全局降级；taste-skill lint --app 0 FAIL、inspect --app 0 FAIL（3 个保留 WARN 有据：Dialog/Drawer 阴影属规范允许浮层、em-dash 均为缺失值占位符 —）。
- **测试**：全套门禁绿（pytest 26 / cargo 13 / tsc+vite / lint+inspect）。
- **已知限制（记录）**：窗口最小宽度 1080px 保证布局完整，侧栏折叠为图标栏暂不实现（画布流式布局已覆盖最小窗口）。

## 2026-11-07 · Phase 6 书库与断点续导

- **模块**：Rust commands（list_files/open_file/reveal_exported_file/delete_exported_file/get_task_detail/reveal_task_log/force_close、create_task 增加 resumed_from）、前端（Dialog/Drawer 组件、Library 封面墙、任务详情抽屉、CloseGuard）
- **内容**：书库双视图 + 搜索筛选 + 三类删除确认（仅记录/记录+文件，均明确指名文件）；任务详情含章节级断点账本（task_chapters）与日志定位；failed/cancelled 任务可重试/继续（新任务 resumed_from 关联原任务，引擎凭 raw 落盘自动从断点续跑）；任务运行时关闭窗口被拦截并引导确认，确认后 kill 全部引擎进程再退出。
- **测试**：cargo 13/13、pytest 26/26、构建全绿。
- **修复**：commands.rs 因锚点重复导致的函数重复定义（reveal_exported_file / force_close 各一次）。

## 2026-11-07 · Phase 4+5 登录导入与完整导出

- **模块**：engine/adapter/worker.py（login/book_info ops）、Rust manager/commands/state（ops 管理、任务队列、list_tasks、reveal_task_dir、import_book、logout、asset 协议）、前端（auth store、登录卡、导出向导 4 步、任务中心实时列表、任务 store）
- **内容**：
  - 登录：login op 弹可见浏览器扫码（300s、可取消），auth_check 无头检测；profile 迁移至应用数据目录（WEREAD_PROFILE 注入）；logout 直接清除 profile 目录。
  - 导入：book_info op 无头浏览器读取元数据 + 封面下载（cover_path 经 Rust 白名单校验后入库）；前端 wizard 第一步 + 书籍卡片。
  - 向导：格式多选（每格式一个任务）→ 输出目录（原生目录选择器）→ 确认页（登录前置提示 + 预计任务说明）。
  - 队列：enqueue_or_start + start_next_queued，同一时刻一个任务占用引擎；取消等待中任务时从队列移除。
  - 任务中心：list_tasks（join books）+ engine://event 驱动刷新；真实进度条与章节/页/字数/耗时。
- **测试**：pytest 26/26；cargo 13/13（新增：真实引擎全链路、队列串行化）；clippy/构建全绿；真实 Cookie 登录检测 ✅。
- **关键修复**：①auth_check 事件缺 task_id（op 终态匹配失效）；②route_event 终态分支 DB 锁守卫作用域覆盖 start_next_queued → 同线程重入自死锁（队列测试抓出）——显式收敛锁作用域；③mock 标志显式传参消除测试环境变量竞态。

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
