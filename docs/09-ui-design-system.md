# 09 - UI 设计系统

> 方向来源：taste-skill `draw.mjs --app` 正式发牌 —— **Achromatic Ledger**（种子 174849170），app-screens 23 屏实测规范 + impeccable Operate 模式。
> 本产品画面：任务型工具 + 封面墙。色彩纪律：chrome 无色，色彩只给数据（进度）与封面本身。

## 1. 已发牌方向的核心决定（The move）

- Chrome 不出现品牌色：主按钮近黑（`--accent #141414`），次按钮灰 pill（`--raised`）。
- **唯一数据色 `--chart-3: #1d5fbf`（蓝）**只给"主数据元素"= 导出进度条与当前任务态，占比 <1% 屏幕。
- 状态色仅用于状态徽章（positive/negative/warning 的 pill 对）。
- 无阴影（浮层除外）、无渐变、无玻璃、无图标圆片、无 KPI 卡片堆砌、无 zebra 表格。
- 表面分离 = 1px 线或一档灰阶；KPI 是文字不是瓷砖。

## 2. 本产品适配（记录在案的重绘理由）

| 适配 | 理由 |
| --- | --- |
| 地面 `--ground: #f4f3f1`（纸感石色）替代 #f8f8f8 | 阅读产品的"纸张世界"（style sheet 提供的 face 选项 A），饱和度 <15% 不触 cream 禁区 |
| 文字字体 = 系统 UI 中文栈（PingFang SC / Microsoft YaHei），数字 `tabular-nums` | 产品为中文优先；Geist 不含 CJK。Latin/数字栈保留 Geist fallback 语义（system-ui 即可，不额外打包字体） |
| 第二字体 = 衬线（Songti SC / Noto Serif SC），**只**用于书名与顶部产品名 | "second face with one job"：书名是本产品的核心对象，衬线=印刷书的世界 |
| 数据蓝 #1d5fbf → 进度条 / 正在执行任务标识 | 主数据元素 = 导出进度 |

## 3. Token（tokens.css）

```css
:root {
  --ground: #f4f3f1;  --surface: #ffffff;  --raised: #e9e8e5;
  --border: #e3e1dd;  --rule: #eceae6;   --control: #d4d2cd;
  --text: #191817;    --muted: #6f6c67;  --faint: #9b978f;
  --accent: #141414;              /* 主按钮/主行动 */
  --data: #1d5fbf;               /* 唯一数据色：进度 */
  --positive: #2e7d32;  --negative: #c4242a;  --warning: #92400e;
  --pill-positive-bg: #dcfae5; --pill-positive-ink: #04250e;
  --pill-negative-bg: #ffedea; --pill-negative-ink: #831c1e;
  --pill-warning-bg:  #fffbeb; --pill-warning-ink:  #92400e;
  --pill-neutral-bg:  #e9e8e5; --pill-neutral-ink:  #3d3b38;
  --radius-card: 8px; --radius-control: 6px; --radius-media: 3px; /* 封面用小圆角 */
  --row-height: 44px; --sidebar-w: 232px; --gap: 12px; --pad: 24px;
  --control-h: 36px;
  --fs-title: 24px; --fs-section: 16px; --fs-kpi: 30px; --fs-body: 14px; --fs-small: 12px;
}
[data-theme="dark"] {
  --ground: #131312; --surface: #1c1c1b; --raised: #262625;
  --border: #2b2b29; --rule: #242423;   --control: #3a3a38;
  --text: #f0efed;   --muted: #a3a09a;  --faint: #7a776f;
  --accent: #f0efed;  --accent-ink: #141414;   /* 主按钮反白 */
  --data: #5b8fd9;
  --pill-positive-bg: #17301f; --pill-positive-ink: #9fdcb4;
  --pill-negative-bg: #38191b; --pill-negative-ink: #f2b8ba;
  --pill-warning-bg:  #33260d; --pill-warning-ink:  #e5c26a;
  --pill-neutral-bg:  #262625; --pill-neutral-ink:  #c9c6c0;
}
```

## 4. 布局骨架

- **Shell：Open plane**。左侧栏 232px 与画布同在纸色地面上，1px hairline 分隔；无顶栏；画布 fluid，gutter 24px。
- 侧栏：顶部产品名（衬线）+ 登录态小行；主导航 34px pitch / 32px 行高 / 16px outline 图标；活动项 = 灰 pill（#e9e8e5，radius 8）；"任务中心"在有执行中任务时带数量徽章（仅队列型计数）。
- 每屏一个 h1（24px/700，名词式："总览""任务中心""书库""设置"），标题右端放该屏唯一主行动。
- 深浅色：CSS 变量切换 + `data-theme`，跟随系统（Tauri theme API）+ 手动覆盖。

## 5. 组件清单（components/）

Button（primary 近黑 / secondary 灰 pill / ghost / destructive 文本色）、StatusPill（5 任务态 + 3 登录态）、ProgressTrack（数据蓝，4px，条上不叠字，数值在行内文字）、BookCover（3px 圆角、缺失封面=书名首字衬线占位）、BookCard、TaskRow、SectionHeader、Input/Select/Switch（40px 表单控件，开关 on 色 = 近黑）、Dialog、Drawer（任务详情）、Toast、EmptyState（衬线书名占位插图式空态）、Skeleton、Tabs（下划线式）、KpiStrip（1px 分隔的纯文字条）。

## 6. 状态设计（每块必有）

empty（书库空/任务空/未登录三种，文案给下一步动作）· loading（Skeleton，不转圈）· zero（0 就写 0，缺失写 "—"）· error（内联 userMessage + "查看详情"折叠技术信息）。

## 7. 动效（Motion，克制）

页面切换 120-160ms 淡入；行/卡片 hover 仅背景一档灰阶；进度条宽度过渡 300ms ease-out；完成时进度条一次蓝→正向绿脉冲；Dialog/Drawer 160ms scale+fade；**遵循 prefers-reduced-motion 全部降级为直接切换**。不做入场编排动画（app 屏 house rule）。

## 8. 无障碍与响应式

- 焦点环 2px 数据蓝 outline（键盘可见）；图标按钮必带 aria-label；状态不用颜色单独表达（徽章带文字）。
- 1280×800 起步：侧栏可折叠为 56px 图标栏；1440×900 与 1920×1080 下画布 24px gutter 流式铺满；弹窗最大 640px 不溢出。
