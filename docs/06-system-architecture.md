# 06 - 系统架构

## 1. 技术栈与版本策略

| 层 | 选型 | 锁定方式 |
| --- | --- | --- |
| 桌面框架 | Tauri 2.x | Cargo.lock 提交 |
| 前端 | React 18 + TypeScript 5（strict）+ Vite | package-lock.json 提交 |
| 样式 | Tailwind CSS（v4）+ CSS 变量设计 Token | lockfile |
| 状态 | Zustand；服务端态用轻量自管 hooks（不引 TanStack Query，任务态本就来自事件流） | lockfile |
| 动画 | Motion (framer-motion) | lockfile |
| 图标 | Lucide | lockfile |
| Rust 侧 | rusqlite(bundled) + serde/serde_json + tauri-plugin-dialog + tauri-plugin-opener + tauri-plugin-notification | Cargo.lock |
| 引擎 | Python 3.10+；playwright==1.64.1、EbookLib==0.21、Markdown==3.11.3（requirements 全 ==） | requirements.txt |
| 数据 | SQLite（应用数据目录） | — |

## 2. Monorepo 结构

```text
├── engine/            # Python 引擎（独立进程）
│   ├── crawl_weread.py / export_book.py / main.py   # 平移，CLI 保留
│   ├── protocol.py    # 协议 v1 消息构造
│   ├── adapter/worker.py  # 桌面 Worker（stdin/stdout）
│   └── tests/         # pytest 回归
├── apps/desktop/
│   ├── src/           # React
│   │   ├── app/       # 壳、路由、主题
│   │   ├── features/  # dashboard/ wizard/ tasks/ library/ settings/
│   │   ├── components/# 设计系统组件
│   │   ├── services/  # tauri invoke/event 封装（唯一 IPC 边界）
│   │   ├── stores/    # zustand
│   │   └── styles/    # tokens.css
│   └── src-tauri/     # Rust
│       └── src/
│           ├── engine/    # 子进程管理 + 协议解析
│           ├── db/        # rusqlite + migrations
│           ├── commands/  # #[tauri::command] 面
│           └── files.rs   # 输出目录/打开文件服务
├── shared/            # 协议类型（TS 类型 + Rust serde 结构对齐）
├── scripts/           # dev/build 脚本
└── docs/
```

## 3. 进程模型

```text
React ── invoke(命令)/listen(事件) ── Rust 主进程
                                     ├─ DB (SQLite, 应用数据目录)
                                     ├─ engine_manager
                                     │    ├─ 每任务派生 1 个 python worker 子进程
                                     │    ├─ stdin: JSON 指令行；stdout: JSON 事件行；stderr: 日志
                                     │    ├─ 崩溃/退出监听 → 任务状态机收敛
                                     │    └─ cancel 指令 → 优雅停止（翻页边界）
                                     └─ 文件服务（打开文件/文件夹、目录校验）
Python Worker ── 复用 crawl_weread / export_book（progress 回调 + output_dir + should_cancel 三个可选参数）
```

设计决定：
- **每任务一个 worker 进程**（非常驻）：与引擎"一次一个浏览器 profile"约束天然一致，崩溃隔离简单，无状态机同步负担。
- 会话检查 / 书籍信息获取也走 worker（命令 `auth.check` / `book.info`），用完即退。
- 前端不持有子进程句柄、不知道 python 路径；Rust 按"开发模式=venv python / 打包模式=捆绑运行时"解析引擎入口。

## 4. 状态机（export_tasks.status）

```text
waiting → running → completed
              ├→ cancelled   （用户取消，可 resume → 新任务 running）
              └→ failed      （可 retry / resume）
```
状态迁移只发生在 Rust（DB 单写者）；引擎事件是迁移的输入，UI 是状态的投影。

## 5. 错误模型

统一 `AppError { code, category: AUTH|NETWORK|ENGINE|EXPORT|FILESYSTEM|DATABASE|SYSTEM, message, userMessage, recoverable, details?, timestamp }`：
- 引擎协议错误 → Rust 映射为 AppError；技术详情（traceback）只进日志与详情抽屉折叠区，不进主 UI。
- Rust command 返回 `Result<T, AppError>`（serde 序列化），前端 services 层统一转 toast/内联提示。

## 6. 日志

- 前端：console + 收集到 Rust（`log.debug` command，仅诊断级别开关开启时）。
- Rust：tauri-plugin-log → 应用日志目录滚动文件；协议原始行仅 debug 级。
- 引擎 stderr → 追加写任务日志文件（`logs/task-{id}.log`），UI 可打开。
- 红线：Cookie/wr_skey/完整个人信息永不落日志（见 10）。

## 7. 打包（macOS 先行）

- macOS arm64（Apple Silicon）先行：Tauri bundle (.app/.dmg) + 捆绑 Python 运行时 + 引擎代码（resources）。Playwright 优先使用系统 Chrome/Edge（免捆绑 200MB 浏览器），缺失时引导 `playwright install chromium`（写明在用户手册）。
- Windows x64 后置（Phase 8）：NSIS 安装包，相同资源策略。
- 开发模式：`scripts/dev.sh` 并行起 vite + cargo tauri dev。
