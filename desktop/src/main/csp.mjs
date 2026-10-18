/**
 * csp.mjs —— 本地内容服务下发的等价 CSP / 安全响应头（纯函数，可单测；不依赖 Electron）。
 *
 * ★单一真源（必须同步的三处，改一处要同步其余）：
 *   ① nginx-exam.conf 顶部 map $exam_csp_policy（线上 SPA 的 enforce 真源）
 *   ② Web 端 CSP 中间件（Express，默认 report-only）
 *   ③ 本文件 buildCspDirectives()（桌面本地内容服务的镜像）
 * 策略串与 ① 的 default 值**逐指令等价**；安全头口径与 security-headers.inc 六条一致。
 * 其余口径（计划 §2.3/§7.2/§7.4）：默认 report-only；不引入外部源（无 *、无 CDN）；
 * enforce 前必须先与安全团队同步。
 * 说明：本文件只构造头；env 由调用方注入，不在模块内读取全局状态。
 */

export const CSP_MODES = Object.freeze(['off', 'report-only', 'enforce']);
export const CSP_DEFAULT_MODE = 'report-only';
export const CSP_REPORT_ONLY_HEADER = 'Content-Security-Policy-Report-Only';
export const CSP_ENFORCE_HEADER = 'Content-Security-Policy';

const DIRECTIVE_ORDER = Object.freeze([
  'defaultSrc', 'baseUri', 'objectSrc', 'frameAncestors', 'frameSrc', 'formAction',
  'manifestSrc', 'scriptSrc', 'styleSrc', 'imgSrc', 'fontSrc', 'connectSrc',
  'workerSrc', 'childSrc', 'reportUri',
]);

function kebabName(key) {
  return String(key).replace(/[A-Z]/g, (char) => '-' + char.toLowerCase());
}

/** 解析 CSP 开关：默认 report-only；非法值回落默认（绝不静默变 enforce） */
export function resolveCspMode(env = {}, { warn = null } = {}) {
  const raw = String((env && env.CSP_MODE) || '').trim().toLowerCase();
  if (!raw) return CSP_DEFAULT_MODE;
  if (CSP_MODES.includes(raw)) return raw;
  try {
    if (warn && typeof warn.warn === 'function') {
      warn.warn('[CSP] CSP_MODE 取值非法 ⇒ 回落 ' + CSP_DEFAULT_MODE + '；可选值：' + CSP_MODES.join(' | '));
    }
  } catch {
    /* 告警失败不影响启动 */
  }
  return CSP_DEFAULT_MODE;
}

/**
 * 指令集（与 Web 端等价）：
 * script-src 的 'unsafe-inline'/'unsafe-eval'/data:/blob: 是现有 client/dist 产物的实测必需项
 * （5 段构建期内联脚本、antd CSS-in-JS 探测、Vite 现代浏览器探测、Monaco worker）；
 * 本波不改 client 源码，故不能收紧——退出路径见 Web 端 CSP 中间件注释（单一真源同步点见上）。
 */
export function buildCspDirectives({ reportUri = '' } = {}) {
  const directives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
    frameSrc: ["'self'"],
    formAction: ["'self'"],
    manifestSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'data:', 'blob:'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'],
    fontSrc: ["'self'", 'data:'],
    connectSrc: ["'self'", 'ws:', 'wss:'],
    workerSrc: ["'self'", 'blob:'],
    childSrc: ["'self'", 'blob:'],
  };
  const uri = String(reportUri || '').trim();
  if (uri) directives.reportUri = [uri];
  return directives;
}

/** 序列化为 CSP 头值（确定性顺序，便于单测/审计比对） */
export function serializeCspDirectives(directives) {
  const source = directives && typeof directives === 'object' ? directives : {};
  const parts = [];
  const emitted = new Set();
  const emit = (key) => {
    emitted.add(key);
    const values = source[key];
    if (!Array.isArray(values) || values.length === 0) return;
    const tokens = values.map((item) => String(item).trim()).filter(Boolean);
    if (tokens.length > 0) parts.push(kebabName(key) + ' ' + tokens.join(' '));
  };
  for (const key of DIRECTIVE_ORDER) emit(key);
  for (const key of Object.keys(source)) if (!emitted.has(key)) emit(key);
  return parts.join('; ');
}

/**
 * 下发头列表（[name, value][]，供 res.writeHead 直接使用）：
 * CSP（按模式） + nosniff/XFO/Referrer/HSTS/X-Robots-Tag（与 security-headers.inc 对齐）。
 * 注：HSTS 经 http loopback 下发时浏览器按 RFC 6797 忽略，保留只为与 Web 端口径一致。
 */
export function buildSecurityHeaders({ cspMode = CSP_DEFAULT_MODE, cspReportUri = '' } = {}) {
  const mode = CSP_MODES.includes(cspMode) ? cspMode : CSP_DEFAULT_MODE;
  const headers = [];
  if (mode !== 'off') {
    const name = mode === 'enforce' ? CSP_ENFORCE_HEADER : CSP_REPORT_ONLY_HEADER;
    headers.push([name, serializeCspDirectives(buildCspDirectives({ reportUri: cspReportUri }))]);
  }
  headers.push(
    ['X-Content-Type-Options', 'nosniff'],
    ['X-Frame-Options', 'SAMEORIGIN'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
    ['X-Robots-Tag', 'noindex'],
  );
  return headers;
}
