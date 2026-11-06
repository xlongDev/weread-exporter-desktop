# 03 - 迁移方案（Phase 0）

## 1. 目标仓库结构（Monorepo）

```text
weread-book-exporter/            # 仓库根（原 Python 项目原地升级）
├── engine/                      # Python 导出引擎（自主进程，Rust 管理生命周期）
│   ├── crawl_weread.py          # ← 原文件平移（抓取核心，逻辑不改）
│   ├── export_book.py           # ← 原文件平移（导出核心，逻辑不改）
│   ├── main.py                  # ← 原文件平移（CLI 入口，保持可用）
│   ├── adapter/
│   │   └── worker.py            # ➕ 桌面协议 Worker：stdin 指令 → stdout JSON 事件
│   ├── protocol.py              # ➕ 协议消息构造（v1）
│   └── tests/                   # ➕ 引擎回归测试
├── apps/desktop/                # ➕ Tauri 2 桌面应用
│   ├── src/                     #    React + TS + Vite + Tailwind
│   └── src-tauri/               #    Rust：进程管理、SQLite、事件桥
├── scripts/                     # ➕ 构建/开发脚本
├── docs/                        # 项目文档（本目录）
├── output/                      # 引擎产物（gitignore）
├── cache/                       # 浏览器 profile（gitignore）
└── requirements.txt             # 引擎依赖（锁定 ==）
```

**平移原则**：三个引擎文件同目录整体移动，模块间 `import crawl_weread/export_book` 关系不变，`BASE` 随文件位置自适应 —— CLI（`python engine/main.py <链接>`）保持可用；`run.bat` 路径同步更新。

## 2. 引擎最小重构（保持默认行为不变）

| 改动 | 方式 |
| --- | --- |
| 进度事件化 | `crawl_weread.main(book_id, force=False, progress=None)` 增加**可选**回调参数；关键节点（翻页/落章/登录/完成）调用 `progress(event_dict)`；默认 `None` 时零行为差异 |
| 输出目录参数化 | `main()` / `export_book.main()` 增加**可选** `output_dir=None` 参数，`None` 时回退原 `BASE/output` |
| 协议 Worker | `adapter/worker.py` 独立进程运行：读 stdin JSON 指令（start_task/cancel/check_auth…），stdout **只**输出协议 JSON 行，人类日志走 stderr；复用上述两个可选参数，不复制业务逻辑 |

## 3. 桌面通信架构

```text
React UI ──invoke/event──> Tauri(Rust)
                            ├─ engine_manager: 派生 python worker 子进程（stdin/stdout 管道）
                            ├─ 协议解析: JSON Lines → Tauri Event → 前端
                            ├─ SQLite (rusqlite + user_version 迁移): books/tasks/chapters/files/settings
                            └─ 文件服务: 输出目录管理、打开文件/文件夹
Python Worker（engine/adapter/worker.py）
                            └─ 复用 crawl_weread / export_book 全部能力
```

约束：前端不接触任意路径与子进程；协议消息带 `protocol_version` 与 `task_id`；stdout 单行可解析，损坏行丢弃并计数。

## 4. 数据库迁移策略

SQLite + `PRAGMA user_version` 顺序迁移脚本（Rust 侧 `migrations/` 内嵌数组），启动时自动升级；外键开启、事务写入；升级前自动备份 db 文件。

## 5. Git 策略（用户约束）

- 分支：`main` + `feature/desktop`；每个 Phase 在 feature 分支上独立提交，完成后合并回 main（main 始终可用）。
- 依赖锁定：`requirements.txt` 用 `==`；前端 `package-lock.json` 提交；Rust `Cargo.lock` 提交。
- 发布顺序：macOS (arm64) 先行 → Windows x64。

## 6. 阶段任务映射（与总控计划一致）

| Phase | 内容 | 关键验收 |
| --- | --- | --- |
| 0 | 仓库审计（本文件组） | 能解释登录/抓取/导出机制 ✅ |
| 1 | 产品/架构/协议/DB/设计系统文档 | 文档可实施 |
| 2 | Tauri 工程骨架 + 设计系统 + SQLite | 窗口可启动、明暗主题、配置持久化 |
| 3 | 引擎平移 + 协议 Worker + Rust 进程管理 | 引擎事件直达 UI、异常退出可识别、回归测试通过 |
| 4 | 登录 + 书籍导入 | 真实扫码登录、真实元数据 |
| 5 | 导出向导 + 任务执行 + 真实进度 | 真实格式导出验证 |
| 6 | 任务中心 + 书库 + 断点续导 | 重启后数据正确 |
| 7 | UI/UX 精细化 | 无占位/无效交互 |
| 8 | macOS 打包 → Windows | 正式安装包独立运行 |
| 9 | 终验 + 文档 + 测试报告 | 全清单核对 |
