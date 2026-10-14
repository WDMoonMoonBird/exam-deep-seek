/**
 * errorCopy.js —— R2-B55：**统一的面向用户错误文案口径**（唯一的"错误 → UI 文案"出口）。
 *
 * 口径（与 B54 一致并推广到 composables/components）：
 *   ① 面向用户的 UI/toast 文案**固定友好**（「<操作名>失败，请重试」），**不得**出现原始 JS 错误原文
 *      （err.message / String(err) 之类）；服务端业务文案 response.data.message 仍优先使用（那是后端给出的友好提示）；
 *   ② 原始错误一律 console.error（带组件/操作标签 + 路由信息）⇒ 排查不受影响、界面不吓人；
 *   ③ ★W1（t1）例外且仅有一处：**已规范化的 ApiError**（api/apiError.js，带 uiSafe 标记）的 message 是
 *      经过审查的统一口径（服务端业务文案 / 401 / 403 / 404 / 5xx 可读文案），可直接上屏——它**不是**原始 JS 错误。
 *
 * 本模块零依赖（只用注入的 console/window），可在 node 下直接 import 做断言（verify-frontend ⑨e）。
 */
export const DEFAULT_FRIENDLY = '操作失败，请重试';

/** 当前路由信息（便于 console 侧定位；非浏览器环境安全回落） */
export function routePathOf(win) {
  try {
    const w = win || (typeof window !== 'undefined' ? window : null);
    if (!w || !w.location) return '(unknown)';
    return String(w.location.pathname || '') + String(w.location.hash || '');
  } catch { return '(unknown)'; }
}

/** 只输出原始错误到 console（带标签 + 路由），返回固定友好文案 */
export function reportError(err, { tag = '未标注位置', action = '', log = console, win = null, suffix = '' } = {}) {
  try { log.error('[R2-B55] ' + tag, { route: routePathOf(win), err }); } catch { /* 日志失败不得反过来影响业务 */ }
  const base = action ? action + '失败，请重试' : DEFAULT_FRIENDLY;
  return base + (suffix || '');
}

/**
 * UI/toast 文案的唯一出口：服务端业务文案优先，否则固定友好文案；**任何情况**都把原始错误送进 console。
 * 注意：本函数**不读取** err.message（避免原始 JS 错误进入 UI）——只读 response.data.message（服务端文案）。
 */
export function errorCopyOf(err, { tag = '未标注位置', action = '', log = console, win = null, suffix = '' } = {}) {
  try { log.error('[R2-B55] ' + tag, { route: routePathOf(win), err }); } catch { /* ignore */ }
  let serverMsg = null;
  try { serverMsg = err && err.response && err.response.data && err.response.data.message; } catch { serverMsg = null; }
  if (serverMsg) return String(serverMsg) + (suffix || '');
  // ★W1（t1）：规范化后的 ApiError 文案已过审查（服务端业务文案 / 统一 HTTP 口径），可直接上屏；
  //   只有 uiSafe 标记为真时才取——原始 JS 错误（无该标记）仍一律不读 message，只进 console。
  let curated = null;
  try { curated = err && err.uiSafe === true && typeof err.message === 'string' ? err.message : null; } catch { curated = null; }
  if (curated) return String(curated) + (suffix || '');
  const base = action ? action + '失败，请重试' : DEFAULT_FRIENDLY;
  return base + (suffix || '');
}

export default { DEFAULT_FRIENDLY, routePathOf, reportError, errorCopyOf };
