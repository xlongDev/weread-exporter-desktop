# 贡献指南

感谢参与 WeRead Exporter Desktop！

## 开发环境

```bash
# 前置：Node 20+ · Rust 1.80+ · Python 3.10+
python -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
cd apps/desktop && npm install
```

## 常用命令

```bash
.venv/bin/python -m pytest engine/tests -q      # 引擎回归
cd apps/desktop
npm run test                                    # 前端单测（vitest）
npm run build                                   # tsc strict + vite
cd src-tauri && cargo clippy -- -D warnings && cargo test --lib
npx tauri dev                                   # 桌面开发模式
npx tauri build                                 # 生产构建（自动组装捆绑运行时）
```

## 约定

- **分支**：`main` 保持可用；开发在 `feature/*` 分支，每个 Phase/功能独立提交。
- **提交信息**：`type(scope): 摘要`（feat/fix/test/docs/ci/chore）。
- **质量门禁**：改动核心逻辑后必须重跑上表全部测试；CI（GitHub Actions）会在 push 时自动执行。
- **测试**：新增逻辑必须带测试；引擎纯函数、Rust 状态机、前端 store/工具层各有既定测试位置（见 docs/11-testing-strategy.md）。
- **诚实性红线**：不引入假数据/假进度/无效按钮；未验证的功能在文档中如实标注（docs/13、docs/14）。
- **安全红线**：Cookie 等会话数据不进日志/协议/数据库；新增命令面必须做路径与输入白名单校验（docs/10-security-design.md）。

## 发版

```bash
git tag vX.Y.Z && git push origin vX.Y.Z   # CI 自动构建三平台产物并挂载到 Release
```

（Intel macOS 包由本地交叉构建：`TAURI_TARGET=x86_64-apple-darwin npx tauri build --target x86_64-apple-darwin`）

## 许可

提交即表示同意以 MIT 许可证（见 LICENSE）授权你的贡献。
