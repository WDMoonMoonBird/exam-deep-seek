/**
 * security.mjs —— 把 security-policy 的纯决策**装配**到 Electron session / webContents（仅装配，无算法）。
 * 注意：本文件不 import electron；Electron 对象由组合根注入，便于单测与依赖方向收敛（A 基线 §3.1/§3.2）。
 */
import {
  DECISION_ALLOW,
  evaluateDownload,
  evaluateNavigation,
  evaluateWindowOpen,
  permissionDecision,
  redactUrl,
} from './security-policy.mjs';

const MAX_URL_LOG = 300;

function warn(log, message) {
  try {
    if (log && typeof log.warn === 'function') log.warn(message);
  } catch {
    /* 日志失败不影响安全装配 */
  }
}

function info(log, message) {
  try {
    if (log && typeof log.info === 'function') log.info(message);
  } catch {
    /* 日志失败不影响安全装配 */
  }
}

function safeCall(fn) {
  try {
    if (typeof fn === 'function') fn();
  } catch {
    /* 装配失败不得影响主流程 */
  }
}

/**
 * 装配 webContents 守卫：will-navigate / will-redirect / window.open / <webview> 挂载。
 * @param {object} webContents Electron WebContents（注入）
 * @param {{ policy: object, openExternal?: Function|null, childWindowOptions?: object|null, log?: object|null }} options
 */
export function applyWebContentsSecurity(webContents, {
  policy, openExternal = null, childWindowOptions = null, log = null,
} = {}) {
  if (!webContents || !policy) throw new TypeError('applyWebContentsSecurity: webContents 与 policy 必填');

  const blockNavigation = (event, url) => {
    const result = evaluateNavigation(url, policy);
    if (result.decision === DECISION_ALLOW) return;
    try { event.preventDefault(); } catch { /* ignore */ }
    warn(log, '[security] 已拦截导航（' + result.reason + '）：' + redactUrl(url).slice(0, MAX_URL_LOG));
  };

  webContents.on('will-navigate', blockNavigation);
  webContents.on('will-redirect', blockNavigation);
  webContents.on('will-attach-webview', (event) => {
    try { event.preventDefault(); } catch { /* ignore */ }
    warn(log, '[security] 已拦截 <webview> 挂载');
  });

  webContents.setWindowOpenHandler(({ url }) => {
    const result = evaluateWindowOpen(url, policy);
    if (result.decision === DECISION_ALLOW) {
      return childWindowOptions
        ? { action: 'allow', overrideBrowserWindowOptions: { ...childWindowOptions } }
        : { action: 'allow' };
    }
    if (result.openExternal && typeof openExternal === 'function') safeCall(() => openExternal(result.openExternal));
    warn(log, '[security] 已拦截 window.open（' + result.reason + '）：' + redactUrl(url).slice(0, MAX_URL_LOG));
    return { action: 'deny' };
  });

  return webContents;
}

/**
 * 装配 session 守卫：权限默认拒绝、设备权限默认拒绝、仅本站下载。
 * @param {object} electronSession Electron Session（注入）
 * @param {{ policy: object, log?: object|null }} options
 */
export function applySessionSecurity(electronSession, { policy, log = null } = {}) {
  if (!electronSession || !policy) throw new TypeError('applySessionSecurity: session 与 policy 必填');

  safeCall(() => electronSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const result = permissionDecision(permission);
    try { callback(result.allow); } catch { /* ignore */ }
    warn(log, '[security] ' + result.reason);
  }));
  safeCall(() => electronSession.setPermissionCheckHandler(() => permissionDecision('check').allow));
  safeCall(() => electronSession.setDevicePermissionHandler?.(() => permissionDecision('device').allow));

  safeCall(() => electronSession.on('will-download', (event, item) => {
    const url = item && typeof item.getURL === 'function' ? item.getURL() : '';
    const result = evaluateDownload(url, policy);
    if (!result.allow) {
      try { event.preventDefault(); } catch { /* ignore */ }
      warn(log, '[security] 已拦截下载（' + result.reason + '）');
      return;
    }
    // 放行后 Chromium 默认弹系统保存对话框；这里只留痕，便于以后排查「点了没反应」类问题。
    info(log, '[download] 放行（' + result.reason + '）：' + redactUrl(url).slice(0, MAX_URL_LOG));
    try {
      item.once('done', (_doneEvent, state) => {
        info(log, '[download] ' + state + '：' + String(item.getFilename ? item.getFilename() : '').slice(0, MAX_URL_LOG));
      });
    } catch { /* 某些平台/版本可能不支持，忽略 */ }
  }));

  return electronSession;
}

/** 组合入口：session 与/或 webContents 二选一或同时装配（组合根按事件调用） */
export function applySecurity({
  session = null, webContents = null, policy,
  openExternal = null, childWindowOptions = null, log = null,
} = {}) {
  if (!policy) throw new TypeError('applySecurity: policy 必填');
  if (session) applySessionSecurity(session, { policy, log });
  if (webContents) applyWebContentsSecurity(webContents, { policy, openExternal, childWindowOptions, log });
}
