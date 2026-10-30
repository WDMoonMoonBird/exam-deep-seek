/**
 * security-policy.mjs —— Electron 安全策略的纯决策（零依赖，可 node --test；不 import electron）。
 *
 * 基线（计划 §7.1）：contextIsolation=true、sandbox=true、nodeIntegration=false、webSecurity=true；
 * 导航/新窗口/权限/下载**默认拒绝**，仅本地内容服务 origin 与 https 外链白名单例外。
 * security.mjs 只负责把这里的决策装配到 session/webContents（A 基线 §3.1/§3.2）。
 */

/** 安全 webPreferences 基线（index.mjs 直接展开使用；不得降级） */
export const WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  webviewTag: false,
  safeDialogs: true,
  spellcheck: false,
});

export const DECISION_ALLOW = 'allow';
export const DECISION_BLOCK = 'block';

function parseHttpUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') return null;
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/** additionalArguments 只允许本项目自己的只读标记，避免调用方顺手把任意参数灌进渲染进程。 */
const ALLOWED_ADDITIONAL_ARG_PREFIX = '--desktop-';

function sanitizeAdditionalArguments(values) {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value) => typeof value === 'string' && value.startsWith(ALLOWED_ADDITIONAL_ARG_PREFIX))
    .slice(0, 8);
}

/** 构造 webPreferences：显式基线 + 可选 preload/devTools/additionalArguments（生产由调用方传 devTools:false） */
export function secureWebPreferences({ preload = null, devTools = false, additionalArguments = [] } = {}) {
  const preferences = { ...WEB_PREFERENCES, devTools: devTools === true };
  if (preload) preferences.preload = preload;
  const args = sanitizeAdditionalArguments(additionalArguments);
  if (args.length > 0) preferences.additionalArguments = args;
  return preferences;
}

/**
 * 构造安全策略：
 * @param {{ appOrigin: string, externalOrigins?: string[] }} options
 * appOrigin 必须是本地内容服务 origin；externalOrigins 只接受 https（外链一律交给系统浏览器）。
 */
export function createSecurityPolicy({ appOrigin, externalOrigins = [] } = {}) {
  const local = parseHttpUrl(appOrigin);
  if (!local || local.protocol !== 'http:') {
    throw new TypeError('createSecurityPolicy: appOrigin 必须是本地内容服务的 http origin');
  }
  const origins = [];
  for (const item of Array.isArray(externalOrigins) ? externalOrigins : []) {
    const url = parseHttpUrl(item);
    if (!url || url.protocol !== 'https:') continue;
    if (url.origin === local.origin || origins.includes(url.origin)) continue;
    origins.push(url.origin);
  }
  return Object.freeze({ appOrigin: local.origin, externalOrigins: Object.freeze(origins) });
}

/** 导航决策：只允许本地内容服务 origin 下的 /exam 路径（站内路由/刷新） */
export function evaluateNavigation(rawUrl, policy) {
  const url = parseHttpUrl(rawUrl);
  if (!url) return { decision: DECISION_BLOCK, reason: '非 http(s) 地址' };
  if (!policy || url.origin !== policy.appOrigin) {
    return { decision: DECISION_BLOCK, reason: '导航目标不是本地内容服务 origin' };
  }
  if (!url.pathname.startsWith('/exam')) {
    return { decision: DECISION_BLOCK, reason: '导航路径不在 /exam 下' };
  }
  return { decision: DECISION_ALLOW, reason: '站内导航', url: url.href };
}

/**
 * 新窗口决策：
 *   · 站内链接 → allow（由 security.mjs 用安全 webPreferences 覆盖子窗口配置）
 *   · https 外链白名单 → block + openExternal（交给系统浏览器）
 *   · 其余 → block
 */
export function evaluateWindowOpen(rawUrl, policy) {
  const url = parseHttpUrl(rawUrl);
  if (!url) return { decision: DECISION_BLOCK, reason: '非 http(s) 地址' };
  if (policy && url.origin === policy.appOrigin) {
    if (!url.pathname.startsWith('/exam')) return { decision: DECISION_BLOCK, reason: '站内链接路径不在 /exam 下' };
    return { decision: DECISION_ALLOW, reason: '站内新窗口', url: url.href };
  }
  if (url.protocol === 'https:' && policy && policy.externalOrigins.includes(url.origin)) {
    return { decision: DECISION_BLOCK, reason: '站外白名单外链转系统浏览器', openExternal: url.href };
  }
  return { decision: DECISION_BLOCK, reason: '站外链接未在白名单' };
}

/** 权限决策：默认拒绝一切权限请求（麦克风/摄像头/通知/地理位置/剪贴板读等） */
export function permissionDecision(permission) {
  return { allow: false, reason: '默认拒绝权限请求：' + String(permission || 'unknown').slice(0, 40) };
}

/**
 * 取 blob: 下载地址的内层 origin：`blob:http://127.0.0.1:47821/<uuid>` → `http://127.0.0.1:47821`。
 * 非 blob 地址返回 null。blob URL 的 origin 前缀由浏览器在创建时写入，页面无法伪造，
 * 因此可以当作「发起下载的页面所属 origin」使用。
 * @param {string} rawUrl 下载项 URL（DownloadItem.getURL()）
 * @returns {string|null} 内层 origin，非 blob 时 null
 */
function blobUrlOrigin(rawUrl) {
  if (!rawUrl.startsWith('blob:')) return null;
  const inner = rawUrl.slice(5);
  // 注意：origin 自带 "scheme://"，不能直接找第一个 '/'（否则会把 "http:" 当成 origin）
  const schemeEnd = inner.indexOf('://');
  const from = schemeEnd === -1 ? 0 : schemeEnd + 3;
  const slash = inner.indexOf('/', from);
  const origin = slash === -1 ? inner : inner.slice(0, slash);
  return origin === '' ? null : origin;
}

/**
 * 下载决策：本站 /exam 下的资源 + **本站页面生成的 blob**。
 *
 * 为什么必须放行 blob（D25）：前端导出 xlsx / 下载日志都是渲染层先造 Blob 再 `<a download>`，
 * 浏览器把这类下载的 URL 报成 `blob:http://127.0.0.1:47821/<uuid>`。旧实现只认 http(s)，
 * 于是 will-download 里被静默 preventDefault —— 用户看到的现象就是「点导出没反应」。
 * 安全边界不变：blob 的内层 origin 必须等于本地内容服务 origin；data:/filesystem: 等仍然拒绝，
 * 站外 blob 也拒绝。
 *
 * @param {string} rawUrl 下载项 URL
 * @param {{ appOrigin: string }} policy 安全策略
 * @returns {{ allow: boolean, reason: string }}
 */
export function evaluateDownload(rawUrl, policy) {
  const raw = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  const blobOrigin = blobUrlOrigin(raw);
  if (blobOrigin !== null) {
    if (!policy || blobOrigin !== policy.appOrigin) return { allow: false, reason: '不可信来源的 blob 下载' };
    return { allow: true, reason: '本站页面生成的 blob 下载' };
  }
  const url = parseHttpUrl(raw);
  if (!url) return { allow: false, reason: '非 http(s) 下载地址' };
  if (!policy || url.origin !== policy.appOrigin) return { allow: false, reason: '站外下载地址' };
  if (!url.pathname.startsWith('/exam')) return { allow: false, reason: '下载路径不在 /exam 下' };
  return { allow: true, reason: '本站资源下载' };
}

/** 日志脱敏：只保留 origin + pathname（丢弃查询串/凭证），供 guard 告警使用 */
export function redactUrl(rawUrl) {
  const raw = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  const blobOrigin = blobUrlOrigin(raw);
  if (blobOrigin !== null) return 'blob:' + blobOrigin;
  const url = parseHttpUrl(raw);
  if (!url) return '(invalid-url)';
  return url.origin + url.pathname;
}
