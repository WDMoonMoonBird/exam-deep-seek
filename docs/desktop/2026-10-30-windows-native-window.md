# Windows 端原生窗口观感（Win10 / Win11）

日期：2026-10-30 ｜ 分支：`feat/desktop-shell` ｜ 环境：Windows 11 26H2（10.0.26300）、Electron 44.7.0、200% 缩放

目标：让 Windows 端对齐 macOS v0.2.0 的「去浏览器味」——无系统标题栏、侧栏毛玻璃、顶部是 Windows 自己的三个按钮，同时支持 Windows 10 与 11。

---

## 1. 结论先说

| 能力 | Windows 11 22H2+（build ≥ 22621） | Windows 10（build < 22621） |
|---|---|---|
| 去掉系统标题栏 | `titleBarStyle: 'hidden'` | 同左 |
| 三个窗口按钮 | `titleBarOverlay`（WCO）**原生按钮**，含 Win11 Snap Layouts | 同左（Win10 样式由系统绘制） |
| 毛玻璃 | `backgroundMaterial: 'acrylic'`（DWM 系统亚克力，真模糊） | **没有公开系统 API → 不透明回退** |
| 侧栏 | 半透明染色 + 系统材质透出 | 实心 `--sider-bg`（不伪造玻璃） |
| 标题栏拖拽 | 顶栏 + 侧栏顶部 40px 条 | 同左 |

- **Win11 的毛玻璃是真系统材质**，不是 CSS 模拟：窗口背景透明 + `backgroundMaterial: 'acrylic'`，DWM 在窗口后面画亚克力，侧栏半透明处直接透出来（对齐 macOS 的 `vibrancy: 'sidebar'`）。
- **Win10 没有可用的原生毛玻璃**：`DWM_SYSTEMBACKDROP_TYPE` 的最低客户端是 Windows 11 build 22621（[MS 文档](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ne-dwmapi-dwm_systembackdrop_type)）；Electron 的 `backgroundMaterial` / `setBackgroundMaterial` 也只支持 Win11 22H2+，Win10 明确 not supported（[electron#48031](https://github.com/electron/electron/issues/48031)）。`SetWindowCompositionAttribute` 是未公开 API、需要透明无边框窗口，且有拖动卡顿/残影/偶发不渲染的问题；为它引入 FFI/原生依赖（崩溃面 + 打包风险）不划算。**因此 Win10 走不透明回退**，保留「无标题栏 + 原生按钮 + 拖拽」，只是侧栏不做玻璃。

## 2. 实现分层

```
platform-chrome.mjs   纯决策：平台 / build → 窗口参数 + preload 标记（可 node --test）
        │
native-chrome.mjs     装配：BrowserWindow 参数、vibrancy、WCO 按钮主题同步
        │
index.mjs             组合根：把 systemVersion 传下去、注册 IPC
        │
preload/index.cjs     渲染层标记：data-platform / data-windows-backdrop / data-fullscreen
        │
desktop-chrome.css    透明让位、侧栏染色、拖拽区、右上角 138px 按钮留白
```

### 2.1 窗口参数（platform-chrome.mjs）

```js
// Win11 22H2+
{ titleBarStyle: 'hidden', titleBarOverlay: { color: 'rgba(0,0,0,0)', symbolColor: '…', height: 40 },
  backgroundMaterial: 'acrylic' }          // 注意：不设 backgroundColor
// Win10
{ titleBarStyle: 'hidden', titleBarOverlay: { … }, backgroundColor: '#ffffff' }
```

关键点：

- **不要设不透明 `backgroundColor`**（包括默认 `#FFF`）：会把 DWM 材质整个盖掉，表现为「一块平灰」。
- 覆盖层 `color` 必须透明：按钮浮在玻璃上，不额外盖一块实色。透明覆盖层在 Electron 41+ 修复（[PR #51017](https://github.com/electron/electron/pull/51017)），本项目 44 可用。
- `height: 40` 与顶栏 56px 的高度搭配：按钮在 y=0..40，顶栏内容垂直居中在 28，视觉上可接受；同时 CSS 右侧留 138px（3×46）给按钮。

### 2.2 按钮主题同步（preload → 主进程 → WCO）

页面主题由 client 的 `useTheme` 写到 `<html data-theme>`。preload 用 `MutationObserver` 观察该属性，把 `'light' | 'dark'` 发给主进程；主进程 `win.setTitleBarOverlay({ color: 'rgba(0,0,0,0)', symbolColor })` 重设按钮符号色。

**踩过的坑（已修）**：preload 执行时 `<html>` 还不存在，最初的实现 `if (!root) return` 直接退出，主题事件永远发不出去，结果深色页面顶栏上是一组黑按钮（几乎看不见）。现在等 `DOMContentLoaded` 后再启动观察并补发一次初始值。

preload 只暴露只读平台信息，不把 `ipcRenderer` 交给页面；主题值在主进程二次校验（只接受 `'light' | 'dark'`），且只认主窗口自己的 `webContents`。

### 2.3 渲染层标记（preload）

| 属性 | 值 | 用途 |
|---|---|---|
| `data-platform` | `win32` / `darwin` | 平台规则总开关（Web 端没有该属性，CSS 零命中） |
| `data-windows-backdrop` | `acrylic` / `none` | 只有 `acrylic` 才让出透明；Win10 不透明回退 |
| `data-fullscreen` | 存在 / 不存在 | 全屏时收掉顶部留白与拖拽安全带 |

两个属性都在 preload 里同步写入（`<html>` 尚未解析时挂 `DOMContentLoaded`），窗口第一帧就是正确状态，无闪烁。

### 2.4 布局与拖拽（desktop-chrome.css §8）

- **右上角留白**：`--desktop-caption-reserve: 138px`，顶栏 `padding-right: calc(var(--space-6) + 138px)`；窄屏（<992px）用 12px 内边距，留白不变。
- **拖拽**：`.topbar` 整条 `-webkit-app-region: drag`，内部按钮/链接/下拉/user-area 显式 `no-drag`；侧栏顶部再加 40px 透明拖拽条（不占布局），对齐 Windows「抓左上角拖窗口」的习惯。
- **玻璃染色**：侧栏 `color-mix(in srgb, var(--sider-bg) 58%, transparent)`；整条祖先链（`.app-shell` / `.layout` / `.ant-layout`）透明，否则 antd 的 `#f5f5f5` 会把材质盖住（与 macOS 同一个坑）。内容列保持不透明 + 0.5px 分栏线。
- **非壳页面**（登录/改密）：整页可拖 + 补不透明画布底；否则透明窗口会把桌面透到表单底下。
- **无障碍**：`prefers-reduced-transparency: reduce` 与 `forced-colors: active` 下侧栏退回实心；这也兜住 Win11「透明效果关闭 / 节能模式」时 DWM 不画材质的情况。

## 3. 已知限制（写清楚，不藏）

1. **Win10 没有毛玻璃**：设计上的能力差异，不是 bug。侧栏为实心深色（见 §1）。
2. **Win11 材质会受系统状态影响**：节能模式、关闭「透明效果」、失焦时 DWM 可能把亚克力降为实色；页面已做 reduced-transparency 回退，观感不会「脏」。
3. **150% / 175% 缩放下的 WCO 高度取整**：Electron 已知问题（[#52208](https://github.com/electron/electron/issues/52208)，修复 PR [#52242](https://github.com/electron/electron/pull/52242) 尚未合并）。本项目在 200% 缩放下实测正常；125%/150% 需要真机复验。
4. **最大化 + 亚克力**：旧版 Electron 有过「最大化变黑/丢圆角」的问题（[#43196](https://github.com/electron/electron/issues/43196)）；本项目在 Electron 44.7 + Win11 26H2 上实测最大化后材质与圆角都保留。
5. **DevTools 打开时透明失效**：Electron 的透明窗口限制，开发态属预期。
6. **取证坑（非产品问题）**：在 200% 缩放下用 DPI-unaware 的 PowerShell `CopyFromScreen` 只能截到屏幕左上 1710×1074，最大化窗口右侧的按钮会「看起来消失」。验证时必须先 `SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2)` 再截图——本轮的 WCO 结论就是这样确认的。

## 4. 验证

环境：Windows 11 26H2（10.0.26300）、Electron 44.7.0、200% 缩放、`--no-sandbox`（本机测试壳）。

用仓库源码 + 一份等价 DOM/令牌的 mock 页面跑真实 Electron 窗口（`desktop/src/main/*` 与 `preload/index.cjs` 均为生产代码），验证：

| 场景 | 结果 |
|---|---|
| Win11 深色 / 浅色 | 侧栏透出 DWM 亚克力（模糊可见）；WCO 三个原生按钮在右上角，符号色随 `data-theme` 切换 |
| Win11 最大化 | 亚克力保留、圆角保留、WCO 按钮仍可见（还原图标正确） |
| Win10（注入 `10.0.19045`） | 无材质 → 侧栏实心；WCO 按钮仍在；无白底透出 |
| 全屏 / reduced-transparency | 按钮与留白按 `data-fullscreen` 收起；材质关闭时侧栏退回实心 |
| 单测 | `desktop/test/window-chrome-policy.test.mjs` 10 项全过（版本门禁 / 窗口参数 / 标记参数 / 参数白名单） |

截图证据（DPI-aware，200% 缩放下仍取到完整 3420×2148 屏幕）：

- `reports/desktop/windows-native/win11-dark.png`（Win11 深色，侧栏玻璃 + 白色 WCO 按钮）
- `reports/desktop/windows-native/win11-light.png`（Win11 浅色，深色按钮）
- `reports/desktop/windows-native/win11-max.png`（最大化：材质/圆角/WCO 按钮都在）
- `reports/desktop/windows-native/win10-fallback-dark.png`（Win10 注入：侧栏实心回退）

真实前端实跑（`client/dist` 构建产物 + 教师布局，Windows 11 26H2 + Electron 44.10）：

- `reports/desktop/windows-native/run-real-teacher-overlap.png`（窗口压在壁纸上：侧栏左缘可见壁纸模糊，右上角是 WCO 原生按钮）
- `reports/desktop/windows-native/run-real-teacher.png`（同一次运行，窗口居中）

> 实跑说明：本机没有生产账号，教师会话用 localStorage + 本地 mock API（`/teacher/classes` 等）注入，因此列表数据是演示数据；窗口、亚克力、WCO 按钮、布局与主题都是真实代码。

**待办**：Windows 10 真机（19045）复验——本机只有 Win11，Win10 分支是通过 `DESKTOP_TEST_VERSION=10.0.19045` 注入版本号验证的 CSS/参数路径，真实 DWM 行为需在 Win10 机器上跑一遍。

## 5. 变更清单

| 文件 | 变化 |
|---|---|
| `desktop/src/main/platform-chrome.mjs` | 新增：按平台/build 的纯决策（窗口参数、WCO 参数、preload 标记、亚克力门禁） |
| `desktop/src/main/native-chrome.mjs` | 装配 Windows WCO/亚克力；全屏事件两个平台都推；WCO 按钮主题同步 |
| `desktop/src/main/index.mjs` | 传 `systemVersion`；`additionalArguments` 注入；启动日志记录窗口外观 |
| `desktop/src/main/security-policy.mjs` | `secureWebPreferences` 支持 `additionalArguments`（仅 `--desktop-` 前缀） |
| `desktop/src/preload/index.cjs` | 写 `data-windows-backdrop`；主题变化上报（DOMContentLoaded 后启动）；Windows 也同步全屏 |
| `client/src/styles/desktop-chrome.css` | Windows 段：透明链、侧栏染色 58%、顶栏留白与拖拽、非壳页面、无障碍回退 |
| `desktop/test/window-chrome-policy.test.mjs` | 新增 10 个纯决策测试 |
| `desktop/README.md` | Windows 平台能力与回退说明 |

## 6. 参考

- Electron BrowserWindow / BaseWindow options（`backgroundMaterial`、`titleBarOverlay`）：https://www.electronjs.org/docs/latest/api/structures/base-window-options
- Electron 自定义标题栏教程（WCO / `titlebar-area-*`）：https://www.electronjs.org/docs/latest/tutorial/custom-title-bar
- DWM `DWM_SYSTEMBACKDROP_TYPE`（最低 Win11 22621）：https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ne-dwmapi-dwm_systembackdrop_type
- `backgroundMaterial` 与 Win10 限制讨论：https://github.com/electron/electron/issues/48031
- 透明覆盖层修复：https://github.com/electron/electron/pull/51017
