/**
 * errorCopy.js —— R2-B55：**统一的面向用户错误文案口径**（唯一的"错误 → UI 文案"出口）。
 *
 * 口径（与 B54 一致并推广到 composables/components）：
 *   ① 面向用户的 UI/toast 文案**固定友好**（「<操作名>失败，请重试」），**不得**出现原始 JS 错误原文
 *      （err.message / String(err) 之类）；服务端业务文案 response.data.message 仍优先使用（那是后端给出的友好提示）；
 *   ② 原始错误一律 console.error（带组件/操作标签 + 路由信息）⇒ 排查不受影响、界面不吓人；
 *   ③ ★W1（t1）例外且仅有一处：**已规范化的 ApiError**（api/apiError.js，带 uiSafe 标记）的 message 是
 *      经过审查的统一口径（服务端业务文案 / 401 / 403 / 404 / 5xx 可读文案），可直接上屏——它**不是**原始 JS 错误；
 *   ④ ★W4（t6）：**401 与 ≥ 500 的服务端原文一律不上屏**（hidesServerCopy），统一口径见 apiError.curatedMessage。
 *
 * 本模块零依赖（只用注入的 console/window），可在 node 下直接 import 做断言（verify-frontend ⑨e）。
 */
export const DEFAULT_FRIENDLY = '操作失败，请重试';

/**
 * ★W1-r2（t4）：是否为"服务端故障"（status ≥ 500）。
 * 命中 ⇒ 不用服务端原文，改用 ApiError 的统一 HTTP 口径文案（'服务出错了，请稍后重试'）。
 */
export function isServerFault(err) {
  try { return !!err && err.isApiError === true && Number(err.status) >= 500; } catch { return false; }
}

/**
 * ★W4（t6/F6）：**服务端原文不得上屏**的两类状态 —— 401 与 ≥ 500。
 *   · 401：middleware/auth.js 有三种原文（未登录或 Token 过期 / 用户不存在 / 登录状态已失效（密码已变更）…），
 *     而"登录态失效"的用户可见文案必须**恒为**统一口径（与 request.js handleAuthExpired 一致），否则同一件事三种措辞；
 *   · ≥ 500：服务端 5xx 的 message 可能夹带内部实现细节。
 * 命中 ⇒ errorCopyOf 跳过 response.data.message，改走 ApiError 的统一口径；原文仍进 console。
 * 兼容未规范化（裸 axios 错误）的形状：无 ApiError 标记时读 response.status。
 */
export function hidesServerCopy(err) {
  try {
    if (!err) return false;
    const status = Number((err.isApiError === true ? err.status : (err.response && err.response.status)) || 0);
    return status === 401 || status >= 500;
  } catch { return false; }
}

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
  // ★W1-r2（t4）+ ★W4（t6）：401 与 ≥ 500 一律走统一口径，服务端原文不上屏（原文只进 console / 诊断信息）。
  //   —— 401 的三种服务端措辞必须收敛成同一句（见 hidesServerCopy 注释）。
  if (serverMsg && !hidesServerCopy(err)) return String(serverMsg) + (suffix || '');
  // ★W1（t1）：规范化后的 ApiError 文案已过审查（服务端业务文案 / 统一 HTTP 口径），可直接上屏；
  //   只有 uiSafe 标记为真时才取——原始 JS 错误（无该标记）仍一律不读 message，只进 console。
  let curated = null;
  try { curated = err && err.uiSafe === true && typeof err.message === 'string' ? err.message : null; } catch { curated = null; }
  if (curated) return String(curated) + (suffix || '');
  const base = action ? action + '失败，请重试' : DEFAULT_FRIENDLY;
  return base + (suffix || '');
}

export default { DEFAULT_FRIENDLY, isServerFault, hidesServerCopy, routePathOf, reportError, errorCopyOf };
