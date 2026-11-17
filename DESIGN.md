# DESIGN.md

> 视觉世界：**液态玻璃 · 超大圆角模块化**（2026-11-18 用户钦定，替换 Achromatic Ledger 发牌方向）。Operate 模式。

## The move（不可丢）

环境光晕之上悬浮**三块玻璃模块**：侧栏轨道 / 画布纸 / 任务舱 pill，模块间隙露出光晕。
玻璃材质 = blur(28px) saturate(1.5) + 1px 高光边 + 内顶高光 + 柔影；一切表面半透明。
**超大圆角体系**：壳 28 / 模块 22 / 面板 20 / 控件全 pill / 封面 10。
色彩只给：唯一数据蓝 `--data`（进度/当前任务）与书封本身。

## Face

- 文字/界面：系统中文栈（PingFang SC / Microsoft YaHei），数字 `tabular-nums`。
- 第二字体（单一职责）：衬线 Songti SC / Noto Serif SC —— 只用于书名与产品名。

## Signature element（本产品独有）

封面墙 + 排版书脊空态（衬线竖排书名立在搁板上）+ 玻璃任务舱 pill。
空态用书脊占位，不用灰色插画。

## Tokens / Shell

- `#root` = **28px 超大圆角壳**（decorations:false + transparent + 自绘红绿灯/拖拽区，见 Sidebar）。
- `.ambient` = 暖纸 + 墨蓝光晕（.glass 的 backdrop 采样对象，token `--ambient` 两套主题）。
- `.glass` = 模块材质（blur + saturate + 高光边 + 柔影）；surface/well/border/control 全半透明（tokens.css）。
- 圆角 token：card 20 / control 12 / media 10；控件一律 rounded-full。

## Craft floor

- 每屏一个 h1（名词式）；每块必有 empty/loading/error/zero 态；状态不用颜色单独表达。
- 动效 = 反馈（hover/press/进度过渡 300ms），无入场编排；reduced-motion 全降级。
- 诚实数据：0 写 0，缺失写 —，无假进度——玻璃再花，数据不撒谎。
- 玻璃层次纪律：模块用 `.glass`（真 blur），模块内嵌卡只用半透明填充、**不再嵌套 backdrop-filter**。
