/**
 * preload/index.cjs —— 极窄桥（CommonJS）。
 *
 * 为什么是 .cjs：sandbox:true 下不支持 ESM preload（Electron 官方 ESM 矩阵；A 基线 §3.4），
 * 且不得为迁就 .mjs 而关闭 sandbox。本桥只注入**只读**平台/版本信息 + 平台/全屏标记属性，
 * 不向页面暴露 fs、child_process、ipcRenderer 或任何 Node API
 * （ipcRenderer 仅在 preload 内部订阅一条全屏事件、上报一条主题事件）。
 * 渲染层经 window.__DESKTOP__ 判定桌面环境；原生窗口样式（D24）经 <html data-platform> 分支。
 */
const { contextBridge, ipcRenderer } = require('electron');

/** 与 desktop/src/main/platform-chrome.mjs 的通道名保持一致（preload 与主进程无共享模块，
 *  改一处必须同步改另一处）。 */
const WINDOW_FULLSCREEN_CHANNEL = 'dsh-desktop:window-fullscreen';
const WINDOW_THEME_CHANNEL = 'dsh-desktop:window-theme';

/** 读 additionalArguments 里本项目自己的标记（安全白名单在主进程侧做，preload 只读）。 */
function readArgument(name) {
  const prefix = '--' + name + '=';
  const hit = process.argv.find((arg) => typeof arg === 'string' && arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

/**
 * 给 <html> 打平台标记，供渲染层按平台分支「原生窗口 chrome」（D24）。
 *
 * 为什么用属性而不是 class：与 DeepSeek Harness 同口径（html[data-platform=darwin]），
 * 样式表可以用属性选择器把平台专属规则整段隔离；Web 端没有 preload，属性不存在，
 * 因此同一份 client 产物在浏览器里逐字节保持原样。
 *
 * Windows 额外打 data-windows-backdrop：
 *   acrylic → Win11 22H2+ 有系统亚克力，侧栏半透明让材质透出来；
 *   none    → Win10 没有系统材质，走不透明回退（不假装玻璃）。
 *
 * preload 可能早于 <html> 被解析（documentElement 为 null），所以两种时机都要兜住。
 */
function markDocumentPlatform() {
  const mark = () => {
    const root = document.documentElement;
    if (!root) return;
    root.dataset.platform = process.platform;
    if (process.platform === 'win32') {
      root.dataset.windowsBackdrop = readArgument('desktop-backdrop') === 'acrylic' ? 'acrylic' : 'none';
    }
  };
  if (document.documentElement) mark();
  else window.addEventListener('DOMContentLoaded', mark, { once: true });
}

/**
 * 全屏状态同步：全屏下 mac 红绿灯 / win WCO 按钮都会消失，
 * 渲染层要靠 <html data-fullscreen> 把顶部安全带收掉。
 * 只用一条只读事件通道，不把 ipcRenderer 暴露给页面。
 */
function syncWindowFullscreen() {
  if (process.platform !== 'darwin' && process.platform !== 'win32') return;
  ipcRenderer.on(WINDOW_FULLSCREEN_CHANNEL, (_event, fullscreen) => {
    const root = document.documentElement;
    if (!root) return;
    if (fullscreen) root.dataset.fullscreen = 'true';
    else delete root.dataset.fullscreen;
  });
}

/**
 * Windows：把页面主题（light/dark）告诉主进程，让 WCO 三个按钮的符号色跟着变。
 * 页面主题由 client 的 useTheme 写到 <html data-theme>，这里只做观察与转发，
 * 不把 ipcRenderer 暴露给页面；主进程只接受 'light' | 'dark'。
 */
function syncWindowsTitleBarTheme() {
  if (process.platform !== 'win32') return;
  // preload 执行时 <html> 还不存在（documentElement === null），必须等 DOM 就绪再观察；
  // 否则主题事件永远发不出去，按钮符号色停在「系统主题」那一版（深色页面顶栏上黑字）。
  const start = () => {
    const root = document.documentElement;
    if (!root) return;
    let last = null;
    const send = (theme) => {
      if (theme === last) return;
      last = theme;
      ipcRenderer.send(WINDOW_THEME_CHANNEL, theme);
    };
    const read = () => {
      const value = root.dataset.theme;
      send(value === 'light' || value === 'dark' ? value : null);
    };
    new MutationObserver(read).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    read();
  };
  if (document.documentElement) start();
  else window.addEventListener('DOMContentLoaded', start, { once: true });
}

markDocumentPlatform();
syncWindowFullscreen();
syncWindowsTitleBarTheme();

const bridge = Object.freeze({
  isDesktop: true,
  platform: process.platform,
  versions: Object.freeze({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  }),
});

try {
  contextBridge.exposeInMainWorld('__DESKTOP__', bridge);
} catch {
  /* 桥失败不影响页面安全（页面本来就不依赖它） */
}
