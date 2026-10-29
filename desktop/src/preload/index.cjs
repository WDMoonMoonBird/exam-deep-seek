/**
 * preload/index.cjs —— 极窄桥（CommonJS）。
 *
 * 为什么是 .cjs：sandbox:true 下不支持 ESM preload（Electron 官方 ESM 矩阵；A 基线 §3.4），
 * 且不得为迁就 .mjs 而关闭 sandbox。本桥只注入**只读**平台/版本信息 + 平台/全屏标记属性，
 * 不向页面暴露 fs、child_process、ipcRenderer 或任何 Node API（ipcRenderer 仅在 preload 内部订阅一条全屏事件）。
 * 渲染层经 window.__DESKTOP__ 判定桌面环境；原生窗口样式（D24）经 <html data-platform> 分支。
 */
const { contextBridge, ipcRenderer } = require('electron');

/** 与 desktop/src/main/native-chrome.mjs 的 WINDOW_FULLSCREEN_CHANNEL 同一个字符串（preload 与主进程无共享模块）。 */
const WINDOW_FULLSCREEN_CHANNEL = 'dsh-desktop:window-fullscreen';

/**
 * 给 <html> 打平台标记，供渲染层按平台分支「原生窗口 chrome」（D24）。
 *
 * 为什么用属性而不是 class：与 DeepSeek Harness 同口径（html[data-platform=darwin]），
 * 样式表可以用属性选择器把 macOS 专属规则整段隔离；Web 端没有 preload，属性不存在，
 * 因此同一份 client 产物在浏览器里逐字节保持原样。
 *
 * preload 可能早于 <html> 被解析（documentElement 为 null），所以两种时机都要兜住。
 */
function markDocumentPlatform() {
  const mark = () => {
    if (document.documentElement) document.documentElement.dataset.platform = process.platform;
  };
  if (document.documentElement) mark();
  else window.addEventListener('DOMContentLoaded', mark, { once: true });
}

/**
 * 全屏状态同步：红绿灯在全屏下消失，渲染层要靠 <html data-fullscreen> 把 44px 安全带收掉。
 * 只用一条只读事件通道，不把 ipcRenderer 暴露给页面。
 */
function syncWindowFullscreen() {
  if (process.platform !== 'darwin') return;
  ipcRenderer.on(WINDOW_FULLSCREEN_CHANNEL, (_event, fullscreen) => {
    const root = document.documentElement;
    if (!root) return;
    if (fullscreen) root.dataset.fullscreen = 'true';
    else delete root.dataset.fullscreen;
  });
}

markDocumentPlatform();
syncWindowFullscreen();

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
