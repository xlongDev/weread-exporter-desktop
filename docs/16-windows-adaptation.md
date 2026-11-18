# 16 - Windows 无边框玻璃壳适配评估

> 状态：**方案 A 代码面已落地（2026-11-19），Windows 真机验收未做**。已落地：`WindowControls` 右上矩形 caption 三钮（`features/close/WindowControls.tsx`，关闭复用 CloseGuard）、`app/platform.ts` UA 平台判定、AppShell 右上 chrome 条（拖拽+双击最大化）、壳圆角 `data-platform="windows"` → 8px（Win11 DWM 对齐）；macOS 布局零改动。浏览器模拟注入已验证布局与 hover；**待真机验收：缩放/阴影/WebView2 透明性能/DPI**。Win10 与 Win11 在 UA 上不可分辨（均 NT 10.0），直角实心降级待真机定。tauri.conf 分平台文件未做（当前配置两平台通用，无差异项）。

## 1. 现状回顾（macOS 已落地）

- `decorations:false` + `transparent:true` + `shadow:true`；`#root` 28px 圆角壳（contain:paint 裁剪浮层）。
- 自绘红绿灯（Sidebar.TrafficLights：close/minimize/toggleMaximize）+ `data-tauri-drag-region` 拖拽区；capabilities 授予 4 个窗口权限。
- 玻璃 = CSS backdrop-filter（WKWebView 原生支持），环境光晕为纯 CSS 渐变。

## 2. Windows 平台差异（关键点）

| 差异点 | macOS 现状 | Windows 情况 |
| --- | --- | --- |
| 系统圆角 | 无（靠自绘 28px） | **Win11 DWM 对所有顶层窗口自动 8px 圆角**（含无边框窗）；Win10 直角 |
| 透明窗口 | 原生支持 | 支持（WebView2 + DirectX）；Win10 上透明 + 模糊成本更高 |
| 系统模糊材质 | NSVisualEffectView（未用，走 CSS） | Tauri `windowEffects`: acrylic / mica / tabbed（Win11）；Win10 仅 AeroGlass（旧 API） |
| Snap 布局 | 无此概念 | Win11 悬停最大化按钮出 Snap 布局——**自绘按钮默认失去该能力**，需 Win32 钩子或放弃 |
| 窗口阴影 | `shadow:true` 跟随透明轮廓 | 无边框窗阴影由 DWM 提供，透明窗体下通常可用但需实测 |
| 红绿灯位置 | 左上 | Windows 惯例：**右上**，矩形 caption 按钮（─ □ ✕），非圆点 |
| 拖拽区 | `data-tauri-drag-region` | 同 API 跨平台 ✓；但 Windows 还期望双击标题栏最大化（Tauri 已内置）|
| 边缘缩放 | tao 自带 | 无边框窗默认保留边缘缩放 ✓，但需实测 WebView2 命中 |

## 3. 三个方案

### 方案 A：跨平台自绘 chrome（推荐）
红绿灯组件泛化为 `WindowControls`：macOS = 左上圆点三连；Windows = 右上矩形 caption 三钮（─ □ ✕，hover 高亮，✕ hover 红），布局随平台镜像。窗口配置按平台分支：Win11 开 `transparent` + CSS 圆角 8px（与 DWM 对齐）；Win10 退化为直角 + 实心壳。
- 优点：视觉一致（液态玻璃在两平台都成立）；拖拽/权限/CloseGuard 代码全复用。
- 成本：约 1-2 天（控件组件 + 平台分支 + Win10/11 双实测）。
- 风险：Snap 布局丢失（可接受：应用非多窗口生产力工具）；WebView2 透明 + backdrop-filter 的性能需在低配 Intel 核显实测。

### 方案 B：Windows 保留系统边框（`decorations:true`）
Windows 上退回原生标题栏，内容区仍走玻璃。
- 优点：零成本，Snap/缩放/阴影全原生。
- 缺点：Windows 用户看到的是"普通窗口 + 玻璃内容"，外壳观感与 macOS 不一致；28px 壳圆角与系统直角/8px 冲突需处理。
- 适用：如果想压缩工期先出 Windows 版。

### 方案 C：Webview2 + Mica/Acrylic 原生材质（Win11 only）
用 `windowEffects` 的 mica/acrylic 替代 CSS blur 做窗口底材质，玻璃模块保留 CSS blur。
- 优点：最"原生 Windows 11"的质感；系统级性能优化。
- 缺点：Win10 无 mica（需 fallback）；材质色与 CSS 光晕的叠加需调参；增加平台分支面。
- 适用：Windows 成为主战场后。

### 建议
**先 A 后 C**：方案 A 落地保证一致性，其中 `windowEffects` 作为 Win11 增强项渐进加入（feature-detect 版本）。实施前先做一个 spike：Tauri 官方 examples 跑一遍 transparent + frameless + WebView2，确认缩放/阴影/Snap 实际表现再动工。

## 4. 实施清单（方案 A，供未来开工）

1. `WindowControls` 组件（替代 TrafficLights）：平台分支布局与按钮样式；CloseGuard 不变。
2. `usePlatform()`（Tauri os plugin 或 `navigator.userAgent`）：控制 chrome 类型 / 壳圆角 / 是否开透明。
3. tauri.conf.windows 按 `tauri.macos.conf` / `tauri.windows.conf.json` 平台分文件（Tauri 支持分平台合并配置）。
4. Win11：DWM 圆角 8px 对齐 CSS（`border-radius: 8px`）；Win10：直角 + 实心 `--surface-solid`。
5. `prefers-reduced-transparency` 降级（已实现，跨平台生效）覆盖 Windows 低配。
6. 实测矩阵：Win10 + Win11 × 集显/独显 × 缩放 100%/150%——缩放、阴影、拖拽、Snap、多屏 DPI。
7. 打包侧：WebView2 Loader 常驻检查（现有 install-windows.ps1 已处理）。

## 5. 开放问题

- 是否接受 Windows 失去 Snap 布局？（建议：接受，v1 不做 Win32 钩子）
- 玻璃在 Windows 上的环境光晕配色是否需要单独调（Windows 桌面偏亮色壁纸）？（建议：先沿用，实测后定）
