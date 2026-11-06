# TODO

## Phase 1（进行中）
- [ ] 04-product-requirements.md
- [ ] 05-user-flows.md
- [ ] 06-system-architecture.md
- [ ] 07-database-design.md
- [ ] 08-engine-protocol.md
- [ ] 09-ui-design-system.md
- [ ] 10-security-design.md
- [ ] 11-testing-strategy.md

## Phase 2
- [ ] Tauri 2 + React + TS 工程初始化（apps/desktop）
- [ ] 设计 Token 与基础组件库
- [ ] 明/暗/跟随系统主题
- [ ] SQLite 接入 + 迁移机制
- [ ] 原生窗口、菜单、文件/文件夹选择器
- [ ] 配置持久化（settings 表）

## Phase 3
- [ ] 引擎三文件平移至 engine/，CLI 保持可用，run.bat 更新
- [ ] protocol.py（v1 消息构造）
- [ ] adapter/worker.py（stdin 指令 / stdout 事件 / stderr 日志）
- [ ] crawl_weread / export_book 增加可选 progress 回调与 output_dir 参数（默认行为不变）
- [ ] 引擎回归测试套件（纯函数单测 + 真实产物冒烟）
- [ ] Rust engine_manager（子进程生命周期、事件桥、崩溃识别）

## Phase 4-9
- [ ] 登录模块（浏览器弹出、状态检测、会话清理）
- [ ] 书籍导入（URL 解析、元数据、封面）
- [ ] 导出向导（4 步）
- [ ] 任务中心（真实进度、取消、继续、重试）
- [ ] 本地书库（封面墙、搜索、打开/定位/删除确认）
- [ ] 设置中心
- [ ] 断点续导 UI + 恢复校验
- [ ] UI/UX 精细化（动画、空态、错误态、响应式、减少动效）
- [ ] macOS arm64 打包（Python 运行时决策）
- [ ] Windows x64 打包
- [ ] 终验：全量测试 + 安装测试 + 文档（用户手册/测试报告/已知限制）
