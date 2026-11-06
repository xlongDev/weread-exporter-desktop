# 12 - 发布检查清单（v0.1.0）

## 应用基础
- [x] 桌面应用正常启动（正式 .app 实测）
- [x] 窗口尺寸合理（1280×800，最小 1080×720）
- [x] 应用图标正确（自绘书脊图标，icns/ico/png 全套）
- [x] 主题切换正常（浅/深/跟随系统，首帧无闪白）
- [x] 配置持久化（SQLite settings，user_version 迁移 + 备份）
- [x] 中文显示正常（PingFang/雅黑栈，衬线书名）

## 登录
- [x] 能够启动登录浏览器（login op，可见窗口）
- [ ] 能够完成真实扫码登录 ⏳（需人工扫码；协议链路已自动化验证；超时路径已真实触发）
- [x] 能够识别登录状态（真实 Cookie 检测 logged_in=true 实测）
- [x] 能够识别会话失效（auth.status logged_in=false 路径）
- [x] 能够退出登录（profile 目录清除）
- [x] 敏感数据不出现在日志中（redact 单测 + 协议/DB 无敏感字段）

## 书籍导入
- [x] 输入/验证链接（前后端同规则解析 + Rust 白名单校验）
- [x] 解析书籍信息（book_info op：元数据 + 封面下载）
- [x] 显示书籍封面（asset 协议 + 衬线书脊占位）
- [x] 处理无效书籍（明确失败原因文案）

## 导出
- [x] 创建任务（向导 4 步 → 真实 DB 记录）
- [x] 执行真实导出（真实引擎全链路自动化验证 + Mock 模式 UI 验证）
- [x] 显示真实进度（页/章/字数/耗时，来自引擎事件）
- [x] 取消任务（优雅停止，断点保真）
- [x] 处理失败（userMessage 与技术详情分离，任务日志可查）
- [x] 重试任务 / 继续导出（resumed_from 关联，引擎断点续跑）
- [x] 输出文件正常打开（open_file + 定位）
- [x] 不支持的格式不伪装（仅 PDF/EPUB/Markdown，向导内如实说明）

## 书库
- [x] 展示导出历史（封面墙/列表）
- [x] 搜索 + 格式筛选
- [x] 打开文件 / 定位文件
- [x] 删除有确认（仅记录 / 记录+文件 两档）
- [x] 文件缺失提示（exists_ok 检查）

## 稳定性
- [x] 引擎异常退出可识别（stdout EOF 无终态 → failed/cancelled 收敛）
- [x] 网络错误处理（引擎异常 → task.failed → 用户文案）
- [x] 文件系统异常（目录创建/权限错误文案）
- [x] 任务状态持久化（SQLite 单写者状态机）
- [x] 应用重启后数据正常（DB 持久）
- [x] 数据库迁移正常（user_version + 备份 + 幂等测试）
- [x] 关闭保护（运行中任务拦截 + force_close 清理）

## 交付
- [x] GitHub Release 页已发布（v0.1.0：双 DMG + Windows exe + SHA256SUMS 可公开下载）
- [x] macOS 安装包构建成功（.app 260MB / DMG 85MB）
- [x] Windows 安装包构建成功（GitHub Actions windows runner 产出 NSIS setup.exe 49MB，已下载归档 dist/）
- [x] 独立安装后能够运行（~/Applications 拷贝实测，捆绑 Python 3.12.16 握手通过）
- [x] 不需要用户手动安装开发依赖（运行时全内置）
- [x] README 完整（见根目录）
- [x] 用户手册完整（docs/15）
- [x] 测试报告完整（docs/13）
- [x] 已知限制明确（docs/14）

> 未经真实验证的项保持未勾选并标注 ⏳。
