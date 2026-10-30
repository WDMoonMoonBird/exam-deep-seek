/**
 * platform-chrome.mjs —— 桌面窗口「原生外观」的纯决策（零依赖，可 node --test；不 import electron）。
 *
 * 为什么单独一层：窗口参数同时被主进程（BrowserWindow 构造）和 preload（渲染层标记）消费，
 * 而且 Win10/Win11 能力不同。把「按平台/系统版本该给什么」收敛成纯函数，
 * native-chrome.mjs 只负责装配，测试不需要 Electron。
 *
 * 平台口径：
 *   · macOS：hiddenInset + 红绿灯 + vibrancy=sidebar + 全透明底（v0.2.0 已验收，保持不动）。
 *   · Windows：hidden + titleBarOverlay（WCO）—— 去掉系统标题栏，但最小化/最大化/关闭
 *     三个按钮仍是 Windows 原生按钮（命令、命中测试、悬停、Win11 Snap Layouts 都是系统的）。
 *   · Windows 11 22H2+（build ≥ 22621）：再加 backgroundMaterial=acrylic（DWM 真亚克力），
 *     页面让出透明才看得见；不设不透明 backgroundColor（会盖掉材质）。
 *   · Windows 10（build < 22621）：Electron/DWM 没有公开的系统毛玻璃 API
 *     （DWM_SYSTEMBACKDROP_TYPE 最低 22621）→ 保留原生按钮，但不透明回退，不假装玻璃。
 *   · Linux：v0 不提供产物，维持旧行为（白底 + 系统标题栏）。
 */

/** Windows 标题栏按钮带高度（WCO overlay，CSS px）。 */
export const WINDOWS_TITLEBAR_HEIGHT = 40;

/** Win11 22H2（DWM_SYSTEMBACKDROP_TYPE 的最低支持版本）。 */
export const WINDOWS_BACKDROP_MIN_BUILD = 22621;

/** 渲染层 → 主进程：窗口标题栏按钮的明暗（只传 'light' | 'dark'，颜色由主进程算）。 */
export const WINDOW_THEME_CHANNEL = 'dsh-desktop:window-theme';

/** 主进程 → 渲染层：全屏状态（mac 收红绿灯安全带；win 收标题栏留白）。 */
export const WINDOW_FULLSCREEN_CHANNEL = 'dsh-desktop:window-fullscreen';

/** Windows 系统材质档位：acrylic = DWM 亚克力（真模糊）；none = 回退到不透明。 */
export const BACKDROP_ACRYLIC = 'acrylic';
export const BACKDROP_NONE = 'none';

/** 从 process.getSystemVersion()（如 "10.0.22631"）里取 build 号；解析失败回 0（安全回退）。 */
export function windowsBuildNumber(systemVersion) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(systemVersion ?? '').trim());
  return match ? Number(match[3]) : 0;
}

/** 该 Windows 版本能不能用系统亚克力。 */
export function windowsBackdrop(systemVersion) {
  return windowsBuildNumber(systemVersion) >= WINDOWS_BACKDROP_MIN_BUILD ? BACKDROP_ACRYLIC : BACKDROP_NONE;
}

/**
 * WCO 覆盖层参数。color 透明：按钮浮在侧栏/顶栏玻璃上，不额外盖一块实色。
 * 透明覆盖层在 Electron 41+ 才修好（PR #51017），本项目 44 可用。
 * @param {'light'|'dark'|null} theme - 页面主题；null 时由调用方按系统主题兜底。
 */
export function titleBarOverlay(theme) {
  return {
    color: 'rgba(0, 0, 0, 0)',
    symbolColor: theme === 'light' ? '#101418' : '#f3f4f6',
    height: WINDOWS_TITLEBAR_HEIGHT,
  };
}

/**
 * 新建窗口的平台专属参数（可直接展开进 BrowserWindow 构造参数）。
 * @param {NodeJS.Platform} platform
 * @param {string} systemVersion - process.getSystemVersion()；仅 win32 使用。
 */
export function platformWindowOptions(platform, systemVersion) {
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 18 },
      vibrancy: 'sidebar',
      visualEffectState: 'active',
      backgroundColor: '#00000000',
    };
  }
  if (platform === 'win32') {
    const base = {
      titleBarStyle: 'hidden',
      titleBarOverlay: titleBarOverlay(null),
    };
    if (windowsBackdrop(systemVersion) === BACKDROP_ACRYLIC) {
      // 关键：不设 backgroundColor。设了不透明底（含默认 #FFF）DWM 材质就透不出来。
      return { ...base, backgroundMaterial: BACKDROP_ACRYLIC };
    }
    // Win10：没有系统材质；给一个与页面画布同色的不透明底，避免白闪。
    return { ...base, backgroundColor: '#ffffff' };
  }
  return { backgroundColor: '#ffffff' };
}

/** 传给 preload 的渲染层标记：Windows 需要知道「有没有真材质」来决定要不要让出透明。 */
export function rendererChromeArgs(platform, systemVersion) {
  if (platform !== 'win32') return [];
  return ['--desktop-backdrop=' + windowsBackdrop(systemVersion)];
}
