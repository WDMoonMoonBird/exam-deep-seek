/**
 * downloadTargets.js —— 欢迎页下载目标（纯逻辑，可单测）
 *
 * 目标：按当前系统给出默认安装包，同时提供 macOS / Windows / Android 三个选项。
 * 文件统一放在站点 /exam/download/ 下（由部署机静态目录提供）。
 */

export const DOWNLOADS = Object.freeze([
  {
    id: 'macos',
    label: 'macOS',
    title: 'macOS（Apple 芯片）',
    note: 'macOS 13 或更高版本',
    file: 'Deadpan-0.1.2-arm64.dmg',
    version: '0.1.2',
    kind: 'DMG',
  },
  {
    id: 'windows',
    label: 'Windows',
    title: 'Windows（64 位）',
    note: 'Windows 10 或更高版本',
    file: 'Deadpan-0.1.2-x64.exe',
    version: '0.1.2',
    kind: 'EXE',
  },
  {
    id: 'android',
    label: 'Android',
    title: 'Android（安卓）',
    note: 'Android 7.0 或更高版本',
    file: 'deadpan-1.1.apk',
    version: '1.1',
    kind: 'APK',
  },
]);

/** 识别当前系统；返回 macos / windows / android / ios / linux / unknown */
export function detectPlatform({ userAgent = '', platform = '', userAgentDataPlatform = '' } = {}) {
  const ua = String(userAgent);
  const p = String(userAgentDataPlatform || platform || '').toLowerCase();

  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || /^ios$/i.test(p)) return 'ios';
  if (/win/i.test(p) || /windows/i.test(ua)) return 'windows';
  if (/mac/i.test(p) || /macintosh|mac os x/i.test(ua)) return 'macos';
  if (/linux/i.test(p) || /linux/i.test(ua)) return 'linux';
  return 'unknown';
}

/** 当前系统对应的默认安装包；无匹配返回 null（UI 显示“下载客户端”并展开菜单） */
export function defaultDownloadFor(platform, items = DOWNLOADS) {
  return (items || []).find((item) => item.id === platform) || null;
}
