# PROJECT STATUS

> 最后更新：2026-11-06

## 当前阶段

**Phase 3 - Python 引擎封装** → 完成（待生产构建验证收尾），进入 Phase 4（登录与书籍导入）

## 已完成

- [x] Phase 0：全量源码审计 + 功能复用分类 + 风险清单 + 迁移方案
- [x] Phase 1：04~11 全套设计文档（含 taste-skill 发牌设计系统）
- [x] Phase 2：Tauri 2 + React 19 + TS strict 工程；设计 Token（浅/深）；基础组件；SQLite 迁移；设置持久化；日志脱敏；最小 capability/CSP
- [x] Phase 3：引擎三文件平移至 engine/（CLI 保持可用，BASE 自适应仓库根）；crawl/export 增加可选 progress / should_cancel / output_dir 参数（默认行为不变）；protocol.py（v1）；adapter/worker.py（stdin 指令 / stdout 协议行 / stderr 日志 + Mock 模式）；Rust engine 模块（worker.rs 子进程管理 + protocol.rs 解析 + manager.rs 任务状态机 + 全链路集成测试）；create_task / cancel_task / engine_status 命令；引擎握手预热 + 前端事件订阅；pytest 回归 25/25（含真实数据导出回归）

## 进行中

- [ ] Phase 3 收尾：`tauri build` 生产构建验证（进行中）
- [ ] Phase 4：登录与书籍导入（auth_check 弹窗扫码 / book_info 元数据 / books 表落库 / 导出向导第一步）

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

- 引擎：pytest 25/25 ✅（纯函数 / 协议解析 / Worker 子进程 Mock 集成 / 真实数据导出回归）
- 桌面端：cargo test 11/11 ✅（迁移 ×2 + 脱敏 + 协议解析 ×3 + python 解析 + 任务状态机 ×2 + 全链路 Mock 集成）· clippy -D warnings ✅ · tsc strict + vite build ✅
- 真机验证：**正式 .app 产物（tauri build）页面加载 ✅、前端 invoke ✅**；开发模式（tauri dev）引擎握手 ✅、Rust 派生真实 python worker ✅（日志 `engine handshake ok: v0.1.0 (python 3.15.2)`）
- 已知观察：①裸 `cargo build`（非 tauri CLI 路径）的嵌入式资产页面不加载 —— 官方路径无影响，以 tauri build 产物为准；②生产 .app 引擎握手失败为预期（engine/Python 运行时资源打包在 Phase 8 实施），UI 如实显示"引擎异常"
