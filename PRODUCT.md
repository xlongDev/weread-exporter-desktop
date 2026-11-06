# PRODUCT.md

> 来源：由项目总控提示词与 docs/04-product-requirements.md 推导（用户授权自主连续执行）。

## What this is

WeRead Exporter Desktop —— 微信读书电子书导出与本地书库管理桌面应用（macOS 先行，Windows 随后）。
用户粘贴书籍链接 → 扫码登录 → 引擎真实抓取 → 得到精排 PDF / EPUB / Markdown → 在书库中管理。

## Who it's for

- 想备份自己有权阅读的微信读书书籍的普通读者（主要用户）。
- 想归档进 Obsidian/Notion 的知识管理者。
- 不理解 Python/终端的普通用户 —— 一切操作在 GUI 内完成。

## The one question each screen answers

- 总览：现在能不能导？正在跑什么？上次导了什么？
- 任务中心：我的导出进行到哪了？出问题了吗？
- 书库：我导出过哪些书，怎么打开/清理？
- 设置：应用如何行为？（主题/目录/数据）
- 导出（向导，Phase 5 接入）：四步创建一个真实导出任务。

## Truth constraints（不可违反）

- 无假数据/假按钮/假进度；进度来自引擎事件。
- 只承诺引擎真实支持的格式：PDF / EPUB / Markdown。
- 导出速度固定温和（防风控），UI 明示耗时预期。
- 敏感会话数据永不进日志/前端。

## Platform

Tauri 2 桌面应用（desktop only），中文优先 UI，浅色/深色/跟随系统主题。
