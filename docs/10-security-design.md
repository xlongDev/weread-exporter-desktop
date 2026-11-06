# 10 - 安全设计

## 1. Tauri 最小权限

- `capabilities/`：仅授予 `core:window`（本窗口）、`dialog:allow-open`（目录/文件选择）、`opener:allow-open-path` + `opener:allow-reveal-item-in-dir`（白名单式路径打开）、`notification`（默认关，用户开启后启用）。不授予 shell 插件、不授予任意 fs 全域访问。
- CSP：`default-src 'self'; img-src 'self' asset: http://asset.localhost data: https://res.weread.qq.com https://weread.qq.com; style-src 'self' 'unsafe-inline'`（内联样式仅设计 token 引导段）。连接一律走 Rust，不出现前端 fetch 外部域。
- `withGlobalTauri: false`；生产构建关闭 devtools 默认入口。

## 2. IPC 面（前端能做什么）

前端只能调用显式 `#[tauri::command]`：`list_tasks / create_task / cancel_task / resume_task / delete_task / list_files / delete_file / open_file / reveal_path / get_settings / set_settings / check_auth / start_login / logout / fetch_book_info / get_status / export_diagnostics`。
- **路径安全**：`open_file/reveal_path/delete_file` 的路径参数必须命中数据库记录或 `settings.general.output_dir` 前缀校验（规范化后 starts-with），拒绝 `..`、符号链接逃逸；删除命令必须带记录 id（不接受裸路径删除）。
- 前端永远不知道 python 解释器路径与引擎内部目录布局。

## 3. 子进程安全

- worker 以固定参数启动（`-m engine.adapter.worker`），无 shell 解释层（直接 spawn，无 `cmd /c`），参数不含用户输入字符串拼接。
- stdin/stdout 管道关闭即检测；僵尸进程防护：应用退出时 kill 子进程组（macOS: `killpg`）。
- 浏览器进程由 Playwright 管理；cancel 时先优雅停止再关浏览器上下文。

## 4. 会话与敏感数据

- Cookie/登录态只存在于 Playwright profile 目录：`<app_data_dir>/browser_profile`（原 `cache/browser_profile` 的桌面版迁移目标），目录权限 0700（macOS/Linux）。
- 红线：Cookie、wr_skey、wr_vid 不进协议消息、不进日志、不进数据库、不进前端（协议与 DB schema 均无该字段）；日志输出统一经 `redact()` 过滤 `wr_skey=...`/`wr_vid=...` 模式。
- "退出登录" = 删除 profile 目录内会话（清 Cookie）并上报；"清除会话" = 整个 profile 目录删除重建。
- 诊断报告导出前过 redact + 目录白名单（只含任务/版本/错误摘要，不含正文内容与 profile）。

## 5. 输入校验

- 书籍 ID：服务端（Rust）复验 `^[A-Za-z0-9_-]{6,36}$` 与 URL 正则，拒绝其余。
- 输出目录：必须是用户经系统对话框选择或默认目录；不存在则创建前校验父目录可写；拒绝设备文件/根目录。
- 文件名：沿用引擎清洗（`[<>:"/\\|?*]` → `_`），追加 Windows 保留名与尾部空点处理（Phase 8 验证）。

## 6. 平台合规

工具仅用于个人备份有权阅读的内容；README/应用内保留原项目免责声明；不绕过付费墙，登录态来自用户本人扫码。
