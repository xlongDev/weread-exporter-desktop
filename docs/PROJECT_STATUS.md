# PROJECT STATUS

> 最后更新：2026-11-06

## 当前阶段

**v0.1.3 已构建待确认发版**：粘贴并获取 + 一键清除 + 最近导出接真实数据 + 设置页重构 + **应用退出后僵尸任务自动清扫**（全部来自真实使用反馈）。

**v0.1.2 已发布**：导出流程按真实使用反馈从四步向导重构为单页（3 次点击），修复输出目录默认值显示。

**v0.1.1 已发布**：修复真实首用发现的登录空白页 bug（登录浏览器现在自动打开微信读书扫码页）；三平台产物 + SHA256SUMS 均以 CI/Release 资产为正本、哈希已实测校验（dist/ 为正本副本）。

**Phase 8+9 - 打包与终验** → 完成（Windows 打包待真实 Windows 机器）

## CI/CD（已上线）

- 仓库：https://github.com/xlongDev/weread-exporter-desktop （公开）
- ci.yml：push/PR 自动回归（pytest + clippy + cargo test + tsc）—— 首跑即绿
- release.yml：tag v* 或手动触发 —— Windows NSIS（49MB）与 macOS arm64 DMG（85MB）已由 CI 产出
- dist/（本地）：aarch64.dmg 85MB · x64.dmg 82MB（本地交叉构建）· x64-setup.exe 49MB（CI 产出）
- GitHub Release：https://github.com/xlongDev/weread-exporter-desktop/releases/tag/v0.1.0 （三平台产物 + SHA256SUMS 已公开可下载；后续 tag 构建自动挂载 Release）

## 交付物

- `apps/desktop/src-tauri/target/release/bundle/macos/WeRead Exporter.app`（260MB，自包含）
- `apps/desktop/src-tauri/target/release/bundle/dmg/WeRead Exporter_0.1.0_aarch64.dmg`（85MB）
- Intel 版：`target/x86_64-apple-darwin/release/bundle/dmg/WeRead Exporter_0.1.0_x64.dmg`（82MB，交叉构建，应用与捆绑 Python 均为 x86_64，真机运行待验收）
- 全套文档：docs/00~15 + README + CHANGELOG

## 已完成

- [x] Phase 0~3（详见 DEVELOPMENT_LOG）
- [x] Phase 4：登录与书籍导入 —— worker login（可见浏览器扫码 300s + 取消）/ book_info（元数据 + 封面下载 + 可访问性校验）；Rust ops 管理（独立事件路由、取消、profile 迁移至应用数据目录）；前端 auth store + 登录卡（等待扫码/超时/取消态）+ 书籍导入页；logout 清除 profile；asset 协议展示封面；真实 Cookie 登录态检测验证通过
- [x] Phase 8：macOS arm64 打包 —— scripts/prepare-runtime.sh 组装 python-build-standalone 3.12.16 + 锁定版本引擎依赖 + 引擎源码副本进 .app 资源；resolve_python 打包路径探测；自绘书脊应用图标（icns/ico/png 全套）；**独立安装验证通过**（~/Applications 拷贝运行，捆绑 Python 握手 ok）
- [x] Phase 9：终验清单（docs/12）· 测试报告（docs/13）· 已知限制（docs/14）· 用户手册（docs/15）· README · CHANGELOG
- [x] Phase 7：动效层（页面淡入 160ms/浮层 140-180ms，prefers-reduced-motion 全降级）；taste-skill 设计门禁 lint 0 FAIL + inspect 0 FAIL（修复：章节状态 unicode 符号→真图标、暗色状态文本对比度提升至 ≥4.5:1、总览下部两栏消除空档）；封面墙悬停操作改描边样式
- [x] Phase 6：书库（封面墙/列表双视图、搜索、格式筛选、打开文件/定位、删除记录/删除文件带确认、文件缺失提示）；任务详情抽屉（章节级断点进度、任务日志、重试/继续导出→复用断点创建新任务）；应用关闭保护（任务运行时拦截关闭→确认→强制收尾引擎进程后退出）
- [x] Phase 5：导出向导 4 步（选书→格式多选→选项→确认，登录前置检查）；每格式一个任务 + **任务队列串行执行**（浏览器 profile 单实例约束）；list_tasks 命令；任务中心实时列表（真实进度条/章节/页/字数/耗时、取消、打开输出目录）；真实引擎全链路 Rust 测试（真实 python + 真实书籍数据 → 2 个 Markdown 产物 239KB）+ 队列串行化测试（**发现并修复 route_event DB 锁自死锁**）

## 待人工验收（见 docs/13 §3）

- [ ] 真实扫码登录 UI 全流程（需人工扫码）
- [ ] GUI 内真实书籍完整抓取 + 三格式导出
- [ ] Intel 版 macOS 真机运行验收（x86_64 DMG 已产出）
- [ ] Windows NSIS 安装包（脚本/icon.ico 就绪，需 Windows 机器）

## 未完成任务（按阶段）

- [ ] Phase 2 桌面工程骨架（Tauri 2 + React + 设计 Token + SQLite + 主题）
- [ ] Phase 3 引擎平移 + 协议 Worker + Rust 进程管理 + 回归测试
- [ ] Phase 4 登录与书籍导入
- [ ] Phase 5 导出向导与真实导出
- [ ] Phase 6 任务中心 + 书库 + 断点续导
- [ ] Phase 7 UI/UX 精细化
- [ ] Phase 8 macOS 打包 → Windows 打包
- [ ] Phase 9 终验与交付文档

## 阻塞问题

无。（真实扫码登录需要人工扫码 —— 到 Phase 4 验收时由用户配合，开发用 Mock/结构验证不阻塞。）

## 测试状态

- 引擎：pytest 26/26 ✅（+mock 登录/book_info 事件回归）
- 桌面端：cargo test 13/13 ✅（+真实引擎全链路 + 队列串行化）· clippy -D warnings ✅ · tsc strict + vite build ✅
- 真机验证：正式 .app 页面加载 ✅；开发模式引擎握手/worker 派生 ✅；真实 Cookie 登录检测（logged_in=true）✅；真实引擎导出全链路（2 产物 239KB）✅
