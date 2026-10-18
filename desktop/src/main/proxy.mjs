/**
 * proxy.mjs —— 固定远端服务器的同源反代（node:http/https；不依赖 Electron，可注入 transport 单测）。
 *
 * 只代理两个前缀（计划 §2.3；前缀白名单是常量，**请求内无法改变目标**）：
 *   · /exam/api/**        HTTP，stream.pipeline 流式转发（50MB zip 上传不进内存）
 *   · /exam/socket.io/**  polling 走 HTTP + WebSocket upgrade（不缓冲）
 * 安全（计划 §7.2）：TLS 用 Node 默认信任链（可注入内网 CA，证书校验不可关闭）；不伪造 XFF；
 * 去本地 Origin/Referer；Host 重写为远端；/exam/api/internal/** 一律 404；不自动跟随远端重定向。
 * 超时：默认 10 分钟空闲超时（显式长超时，避免 50MB 上传/长轮询被短超时打断）；0 = 关闭。
 * 依赖方向（A 基线 §3.2）：proxy → proxy-headers；不 import content-server / path-safety。
 */
import http from 'node:http';
import https from 'node:https';
import { pipeline } from 'node:stream';
import {
  buildForwardHeaders, buildResponseHeaders, buildUpgradeHeaders, serializeUpgradeResponse,
} from './proxy-headers.mjs';

/** 反代白名单前缀（纯常量；只允许这两个前缀，且内部回调端点永久封禁） */
export const API_PREFIX = '/exam/api';
export const SOCKET_PREFIX = '/exam/socket.io';
const FORBIDDEN_API_PREFIX = API_PREFIX + '/internal';
/** 默认空闲超时：10 分钟（显式长超时；0 表示不设） */
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function matchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

/** 反代 HTTP 白名单（纯函数，单测用） */
export function isForwardableHttpPath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return false;
  if (matchesPrefix(pathname, FORBIDDEN_API_PREFIX)) return false;
  return matchesPrefix(pathname, API_PREFIX) || matchesPrefix(pathname, SOCKET_PREFIX);
}

/** WebSocket upgrade 白名单（纯函数，单测用） */
export function isSocketUpgradePath(pathname) {
  return typeof pathname === 'string' && matchesPrefix(pathname, SOCKET_PREFIX);
}

/**
 * 解析请求目标并拒绝异常路径：返回 { pathname(解码后), rawTarget(原始编码路径+查询) } 或 null。
 * 上游始终使用固定 serverUrl + 原始 request-target，请求方无法把目标改成别的主机。
 */
export function parseRequestTarget(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl === '') return null;
  let url;
  try {
    url = new URL(rawUrl, 'http://127.0.0.1');
  } catch {
    return null;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (/[\u0000-\u001f\u007f\\]/.test(decoded)) return null;
  if (decoded.split('/').some((segment) => segment === '..')) return null;
  return { pathname: decoded.replace(/\/{2,}/g, '/'), rawTarget: rawUrl };
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function rejectSocket(socket, statusCode, reason) {
  try {
    socket.end('HTTP/1.1 ' + statusCode + ' ' + reason + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  } catch {
    try { socket.destroy(); } catch { /* ignore */ }
  }
}

/**
 * 创建反代实例。
 * @param {{ serverUrl: string, log?: object|null, timeoutMs?: number, tlsCa?: string|null, transport?: object|null }} options
 * transport 仅用于单测注入（默认按 serverUrl 协议选 http/https）。
 */
export function createProxy({ serverUrl, log = null, timeoutMs = DEFAULT_TIMEOUT_MS, tlsCa = null, transport = null } = {}) {
  const target = new URL(String(serverUrl || ''));
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new TypeError('createProxy: serverUrl 只接受 http/https');
  }
  if (target.username || target.password || target.search || target.hash) {
    throw new TypeError('createProxy: serverUrl 不允许凭证/查询串/锚点');
  }
  if (target.pathname !== '/' && target.pathname !== '') {
    throw new TypeError('createProxy: serverUrl 必须是纯 origin（不能带路径）');
  }

  const isSecure = target.protocol === 'https:';
  const netTransport = transport || (isSecure ? https : http);
  const targetHost = target.host;
  const hostname = target.hostname.replace(/^\[/, '').replace(/\]$/, '');
  const idleTimeoutMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : 0;
  const agent = typeof netTransport.Agent === 'function'
    ? new netTransport.Agent({ keepAlive: true, maxSockets: 32 })
    : null;
  const pending = new Set();
  /** WS 升级后的 { clientSocket, upstreamSocket }：升级后 socket 脱离 HTTP 管理，close() 必须显式销毁 */
  const upgradedSockets = new Set();
  let closed = false;

  function trackUpgradePair(clientSocket, upstreamSocket) {
    const pair = { clientSocket, upstreamSocket };
    upgradedSockets.add(pair);
    const untrack = () => upgradedSockets.delete(pair);
    clientSocket.on('close', untrack);
    upstreamSocket.on('close', untrack);
  }

  function requestOptions(pathValue, headers, method, { useAgent = true } = {}) {
    const options = {
      protocol: target.protocol,
      hostname,
      method,
      path: pathValue,
      headers,
    };
    if (target.port) options.port = Number(target.port);
    options.agent = useAgent && agent ? agent : false;
    if (isSecure && tlsCa) options.ca = tlsCa;
    return options;
  }

  /** 普通 HTTP 反代（stream.pipeline：请求体/响应体都不进内存，客户端中断会向后传播） */
  function handleHttp(req, res) {
    if (closed) {
      sendJson(res, 503, { code: 1503, message: '桌面壳正在退出' });
      return;
    }
    const parsed = parseRequestTarget(req.url);
    if (!parsed || !isForwardableHttpPath(parsed.pathname)) {
      sendJson(res, 404, { code: 1404, message: '路径不在反代白名单' });
      return;
    }

    const headers = buildForwardHeaders(req.headers, { targetHost });
    let upstream;
    try {
      upstream = netTransport.request(requestOptions(parsed.rawTarget, headers, req.method), (upstreamRes) => {
        const status = Number(upstreamRes.statusCode) || 502;
        try {
          res.writeHead(status, buildResponseHeaders(upstreamRes.headers));
        } catch {
          upstreamRes.destroy();
          res.destroy();
          return;
        }
        pipeline(upstreamRes, res, () => { /* 客户端中断/上游结束：静默清理 */ });
      });
    } catch (err) {
      if (log && typeof log.error === 'function') log.error('[proxy] 创建上游请求失败：' + ((err && err.message) || err));
      sendJson(res, 502, { code: 1502, message: '服务器连接失败' });
      return;
    }

    pending.add(upstream);
    upstream.on('close', () => pending.delete(upstream));
    upstream.on('error', (err) => {
      if (log && typeof log.warn === 'function') log.warn('[proxy] 上游错误：' + ((err && err.message) || err));
      if (!res.headersSent) sendJson(res, 502, { code: 1502, message: '服务器连接失败' });
      else res.destroy();
    });
    if (idleTimeoutMs > 0) {
      upstream.setTimeout(idleTimeoutMs, () => {
        upstream.destroy(new Error('upstream-timeout'));
        if (!res.headersSent) sendJson(res, 504, { code: 1504, message: '服务器响应超时' });
        else res.destroy();
      });
    }
    req.on('error', () => upstream.destroy());
    pipeline(req, upstream, () => { /* 上传中断/上游关闭：交给 error/close 监听清理 */ });
  }

  /** WebSocket upgrade 反代（不缓冲；非 101 响应原样写回后关闭） */
  function handleUpgrade(req, socket, head) {
    if (closed) {
      rejectSocket(socket, 503, 'Service Unavailable');
      return;
    }
    const parsed = parseRequestTarget(req.url);
    if (!parsed || !isSocketUpgradePath(parsed.pathname)) {
      rejectSocket(socket, 404, 'Not Found');
      return;
    }

    const headers = buildUpgradeHeaders(req.headers, { targetHost });
    let upstream;
    try {
      upstream = netTransport.request(requestOptions(parsed.rawTarget, headers, 'GET', { useAgent: false }));
    } catch (err) {
      if (log && typeof log.error === 'function') log.error('[proxy] 创建 WS 上游失败：' + ((err && err.message) || err));
      rejectSocket(socket, 502, 'Bad Gateway');
      return;
    }

    pending.add(upstream);

    upstream.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
      pending.delete(upstream);
      try {
        socket.write(serializeUpgradeResponse(upstreamRes.statusCode, upstreamRes.statusMessage, upstreamRes.headers));
        if (upstreamHead && upstreamHead.length > 0) socket.write(upstreamHead);
        if (head && head.length > 0) upstreamSocket.write(head);
      } catch {
        try { socket.destroy(); } catch { /* ignore */ }
        try { upstreamSocket.destroy(); } catch { /* ignore */ }
        return;
      }
      trackUpgradePair(socket, upstreamSocket);
      upstreamSocket.pipe(socket);
      socket.pipe(upstreamSocket);
      const teardown = () => {
        try { socket.destroy(); } catch { /* ignore */ }
        try { upstreamSocket.destroy(); } catch { /* ignore */ }
      };
      socket.on('error', teardown);
      upstreamSocket.on('error', teardown);
      socket.on('close', () => { try { upstreamSocket.destroy(); } catch { /* ignore */ } });
      upstreamSocket.on('close', () => { try { socket.destroy(); } catch { /* ignore */ } });
    });

    upstream.on('response', (upstreamRes) => {
      pending.delete(upstream);
      try {
        socket.write(serializeUpgradeResponse(upstreamRes.statusCode, upstreamRes.statusMessage, upstreamRes.headers));
      } catch {
        /* 写回失败则走 close 清场 */
      }
      upstreamRes.pipe(socket);
      upstreamRes.on('error', () => {
        try { socket.destroy(); } catch { /* ignore */ }
      });
      upstreamRes.on('end', () => {
        try { socket.end(); } catch { /* ignore */ }
      });
    });

    upstream.on('error', (err) => {
      if (log && typeof log.warn === 'function') log.warn('[proxy] WS 上游错误：' + ((err && err.message) || err));
      rejectSocket(socket, 502, 'Bad Gateway');
    });

    upstream.end();
  }

  async function close() {
    closed = true;
    for (const upstream of pending) {
      try { upstream.destroy(); } catch { /* ignore */ }
    }
    pending.clear();
    for (const pair of upgradedSockets) {
      try { pair.clientSocket.destroy(); } catch { /* ignore */ }
      try { pair.upstreamSocket.destroy(); } catch { /* ignore */ }
    }
    upgradedSockets.clear();
    try { if (agent) agent.destroy(); } catch { /* ignore */ }
  }

  return {
    targetOrigin: target.origin,
    targetHost,
    handleHttp,
    handleUpgrade,
    close,
  };
}
