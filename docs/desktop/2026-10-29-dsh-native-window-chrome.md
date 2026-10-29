# DSH 桌面端「原生窗口质感」实现拆解（源码级）

> 调研对象：DeepSeek Harness Desktop（Electron 壳）。GitHub 仓库在当前网络下不可达
> （`git ls-remote https://github.com/deepseek-ai/deepseek-harness.git` 连接超时），因此改为直接读取
> 本机已安装的发行包 `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`，
> package `deepseek-ai/dsh-desktop` v0.2.1-rc.3（`dshBuildCommit: be72761e…`）——与仓库源码同源。
>
> 目的：回答「Mac 侧边栏毛玻璃 + 双端非默认顶部边框」是怎么做出来的，并给出我们
> `desktop/`（feat/desktop-shell）的落地改法。

---

## 0. 结论速览

| 能力 | macOS 做法 | Windows 做法 |
|---|---|---|
| 去掉系统标题栏 | `titleBarStyle: 'hiddenInset'`（**不是** `frame:false`） | `titleBarStyle: 'hidden'` + `titleBarOverlay`（WCO） |
| 保留系统按钮 | 保留原生红绿灯，用 `trafficLightPosition` 定位到 `(16,18)` | 保留原生最小化/最大化/关闭，由 WCO 画在网页上 |
| 毛玻璃 | `vibrancy: 'sidebar'` + `visualEffectState: 'active'` + `backgroundColor: '#00000000'` | 无系统级 vibrancy；用 `backgroundMaterial: 'acrylic'`（仅欢迎页）或纯色 |
| 顶部「边框」 | 窗口内容整体透明，48px 以上留出红绿灯安全带 | 网页自绘 40px 标题栏：底色 + 圆角内容区 + 原生按钮浮在上面 |
| 渲染层识别 | preload 写 `<html data-platform="darwin">` | preload 写 `<html data-windows-titlebar>` + `--dsh-windows-titlebar-height:40px` |
| 拖拽 | `[data-window-drag]{-webkit-app-region:drag}`，可交互元素统一 `no-drag` | 顶部 `:before` 伪元素整条 `-webkit-app-region:drag` |
| 主题联动 | preload 把 `data-ds-theme-source` 转发 `nativeTheme.themeSource` | 渲染层 canvas 量出侧边栏实际色 → IPC → `setTitleBarOverlay()` |

一句话：**Mac 靠「窗口真透明 + 系统 vibrancy 透出来」，Windows 靠「网页自绘标题栏 + Window Controls Overlay」**。
两个平台走的是两条完全不同的路，不是一个 `-webkit-app-region` 通吃。

---

## 1. 三层结构（谁负责什么）

源码分布在三处，职责严格分离：

1. **主进程** `lib/main.js`（打包后 `app.asar/lib/main.js`）
   - `createWindow()`：按 `process.platform` 拼 BrowserWindow 参数（L11935–11969）
   - macOS 最小化/隐藏时切换 vibrancy（L11982–11997）
   - Windows `setTitleBarOverlay` 的 IPC 接收与色值校验（L12869–12878）
2. **preload** `lib/preload-app.cjs`
   - `markDocumentPlatform()`：`html.dataset.platform = process.platform`
   - `syncWindowsAppearance()`：Windows 专属，打 `data-windows-titlebar` + 量色上报
   - `syncWindowFullscreen()`：全屏时打 `html[data-fullscreen]`
   - `syncNativeTheme()`：跟随应用主题切 `nativeTheme.themeSource`
3. **渲染层 CSS**（客户端插件内联 CSS，运行时注入 `<style data-plugin-css>`）
   - `dsh-client-ui-layout` 的 `AppFrame.module.css`：窗口主框架
   - `dsh-client-ui-sidebar` 的 `SidebarRoot.module.css`：侧边栏
   - `dsh-web-frontend` 的全局 CSS：拖拽白名单

---

## 2. macOS：真透明窗口 + 系统 vibrancy

### 2.1 主进程窗口参数（`lib/main.js:11950`）

```js
...process.platform === "darwin" ? {
  titleBarStyle: "hiddenInset",
  trafficLightPosition: { x: 16, y: 18 },
  vibrancy: "sidebar",          // 系统级毛玻璃材质，跟随系统亮/暗
  visualEffectState: "active",  // 失焦时材质不变灰
  backgroundColor: "#00000000"  // 关键：窗口底色真透明，否则 vibrancy 看不见
} : {},
```

### 2.2 最小化/隐藏时换成不透明兜底（L11982）

vibrancy 在最小化截图、隐藏等场景会掉帧/花屏，因此主动换回不透明色：

```js
if (process.platform === "darwin") {
  const applyBackdrop = () => {
    if (window.isDestroyed()) return;
    if (window.isMinimized() || !window.isVisible()) {
      window.setVibrancy(null);
      window.setBackgroundColor(chromeFallbackFill());   // 暗 #1b1b1c / 亮 #f9fafb
    } else {
      window.setVibrancy("sidebar");
      window.setBackgroundColor("#00000000");
    }
  };
  window.on("minimize", applyBackdrop);
  window.on("hide", applyBackdrop);
  window.on("restore", applyBackdrop);
  window.on("show", applyBackdrop);
}
```

### 2.3 渲染层：让出透明（`AppFrame.module.css`）

```css
/* 框架整体底色清空，露出窗口后面的系统材质 */
[data-platform=darwin] .frame { background: none }

/* 红绿灯安全带 48px；全屏时让位 */
html[data-platform=darwin] { --dsh-frame-top-clearance: 48px }
html[data-platform=darwin],
html[data-windows-titlebar] { --dsh-frame-overlay-top: calc(var(--dsh-frame-top-clearance) + 20px) }
html[data-platform=darwin][data-fullscreen],
html[data-windows-titlebar][data-fullscreen] { --dsh-frame-overlay-top: 20px; --dsh-frame-chrome-top: 0px }

/* 中间列不透明并补 0.5px 分隔线——透明窗格里必须有「实心」阅读区 */
[data-platform=darwin] .centerCol {
  background: var(--dsw-alias-bg-base);
  border-left: .5px solid var(--dsw-alias-border-l3);
}
```

### 2.4 侧边栏「毛玻璃」其实是一层半透明染色（关键）

vibrancy 只负责「背后的模糊」，前面的颜色要自己给。DSH 用 `color-mix()` 把侧边栏底色压到 40% 不透明度，
再叠一层淡淡的蓝紫渐变（模拟 macOS 侧边栏的光感）：

```css
/* 浅色 */
[data-platform=darwin] .sidebarCol {
  background:
    linear-gradient(to bottom, #7a9bf01a, #7a9bf000 35%, #8f89b800 68%, #8f89b817),
    color-mix(in srgb, color-mix(in srgb, var(--dsw-specific-sidebar-fill) 97%, #7a9bf0) 40%, transparent);
  border-right: none;
}

/* 深色：染色压到 50%，渐变更淡 */
[data-platform=darwin] [data-ds-dark-theme] .sidebarCol {
  background:
    linear-gradient(to bottom, #7a9bf014, #7a9bf000 35%, #8f89b800 68%, #8f89b812),
    color-mix(in srgb, var(--dsw-specific-sidebar-fill) 50%, transparent);
}

/* 无障碍：系统开了「降低透明度」就退回接近纯色 */
@media (prefers-reduced-transparency: reduce) {
  [data-platform=darwin] .sidebarCol,
  [data-platform=darwin] [data-ds-dark-theme] .sidebarCol {
    background: color-mix(in srgb, var(--dsw-specific-sidebar-fill) 90%, transparent);
  }
}
```

侧边栏自身背景也要清空，否则染色被盖住：

```css
/* SidebarRoot.module.css */
[data-platform=darwin] .root { background: none }
/* 半透明底上的按钮要自己给半透明白 */
[data-platform=darwin] .newSession { background: #ffffff8c }
[data-platform=darwin] .newSession:hover { background: #ffffff4d }
[data-platform=darwin] [data-ds-dark-theme] .newSession { background: #ffffff26 }
```

### 2.5 拖拽：不是给整个头图设 drag，而是白名单

全局 CSS 只对 `[data-window-drag]` 开 drag，并把所有可交互元素强制 no-drag：

```css
html[data-platform=darwin], html[data-platform=darwin] body { background: transparent }
html[data-platform=darwin] body { isolation: isolate }
html[data-platform=darwin] [data-window-drag] { -webkit-app-region: drag }
html[data-platform=darwin] [data-window-drag-recall] { -webkit-app-region: no-drag }
html[data-platform=darwin] body > :not(#root) { -webkit-app-region: no-drag }
html[data-platform=darwin] :is(button, a, input, select, textarea, summary,
  [contenteditable=true], [tabindex], [role=dialog], [role=button], [role=tab], …) {
  -webkit-app-region: no-drag;
}
```

组件里按需打标记（React 示例）：

```jsx
// 会话头部整条可拖
<header className={clsx(styles.header, …)} data-window-drag>
// 侧边栏红绿灯安全带 + logo 行可拖
<div className={styles.topStrip} data-window-drag>{toggle}</div>
<div className={styles.logoRow} data-window-drag>…</div>
```

> `-webkit-app-region` 会「吃掉」子元素的鼠标事件，所以按钮必须显式 `no-drag`；
> DSH 用一条全局 `:is(...)` 兜底，避免每个组件重复写。

### 2.6 红绿灯左边的「座位」

侧边栏折叠时主内容区会往左延伸到红绿灯下方，此时把工具栏按钮挪到 `left:88px` 的空位：

```css
.leadingSeat {
  z-index: 15; -webkit-app-region: no-drag;
  position: absolute; top: 11px; left: 88px;   /* 红绿灯右侧 */
  display: flex; align-items: center;
}
[data-platform=darwin][data-fullscreen] .leadingSeat { left: 12px }
[data-platform=darwin] .frame[data-sidebar-collapsed] { --dsh-frame-leading-clearance: 160px }
```

---

## 3. Windows：WCO（Window Controls Overlay）+ 网页自绘标题栏

### 3.1 主进程窗口参数（`lib/main.js:11942`）

```js
...process.platform === "win32" && primary ? {
  titleBarStyle: "hidden",
  titleBarOverlay: {
    height: 40,
    color: chromeFallbackFill(),                                // #f9fafb / #1b1b1c
    symbolColor: nativeTheme.shouldUseDarkColors ? "#f9fafb" : "#0f1115"
  }
} : {},
```

> Windows 上 `titleBarStyle: 'hidden'` 不会移除系统按钮，只是把整条 caption 交给网页，
> 三个按钮由 Chromium 以 WCO 形式**画在网页最上层**（右侧），所以网页必须给它们留位置、
> 且颜色要跟网页底色一致，否则就是「两块色」。

### 3.2 preload 打标记 + 量色（`preload-windows.js`）

```js
function syncWindowsAppearance() {
  if (process.platform !== "win32") return;
  const mark = () => {
    const root = document.documentElement;
    root.dataset.windowsTitlebar = "";                       // → html[data-windows-titlebar]
    root.style.setProperty("--dsh-windows-titlebar-height", "40px");
  };
  // 再挂一个隐形 probe，读 getComputedStyle(--dsw-specific-sidebar-fill)，
  // 用 canvas 归一化成 rgba(...)，随主题/语言变化 send 给主进程
}
```

主进程接收并重设覆盖层颜色（L12869）：

```js
ipcMain.on(DESKTOP_IPC.windowsAppearance, (event, language, color, symbolColor) => {
  if (mainWindow === void 0 || event.sender !== mainWindow.webContents) return;
  if (!event.senderFrame.url.startsWith("dsh-app://app/")) return;   // 只信自己的页面
  if (validColor(color) && validColor(symbolColor)) {
    mainWindow.setTitleBarOverlay({ color, symbolColor });
  }
});
```

这就是「标题栏颜色跟着主题实时变」的秘密：不是 CSS，是 IPC + 原生 API 重设。

### 3.3 渲染层：自绘 40px 标题栏（`AppFrame.module.css`）

```css
[data-windows-titlebar] .frame {
  --dsh-windows-content-radius: 16px;
  box-sizing: border-box;
  padding-top: var(--dsh-windows-titlebar-height);   /* 给顶部让出 40px */
  background: var(--dsw-specific-sidebar-fill);      /* 整窗底色 = 侧边栏色 */
}

/* 顶部整条 = 拖拽区（伪元素，不占布局） */
[data-windows-titlebar] .frame::before {
  content: "";
  position: absolute; inset: 0 0 auto;
  height: var(--dsh-windows-titlebar-height);
  background: var(--dsw-specific-sidebar-fill);
  -webkit-app-region: drag;
}

/* 内容区左上角 16px 圆角，做出「卡片嵌在壳里」的层次 */
[data-windows-titlebar] .centerCol {
  background: var(--dsw-alias-bg-base);
  border-radius: var(--dsh-windows-content-radius) 0 0 0;
  corner-shape: round;
}

/* 侧边栏不再画右分隔线（由圆角卡片本身分隔） */
[data-windows-titlebar] .sidebarCol { border-right: none }
```

### 3.4 侧边栏在 Windows 上的重排（`SidebarRoot.module.css`）

```css
/* logo 行压到 40px 标题栏高度内 */
[data-windows-titlebar] .root .logoRow { height: 40px; margin: 0; padding: 0 }
/* 折叠按钮垂直居中在标题栏里 */
[data-windows-titlebar] .toggle {
  position: fixed; left: 12px; z-index: 30; -webkit-app-region: no-drag;
  top: calc((var(--dsh-windows-titlebar-height) - 28px) / 2);
}
/* 折叠态下「新会话」挪到折叠按钮右边 */
[data-windows-titlebar] .collapsed .newSession { position: fixed; left: 48px; … }
```

### 3.5 自绘菜单栏（Application / Edit）

Windows 没有 macOS 全局菜单，DSH 在标题栏左侧用 shadow DOM 挂了一个原生感菜单栏，
位置由 CSS 变量控制，整块 `no-drag`：

```js
// shadow DOM 内的 <style>
:host { position: fixed; top: 0; left: var(--dsh-windows-menu-start, 48px);
        z-index: 1100; height: var(--dsh-windows-titlebar-height);
        display: flex; align-items: center;
        -webkit-app-region: no-drag; }
```

点击后不自己画下拉，而是 `ipcRenderer.invoke("dsh-desktop:windows-menu", name, x, y)`，
主进程用 `Menu.buildFromTemplate(...).popup()` 弹**原生菜单**——字体、阴影、键盘导航都是系统的。

---

## 4. 两个平台共用的三件事

### 4.1 主题 → 原生 chrome

```js
// preload：监听 Web 侧写的 data-ds-theme-source，转发给主进程
electron.ipcRenderer.send("dsh-desktop:native-theme-set", value);
// 主进程：nativeTheme.themeSource = value
// 于是 macOS vibrancy、Windows 覆盖层、原生弹窗、prefers-color-scheme 全部跟随应用主题
```

### 4.2 全屏

```js
// 主进程：enter/leave-full-screen + did-finish-load 都推一次
window.webContents.send("dsh-desktop:window-fullscreen", window.isFullScreen());
// preload：html[data-fullscreen]
// CSS：全屏时 --dsh-frame-chrome-top: 0px，遮罩/浮层不再从 40px 处开始
```

### 4.3 最小化/失焦兜底

- macOS：vibrancy 在最小化时置 null + 不透明底色（见 2.2）
- 通用：所有浮层/遮罩的 `inset` 起点用 `var(--dsh-frame-chrome-top)`，
  避免在标题栏下面出现一条没被遮罩覆盖的缝

---

## 5. 我们 `desktop/`（feat/desktop-shell）现状与差距

当前 `desktop/src/main/index.mjs:69`：

```js
const win = new BrowserWindow({
  width: 1280, height: 860, minWidth: 1024, minHeight: 700,
  show: false,
  title: APP_NAME,
  backgroundColor: '#ffffff',
  webPreferences: webPreferences(),
});
```

—— 完全默认窗口：系统标题栏 + 系统边框 + 白色底。这就是「浏览器味」的来源。

### 差距清单

| # | 缺什么 | 影响 |
|---|---|---|
| 1 | `titleBarStyle` / `trafficLightPosition` | macOS 无法去掉标题栏 |
| 2 | `vibrancy:'sidebar'` + 透明底 | 没有毛玻璃 |
| 3 | `titleBarOverlay` + `data-windows-titlebar` | Windows 顶部仍是系统 caption 条 |
| 4 | `data-platform` 标记 | 渲染层无法按平台分支 |
| 5 | `-webkit-app-region` 白名单 | 自绘标题栏不能拖 |
| 6 | 主题 → `nativeTheme` 同步 | 原生按钮/材质不跟主题 |
| 7 | 全屏事件 | 全屏时红绿灯/顶部留白错位 |

### 建议改法（最小侵入，分三步）

**Step 1 — 主进程（`desktop/src/main/index.mjs`）**

```js
const win = new BrowserWindow({
  ...,
  ...(process.platform === 'darwin' ? {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
  } : {}),
  ...(process.platform === 'win32' ? {
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      height: 40,
      color: nativeTheme.shouldUseDarkColors ? '#1b1b1c' : '#f9fafb',
      symbolColor: nativeTheme.shouldUseDarkColors ? '#f9fafb' : '#0f1115',
    },
  } : {}),
});
```

**Step 2 — preload（`desktop/src/preload/index.cjs`）**

```js
document.documentElement.dataset.platform = process.platform;
if (process.platform === 'win32') {
  document.documentElement.dataset.windowsTitlebar = '';
  document.documentElement.style.setProperty('--dsh-windows-titlebar-height', '40px');
}
```

**Step 3 — 渲染层（`client/src/style.css` 或 layout 组件）**

```css
/* macOS：框架透明，侧边栏半透明染色 */
html[data-platform=darwin], html[data-platform=darwin] body { background: transparent; }
html[data-platform=darwin] [data-window-drag] { -webkit-app-region: drag; }
html[data-platform=darwin] :is(button, a, input, select, textarea, [role=button]) { -webkit-app-region: no-drag; }
html[data-platform=darwin] { --app-top-clearance: 48px; }
[data-platform=darwin] .sidebar {
  background: color-mix(in srgb, var(--sidebar-fill) 40%, transparent);
  /* 真正的模糊由系统 vibrancy 提供，不要再叠 backdrop-filter */
}

/* Windows：自绘 40px 标题栏 + 内容圆角 */
html[data-windows-titlebar] { --app-titlebar-h: 40px; }
html[data-windows-titlebar] .app-frame {
  padding-top: var(--app-titlebar-h);
  background: var(--sidebar-fill);
}
html[data-windows-titlebar] .app-frame::before {
  content: ''; position: absolute; inset: 0 0 auto;
  height: var(--app-titlebar-h);
  background: var(--sidebar-fill);
  -webkit-app-region: drag;
}
html[data-windows-titlebar] .content { border-radius: 16px 0 0 0; }
```

> 注意：我们客户端是 **Vue**（DSH 是 React），但 CSS 方案可以原样搬——全是属性选择器，
> 与框架无关。区别只是把 `data-window-drag` 写在 `<template>` 上。

### 落地前必须确认的三件事

1. **macOS 打包基线**：`vibrancy` 需要 Electron ≥ 9，我们是 44.x，OK；ad-hoc 签名不影响 vibrancy。
2. **Windows 10 兼容**：WCO（`titleBarOverlay`）要求 Electron ≥ 12，OK；
   `backgroundMaterial: 'acrylic'` 才是 Win11 限定——**不要**在 Win10 上用。
3. **现有自绘 UI 的假设**：页面是满窗布局且 `body` 白底，改透明后要检查所有
   `position: fixed` 的遮罩/下拉是否从 `top:0` 开始（会盖到红绿灯上）。

---

## 6. 关键源码位置索引

| 内容 | asar 内路径 | 备注 |
|---|---|---|
| 窗口参数 / vibrancy 切换 / WCO 重设 | `lib/main.js` L8582-8620, L11935-12041, L12869-12878 | 桌面壳主进程 |
| platform / titlebar / 全屏 / 主题标记 | `lib/preload-app.cjs` | `markDocumentPlatform` / `syncWindowsAppearance` / `syncWindowFullscreen` / `syncNativeTheme` |
| 主框架 CSS（平台分支全在这） | `dsh-client-ui-layout/lib/client.js` 内联 `AppFrame.module.css` | 搜 `data-windows-titlebar` |
| 侧边栏 CSS | `dsh-client-ui-sidebar/lib/client.js` 内联 `SidebarRoot.module.css` | 搜 `data-platform=darwin` |
| 拖拽白名单全局 CSS | `dsh-web-frontend/dist/assets/index-*.css` | 搜 `data-window-drag` |
| 窗口材质着色（欢迎页/全窗页） | `renderer/assets/window-material.css` | `--dsw-desktop-window-tint` |

---

## 7. 参考

- 本机安装包：`/Applications/DeepSeek Harness.app`（Electron 壳 v0.2.1-rc.3）
- 仓库地址（当前网络不可达，留档）：https://github.com/deepseek-ai/deepseek-harness.git
- Electron 文档：titleBarStyle / titleBarOverlay（Window Controls Overlay）/ vibrancy
