# DESIGN.md

> 视觉世界来源：taste-skill `draw.mjs --app` 正式发牌 **Achromatic Ledger**（seed 174849170，2026-11-06），完整规范见 docs/09-ui-design-system.md。Operate 模式。

## The move（不可丢）

Chrome 无色。色彩只给：唯一数据蓝 `--data`（进度/当前任务）与书封本身。
主按钮近黑；表面分离靠一档灰阶或 1px 线；无阴影/渐变/玻璃/图标圆片/KPI 瓷砖。
KPI 是文字；表格是线与对齐；数据态诚实（0 写 0，缺失写 —）。

## Face

- 文字/界面：系统中文栈（PingFang SC / Microsoft YaHei），数字 `tabular-nums`。
- 第二字体（单一职责）：衬线 Songti SC / Noto Serif SC —— 只用于书名与产品名。

## Signature element（本产品独有）

封面墙（书库网格）+ 进度条上的真实数据（蓝 #1d5fbf / 暗色 #5b8fd9）。
空态用"书脊"式排版占位（衬线书名），不用灰色插画。

## Tokens / Shell

docs/09 §3 Token 表（浅/深两套 CSS 变量）+ Open plane 壳（232px 侧栏 + 纸色画布 + 1px hairline）。

## Craft floor

- 每屏一个 h1（名词式），标题右侧至多一个主行动。
- 每块必有 empty/loading/error/zero 态；焦点环可见；状态不用颜色单独表达。
- 动效 = 反馈（hover/press/进度过渡 300ms），无入场编排；reduced-motion 全降级。
