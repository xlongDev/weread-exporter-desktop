# 09 - UI 设计系统

> 方向：**液态玻璃 · 超大圆角模块化**（2026-11-18 用户钦定，替换 2026-11-06 的 Achromatic Ledger 发牌）。
> 世界级决定见 [DESIGN.md](../DESIGN.md)；本文件是工程规范。色彩纪律不变：chrome 无品牌色，色彩只给数据（进度蓝）与封面本身。

## 1. 核心决定（The move）

- **模块化**：环境光晕（`--ambient`）之上悬浮三块玻璃模块——侧栏轨道 / 画布纸 / 任务舱 pill，模块间隙 12px 露出光晕。
- **玻璃材质 `.glass`** = blur(28px) saturate(1.5) + 1px 高光边（`--glass-border`）+ 内顶高光 + 柔影（`--glass-shadow`）。
- **表面全半透明**：surface / well / raised / border / rule / control 均为 rgba，落在玻璃上自然透光。
- **超大圆角体系**：壳 28 / 模块 22 / 面板 20 / 控件全 pill / 封面 10。
- **嵌套纪律**：只有三个模块用真 backdrop-filter；模块内嵌卡只用半透明填充，不再嵌套 blur（防糊防卡）。
- **色彩纪律**：唯一数据蓝 `--data` 只给进度/当前任务；状态色只用于状态 pill；KPI 是文字不是瓷砖。

## 2. 换世界记录（Achromatic Ledger → 液态玻璃，2026-11-18）

| 变更 | 理由 |
| --- | --- |
| 纸面 + 1px hairline → 玻璃模块 + 光晕间隙 | 用户钦定液态玻璃方向；模块化让结构可折叠、可呼吸 |
| 表面不透明 → 全半透明 | 玻璃世界的透光层级；元素随光晕呼吸 |
| 圆角 8/6/3 → 20/12/10、控件方角 → pill | 超大圆角体系 |
| 无阴影 → 模块柔影 + 内顶高光 | 玻璃需要深度暗示；仅模块层有影，内嵌卡仍无影 |
| 保留 | 数据蓝纪律 / 衬线书名单一职责 / 诚实数据 / 状态 pill 对 / KPI 是文字 |

> Achromatic Ledger 的"无玻璃/无阴影"规则由用户 brief 显式解除（impeccable：brief wins）。

## 3. Token（tokens.css · 两主题）

```css
:root {  /* 浅色 */
  --ambient: 三个径向光晕 + #f4f2ee;          /* .glass 的 backdrop 采样对象 */
  --surface: rgba(255,255,255,0.62);  --well: rgba(255,255,255,0.5);
  --raised: rgba(20,18,14,0.07);      --border: rgba(20,18,14,0.12);
  --rule: rgba(20,18,14,0.07);        --control: rgba(20,18,14,0.12);
  --glass-bg: rgba(255,255,255,0.5);  --glass-border: rgba(255,255,255,0.65);
  --glass-shadow: 0 8px 40px rgba(31,26,18,0.12), inset 0 1px 0 rgba(255,255,255,0.7);
  --text: #1b1a18; --muted: #6f6c67; --faint: #9b978f;
  --accent: #161513; --accent-ink: #f7f6f4;   /* 主按钮近黑 */
  --data: #1d5fbf;                            /* 唯一数据色：进度 */
  --radius-card: 20px; --radius-control: 12px; --radius-media: 10px;
}
[data-theme="dark"] {
  --ambient: 三个径向光晕 + #121110;
  --surface: rgba(255,255,255,0.08);  --well: rgba(255,255,255,0.05);
  --raised: rgba(255,255,255,0.12);   --border: rgba(255,255,255,0.12);
  --rule: rgba(255,255,255,0.07);     --control: rgba(255,255,255,0.16);
  --glass-bg: rgba(26,26,25,0.42);    --glass-border: rgba(255,255,255,0.12);
  --glass-shadow: 0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08);
  --text: #f0efed; --muted: #a3a09a; --faint: #8b8880;
  --accent: #f0efed; --accent-ink: #141414;   /* 主按钮反白 */
  --data: #5b8fd9;
}
```

状态 pill 对（positive/negative/warning/neutral）与语义色沿用旧表；`--ground` 已退役（被 `--ambient` 取代）。

## 4. 布局骨架（AppShell）

- **无边框透明窗口**（tauri.conf：decorations:false + transparent + shadow）：`#root` = 28px 壳（overflow:hidden + contain:paint，fixed 浮层同被圆角裁剪）。
- **三模块**：侧栏玻璃轨道（232px，可折叠至 72px 图标轨）· 画布玻璃纸（内部滚动，内容 max-w 1080px）· 任务舱玻璃 pill（h-11）。模块间隙 12px。
- **自绘窗口 chrome**：红绿灯（关闭走 CloseGuard 拦截）+ `data-tauri-drag-region` 拖拽区；capabilities 已授予 start-dragging/close/minimize/toggle-maximize。
- **可折叠侧栏**：⌘B 或底部开关切换；宽度 300ms ease-out + 标签 200ms 淡出；折叠后图标居中 + tooltip；状态存 localStorage。
- 每屏一个 h1（24px/700，名词式）；深浅色 `data-theme` + 跟随系统（Tauri theme API）+ 三档主题切换器（滑块 320ms 弹性滑动）。

## 5. 组件清单（components/ 与页内组件）

Button（pill；primary 近黑/反白，md 36px / lg 44px）· StatusPill（5 任务态 + 3 登录态）· ProgressTrack（数据蓝 4px，数值在行内文字）· BookCover（10px 圆角，fill 模式供封面墙；缺失封面 = 竖排双字衬线书脊占位）· EmptyState（书脊搁板插图空态，centered 居中变体）· Dialog（玻璃 24px）· Drawer（玻璃，左缘 24px）· TaskDock（玻璃 pill 折叠栏 + 弹出面板 + TaskList 按书分组）· Sidebar（可折叠玻璃轨道 + TrafficLights + Monogram）· ThemeSwitcher（三档分段滑块）· RowAction（24px 圆形图标钮）。已删除：Select、KpiStrip、SectionHeader。

## 6. 状态设计（每块必有 + 诚实数据）

empty（书库空=居中书脊 + 主行动；任务 dock 零任务不渲染）· loading（Skeleton）· zero（0 就写 0，缺失写 "—"）· error（内联 userMessage + 重试）。
诚实数据细则：dock loadError 显示"任务记录读取失败"而非假 0；首页最近导出读取失败整块隐藏；`current_chapter` 纯数字（如 "0"）不渲染；无总章数不做假 ETA。

## 7. 动效（Motion）

- 反馈类：hover/press 一档；进度宽度 300ms ease-out；Dialog/Drawer 160ms scale+fade；主题切换器滑块 320ms `cubic-bezier(0.32,0.72,0,1)`；侧栏折叠 = width 300ms ease-out + 标签 200ms 淡出。
- **不做入场编排动画**（app 屏 house rule）。
- `prefers-reduced-motion` 全部降级为直接切换。
- `prefers-reduced-transparency: reduce` → `.glass` 退化为实心表面（`--surface-solid`），backdrop-filter 全部关闭——低端 GPU / 辅助功能的性能与可读性兜底。

## 8. 无障碍与响应式 · 性能

- 焦点环 2px 数据蓝 outline；图标按钮必带 aria-label；折叠后导航图标带 tooltip；状态不用颜色单独表达。
- 窗口默认 **1080×720**（min 960×640，启动居中）；折叠侧栏时画布自动扩展；内容 max-w 1080px；弹窗最大 440px、任务面板 640px。
- **性能**：backdrop-filter 仅 3 个静态层（模块本体），滚动发生在模块内层 div——blur 层不随滚动重绘；`prefers-reduced-transparency` 实心降级覆盖低端 GPU。
- **Windows**：无边框壳需另行适配，评估见 [docs/16-windows-adaptation.md](16-windows-adaptation.md)。
