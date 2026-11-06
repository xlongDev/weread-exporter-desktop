# PROJECT STATUS

> 最后更新：2026-11-06

## 当前阶段

**Phase 5 - 完整导出功能** → 完成，进入 Phase 6（任务管理与本地书库）

## 已完成

- [x] Phase 0~3（详见 DEVELOPMENT_LOG）
- [x] Phase 4：登录与书籍导入 —— worker login（可见浏览器扫码 300s + 取消）/ book_info（元数据 + 封面下载 + 可访问性校验）；Rust ops 管理（独立事件路由、取消、profile 迁移至应用数据目录）；前端 auth store + 登录卡（等待扫码/超时/取消态）+ 书籍导入页；logout 清除 profile；asset 协议展示封面；真实 Cookie 登录态检测验证通过
- [x] Phase 5：导出向导 4 步（选书→格式多选→选项→确认，登录前置检查）；每格式一个任务 + **任务队列串行执行**（浏览器 profile 单实例约束）；list_tasks 命令；任务中心实时列表（真实进度条/章节/页/字数/耗时、取消、打开输出目录）；真实引擎全链路 Rust 测试（真实 python + 真实书籍数据 → 2 个 Markdown 产物 239KB）+ 队列串行化测试（**发现并修复 route_event DB 锁自死锁**）

## 进行中

- [ ] Phase 6：任务详情抽屉、书库页面（封面墙/搜索/打开/删除确认）、断点续导（继续导出/重新导出）、重试

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
