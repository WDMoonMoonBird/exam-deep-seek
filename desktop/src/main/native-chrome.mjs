/**
 * native-chrome.mjs —— 把「按平台算好的原生外观」装配到 Electron 对象上（薄胶水，无状态）。
 *
 * 职责单一（A 基线 §3.1 的叶模块约定）：
 *   ① 新建窗口时给 BrowserWindow 哪些平台专属参数（nativeWindowChrome → platform-chrome 纯决策）；
 *   ② 窗口生命周期里的材质/标题栏按钮维护（applyNativeChrome / applyTitleBarTheme）。
 * 不 import 本目录业务模块，不持有全局状态；index.mjs 只在组合根调用。
 *
 * 依据 docs/desktop/2026-10-29-dsh-native-window-chrome.md §2（macOS）与
 * docs/desktop/2026-10-30-windows-native-window.md（Windows）：
 *   · macOS：hiddenInset + vibrancy=sidebar + 全透明底；最小化/隐藏切不透明兜底。
 *   · Windows 11 22H2+：hidden + WCO 原生按钮 + backgroundMaterial=acrylic；按钮亮暗跟随页面主题。
 *   · Windows 10：hidden + WCO 原生按钮，没有系统材质 → 不透明回退（见 platform-chrome.mjs）。
 */
import { nativeTheme } from 'electron';
import {
  BACKDROP_ACRYLIC, WINDOW_FULLSCREEN_CHANNEL, WINDOW_THEME_CHANNEL, platformWindowOptions,
  titleBarOverlay, windowsBackdrop,
} from './platform-chrome.mjs';

export { WINDOW_FULLSCREEN_CHANNEL, WINDOW_THEME_CHANNEL } from './platform-chrome.mjs';

/**
 * 新建窗口的平台专属参数。
 * @param {NodeJS.Platform} platform - process.platform。
 * @param {{ systemVersion?: string }} [options] - 测试可注入；默认读本机。
 * @returns {object} 可直接展开进 BrowserWindow 构造参数的片段。
 */
export function nativeWindowChrome(platform, options = {}) {
  const systemVersion = options.systemVersion ?? process.getSystemVersion();
  const chrome = platformWindowOptions(platform, systemVersion);
  // Windows 的首帧按钮颜色按系统主题先给一版，页面 data-theme 就绪后由 IPC 校正。
  if (platform === 'win32') {
    chrome.titleBarOverlay = titleBarOverlay(nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  }
  return chrome;
}

/** vibrancy 离屏时不可用（最小化/隐藏会花屏），此时换成与侧栏同色系的不透明底色兜底。 */
export function chromeFallbackFill() {
  return nativeTheme.shouldUseDarkColors ? '#1b1b1c' : '#f9fafb';
}

/**
 * 按页面主题重设 WCO 按钮颜色（只影响 Windows；透明覆盖层不遮玻璃）。
 * @param {import('electron').BrowserWindow} win
 * @param {'light'|'dark'|null} theme
 */
export function applyTitleBarTheme(win, theme) {
  if (process.platform !== 'win32' || !win || win.isDestroyed()) return;
  const resolved = theme === 'light' || theme === 'dark'
    ? theme
    : (nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  win.setTitleBarOverlay(titleBarOverlay(resolved));
}

/**
 * 订阅渲染层的主题通道（preload 在 <html data-theme> 变化时发 'light'|'dark'）。
 * 只接受主窗口自己的 webContents；返回取消订阅函数。
 * @param {{ ipcMain: import('electron').IpcMain, getWindow: () => import('electron').BrowserWindow|null }} deps
 */
export function attachTitleBarThemeSync({ ipcMain, getWindow }) {
  if (process.platform !== 'win32') return () => {};
  const handler = (event, theme) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    if (event.sender !== win.webContents) return;
    if (theme !== 'light' && theme !== 'dark') return;
    applyTitleBarTheme(win, theme);
  };
  ipcMain.on(WINDOW_THEME_CHANNEL, handler);
  return () => ipcMain.removeListener(WINDOW_THEME_CHANNEL, handler);
}

/**
 * 窗口生命周期维护：
 *   · 两个平台都需要把全屏状态推给渲染层（收掉 mac 红绿灯安全带 / win 标题栏留白）；
 *   · macOS 另外处理 vibrancy 离屏兜底（最小化/隐藏换不透明底，恢复时换回）。
 * @param {import('electron').BrowserWindow} win - 主窗口。
 */
export function applyNativeChrome(win) {
  // 全屏时系统按钮消失，渲染层要把标题栏留白一起收掉（否则顶部留一条空带）。
  const sendFullscreen = () => {
    if (win.isDestroyed()) return;
    win.webContents.send(WINDOW_FULLSCREEN_CHANNEL, win.isFullScreen());
  };
  win.on('enter-full-screen', sendFullscreen);
  win.on('leave-full-screen', sendFullscreen);
  win.webContents.on('did-finish-load', sendFullscreen);

  if (process.platform !== 'darwin') return;

  const applyBackdrop = () => {
    if (win.isDestroyed()) return;
    if (win.isMinimized() || !win.isVisible()) {
      win.setVibrancy(null);
      win.setBackgroundColor(chromeFallbackFill());
    } else {
      win.setVibrancy('sidebar');
      win.setBackgroundColor('#00000000');
    }
  };
  win.on('minimize', applyBackdrop);
  win.on('hide', applyBackdrop);
  win.on('restore', applyBackdrop);
  win.on('show', applyBackdrop);
}

/** 该平台是否真的有系统级毛玻璃（供日志/诊断使用）。 */
export function hasSystemBackdrop(platform, systemVersion) {
  if (platform === 'darwin') return true;
  if (platform === 'win32') return windowsBackdrop(systemVersion) === BACKDROP_ACRYLIC;
  return false;
}
