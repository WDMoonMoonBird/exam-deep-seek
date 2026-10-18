/**
 * proxy-headers.mjs —— loopback 反代的请求/响应头处理（纯函数；不依赖 Electron，不发起网络）。
 *
 * 安全口径（计划 §2.3/§7.2）：
 *   · Host：只接受本机 loopback（127.0.0.1 / localhost），且端口等于本地固定端口（防 DNS rebinding）
 *   · 请求头：去掉本地 Origin/Referer；Host 重写为远端；客户端自带的 Forwarded / X-Forwarded-* / X-Real-IP
 *     一律丢弃；**不生成**任何 X-Forwarded-For（不伪造客户端 IP、不破坏服务端登录限流）
 *   · 响应头：剥离 hop-by-hop，其余原样透传（含 set-cookie 等数组值）
 *   · WebSocket：保留 Sec-WebSocket-*；显式设置 Connection/Upgrade；不缓冲
 */

export const HOP_BY_HOP_HEADERS = Object.freeze([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]);
const HOP_BY_HOP = new Set(HOP_BY_HOP_HEADERS);
const FORWARDED_HEADERS = Object.freeze([
  'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto',
  'x-forwarded-port', 'x-real-ip', 'x-client-ip',
]);
const FORWARDED = new Set(FORWARDED_HEADERS);
const LOOPBACK_HOSTNAMES = Object.freeze(['127.0.0.1', 'localhost']);
const DROP_ON_FORWARD = new Set(['host', 'origin', 'referer']);

function headerEntries(headers) {
  if (!headers || typeof headers !== 'object') return [];
  return Object.entries(headers).filter(([, value]) => value !== undefined && value !== null);
}

function lower(value) {
  return String(value).toLowerCase();
}

function stripBrackets(hostname) {
  return String(hostname || '').replace(/^\[/, '').replace(/\]$/, '');
}

export function isLoopbackHostname(hostname) {
  return LOOPBACK_HOSTNAMES.includes(stripBrackets(lower(hostname)));
}

/** 解析 Host 头（"127.0.0.1:47821" / "localhost:47821"）；非法返回 null */
export function parseHostHeader(hostHeader) {
  if (typeof hostHeader !== 'string' || hostHeader.trim() === '') return null;
  let url;
  try {
    url = new URL('http://' + hostHeader.trim());
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  const hostname = stripBrackets(url.hostname);
  const port = url.port === '' ? 80 : Number(url.port);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return { hostname, port };
}

/**
 * Host 白名单校验（DNS rebinding 防护）：只允许 loopback 主机名 + 本地固定端口。
 * expectedPort 可传 number / () => number（端口 0 或未知时只校验主机名，供单测使用）。
 */
export function isAllowedHost(hostHeader, expectedPort = null) {
  const parsed = parseHostHeader(hostHeader);
  if (!parsed) return false;
  if (!isLoopbackHostname(parsed.hostname)) return false;
  const expected = typeof expectedPort === 'function' ? expectedPort() : expectedPort;
  const want = expected == null ? 0 : Number(expected);
  if (!Number.isFinite(want) || want <= 0) return true;
  return parsed.port === want;
}

/**
 * 入站 Origin 校验（F1）：无 Origin（导航/同源 GET）放行；有 Origin 时必须严格等于本地 origin
 * （http://127.0.0.1:<port>），否则拒绝（HTTP 403 / WS 403）。HTTP 与 WS upgrade 同一规则。
 */
export function isAllowedOrigin(originHeader, expectedOrigin) {
  if (originHeader === undefined || originHeader === null || originHeader === '') return true;
  if (typeof originHeader !== 'string') return false;
  if (typeof expectedOrigin !== 'string' || expectedOrigin === '') return false;
  return originHeader.trim() === expectedOrigin;
}

export function isHopByHopHeader(name) {
  return HOP_BY_HOP.has(lower(name || '').trim());
}

function filterForwardableHeaders(headers, { keepUpgrade = false } = {}) {
  const out = {};
  for (const [rawName, value] of headerEntries(headers)) {
    const name = lower(rawName);
    if (FORWARDED.has(name)) continue;
    if (HOP_BY_HOP.has(name) && !(keepUpgrade && (name === 'connection' || name === 'upgrade'))) continue;
    if (DROP_ON_FORWARD.has(name)) continue;
    out[name] = value;
  }
  return out;
}

/** 普通 HTTP 反代请求头：Host 重写远端；去本地 Origin/Referer；不伪造 XFF */
export function buildForwardHeaders(incomingHeaders, { targetHost } = {}) {
  const headers = filterForwardableHeaders(incomingHeaders);
  headers.host = String(targetHost);
  return headers;
}

/** WebSocket upgrade 请求头：保留 Sec-WebSocket-*，显式 Connection/Upgrade */
export function buildUpgradeHeaders(incomingHeaders, { targetHost } = {}) {
  const headers = filterForwardableHeaders(incomingHeaders, { keepUpgrade: true });
  headers.host = String(targetHost);
  headers.connection = 'Upgrade';
  headers.upgrade = 'websocket';
  return headers;
}

/** 上游响应头：只剥离 hop-by-hop（其余透传，含 set-cookie） */
export function buildResponseHeaders(upstreamHeaders) {
  const out = {};
  for (const [rawName, value] of headerEntries(upstreamHeaders)) {
    const name = lower(rawName);
    if (HOP_BY_HOP.has(name)) continue;
    out[name] = value;
  }
  return out;
}

export function isWebSocketUpgrade(headers) {
  if (!headers || typeof headers !== 'object') return false;
  const connection = lower(headers.connection || headers.Connection || '');
  const upgrade = lower(headers.upgrade || headers.Upgrade || '');
  return connection.split(',').map((item) => item.trim()).includes('upgrade') && upgrade === 'websocket';
}

/** 序列化原始 HTTP 响应头（把上游 101/非 101 直接写回客户端 socket） */
export function serializeUpgradeResponse(statusCode, statusMessage, headers) {
  const code = Number(statusCode) || 502;
  const reason = String(statusMessage || (code === 101 ? 'Switching Protocols' : '')).trim();
  const lines = ['HTTP/1.1 ' + code + (reason ? ' ' + reason : '')];
  for (const [rawName, value] of headerEntries(headers)) {
    const name = lower(rawName);
    if (name === 'transfer-encoding') continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) lines.push(name + ': ' + String(item));
  }
  return lines.join('\r\n') + '\r\n\r\n';
}
