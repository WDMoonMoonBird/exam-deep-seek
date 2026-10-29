/**
 * native-chrome.mjs —— 桌面窗口的「原生质感」参数（纯装配，无状态）。
 *
 * 职责单一（A 基线 §3.1 的叶模块约定）：只回答两个问题——
 *   ① 新建窗口时给 BrowserWindow 哪些平台专属参数（nativeWindowChrome）；
 *   ② 窗口生命周期里 vibrancy 怎么跟着最小化/隐藏切换（applyNativeChrome）。
 * 不 import 本目录任何模块，不持有全局状态；index.mjs 只在组合根调用一次。
 *
 * 依据 docs/desktop/2026-10-29-dsh-native-window-chrome.md §2（对照 DeepSeek Harness 桌面端）：
 *   · titleBarStyle='hiddenInset' —— 去掉系统标题栏但保留原生红绿灯（不是 frame:false，
 *     frame:false 会连红绿灯和窗口圆角一起丢掉）；
 *   · vibrancy='sidebar'          —— 系统级毛玻璃材质，渲染层侧栏半透明处透出来的就是它；
 *   · backgroundColor 全透明      —— 关键：窗口底色不透明时 vibrancy 完全看不见；
 *   · visualEffectState='active'  —— 失焦时材质不变灰。
 * 非 darwin 保持 v0 行为（不透明白底 + 系统标题栏），Windows 迁移另开一轮。
 */
import { nativeTheme } from 'electron';

/** 主进程 → preload 的全屏状态通道（只用于渲染层收放红绿灯安全带，不承载任何业务）。 */
export const WINDOW_FULLSCREEN_CHANNEL = 'dsh-desktop:window-fullscreen';

/**
 * 新建窗口的平台专属参数。
 * @param {NodeJS.Platform} platform - process.platform。
 * @returns {object} 可直接展开进 BrowserWindow 构造参数的片段。
 */
export function nativeWindowChrome(platform) {
  if (platform !== 'darwin') return { backgroundColor: '#ffffff' };
  return {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
  };
}

/** vibrancy 离屏时不可用（最小化/隐藏会花屏），此时换成与侧栏同色系的不透明底色兜底。 */
export function chromeFallbackFill() {
  return nativeTheme.shouldUseDarkColors ? '#1b1b1c' : '#f9fafb';
}

/**
 * macOS：最小化/隐藏期间关掉 vibrancy 并换不透明底，恢复/显示时换回「透明 + sidebar」。
 * 不做这一步时 Mission Control / 恢复动画会出现整窗黑块或残影。
 * @param {import('electron').BrowserWindow} win - 主窗口。
 */
export function applyNativeChrome(win) {
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

  // 全屏时红绿灯消失，渲染层要把 44px 安全带收掉（否则顶部留一条空带）。
  const sendFullscreen = () => {
    if (win.isDestroyed()) return;
    win.webContents.send(WINDOW_FULLSCREEN_CHANNEL, win.isFullScreen());
  };
  win.on('enter-full-screen', sendFullscreen);
  win.on('leave-full-screen', sendFullscreen);
  win.webContents.on('did-finish-load', sendFullscreen);
}
