# 📚 WeRead Exporter Desktop

微信读书电子书导出桌面应用 —— 把你在微信读书中**有权阅读**的书籍，无损导出为 **精排 PDF / EPUB / Markdown**，并在本地书库中管理。

> 本项目是 [weread-book-exporter](https://github.com/WANGXIN-567/weread-book-exporter)（CLI 版）的桌面化改造：Tauri 2 + React + TypeScript + Rust + Python。GUI 内完成登录、选书、导出、任务管理与书库整理，**无需安装 Python 或命令行**。

![preview](assets/preview.png)

## ✨ 功能

- **扫码登录**：弹出浏览器微信扫码，会话保存在本机，随时可退出/清除。
- **导出向导**：粘贴书籍链接 → 选格式（可多选）→ 选目录 → 确认，四步创建任务。
- **真实进度**：任务中心实时显示当前章节、页数、字数、耗时 —— 全部来自引擎真实事件，无假进度。
- **断点续导**：每页逐页落盘；取消/失败后可从断点继续，不从头再来。
- **本地书库**：封面墙/列表、搜索筛选、打开文件、定位、安全删除（有确认）。
- **温和抓取**：随机 8~20 秒翻页间隔 + 分段长停顿，保护账号（速度固定，不可调快）。
- **明暗主题**：浅色 / 深色 / 跟随系统；中文优先界面。

## 📦 下载安装

从 Releases 下载对应平台的安装包：

| 平台 | 文件 | 状态 |
| --- | --- | --- |
| macOS (Apple Silicon) | `WeRead Exporter_0.1.0_aarch64.dmg` | ✅ 已验证（本地 + CI 双产出） |
| macOS (Intel) | `WeRead Exporter_0.1.0_x64.dmg` | ✅ 本地交叉构建（真机运行待验收） |
| Windows x64 | `WeRead Exporter_0.1.0_x64-setup.exe` | ✅ CI 产出（NSIS，真机安装待验收） |

仓库：https://github.com/xlongDev/weread-exporter-desktop （Actions → Release 构建 可随时重产三平台包；Intel 包用本地交叉构建命令）。

macOS 未签名版本首次打开：右键点击应用 → 打开。

## 🚀 从源码构建

```bash
# 0) 前置：Node 20+、Rust 1.80+、Python 3.10+（仅构建引擎依赖用）
python -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt

# 1) 前端依赖
cd apps/desktop && npm install

# 2) 开发模式
npx tauri dev

# 3) 生产构建（自动组装捆绑 Python 运行时 + 引擎资源）
npx tauri build
# 产物：apps/desktop/src-tauri/target/release/bundle/{macos,dmg}/
```

Windows 构建：同一命令（资源脚本自动选 x86_64 运行时），需在 Windows 机器上执行。

## 🤝 参与

见 [CONTRIBUTING.md](CONTRIBUTING.md)：环境搭建、四层测试门禁、提交与发版约定。

## 🧪 测试

**只想用命令行？** 引擎仍可独立运行：`.venv/bin/python engine/main.py <书籍链接或ID>`（Windows: `run.bat`）。

```bash
.venv/bin/python -m pytest engine/tests -q     # 引擎回归（含真实数据导出）
cd apps/desktop/src-tauri && cargo test --lib  # 桌面端（含全链路集成）
cargo clippy -- -D warnings
cd apps/desktop && npm run build               # tsc strict + vite
```

## 🗂 目录结构

```text
engine/            # Python 导出引擎（可独立 CLI 运行）
├── crawl_weread.py / export_book.py / main.py
├── adapter/worker.py   # 桌面协议 Worker（JSON Lines v1）
└── tests/              # pytest 回归
apps/desktop/      # Tauri 2 桌面应用（React + TS + Rust）
docs/              # 审计/设计/协议/测试/手册等全部文档
scripts/           # 构建/运行时/图标脚本
```

## ⚠️ 免责声明

1. 本工具仅用于个人学习、读书笔记整理与技术研究。
2. 请支持正版阅读，仅对您**个人合法拥有阅读权限**的书籍使用本工具，导出的文件请勿用于任何商业用途或公开传播。
3. 本仓库不包含任何受版权保护的书籍内容或个人登录信息。

## 📄 许可证

MIT License（详见 LICENSE）。桌面化部分同样以 MIT 发布。

如果这个工具对你有帮助，欢迎给原项目点一颗 Star ⭐！
