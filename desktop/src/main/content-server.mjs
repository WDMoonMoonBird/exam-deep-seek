/**
 * content-server.mjs —— 本地 loopback 静态内容服务（node:http；不依赖 Electron，可在 node 下单测）。
 *
 * 职责（计划 §2.3）：只绑 127.0.0.1 + 固定端口；服务 dist-desktop 静态文件 + SPA fallback；
 * 所有响应下发等价 CSP/安全头；/exam/api/** 与 /exam/socket.io/** 交给注入的 proxy。
 * 明确不做：不监听非 loopback 地址、不读用户目录、不实现业务接口、不做任意目标代理。
 * 依赖方向（A 基线 §3.2）：content-server → path-safety + csp + static-assets；不 import proxy。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {
  APP_BASE, INDEX_FILE, NOT_FOUND_PAGE,
  classifyRequestPath, normalizeRequestUrl, safeResolve, staticRelativePath,
} from './path-safety.mjs';
import { buildSecurityHeaders, resolveCspMode } from './csp.mjs';
import { isAllowedHost, isAllowedOrigin } from './proxy-headers.mjs';
import { CACHE_NO_STORE, cacheControlFor, createFileResponder } from './static-assets.mjs';

const LOOPBACK = '127.0.0.1';
/** 与 config.mjs 的 DEFAULT_PORT 同值（共享常量各自持有，避免叶模块互相依赖） */
const DEFAULT_PORT = 47821;
const READ_METHODS = new Set(['GET', 'HEAD']);
/** 内容服务默认 enforce（与 Web 端 nginx 一致）；仅当显式配置 env.CSP_MODE 时走 report-only/off（F2） */
const CONTENT_SERVER_DEFAULT_CSP_MODE = 'enforce';
/** 显式长请求/上传超时（50MB 慢网/长轮询；不套用 Node 默认 5 分钟，F3） */
export const REQUEST_TIMEOUT_MS = 15 * 60 * 1000;
/** 请求头超时：保持合理值（远小于 requestTimeout） */
export const HEADERS_TIMEOUT_MS = 60 * 1000;

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

/**
 * 请求处理工厂（依赖注入：rootDir/proxy/fs 可替换，node --test 不必起 Electron）。
 * expectedPort 支持 number 或 () => number（端口 0/未知时只校验 loopback 主机名）。
 */
export function createRequestHandler({
  rootDir,
  proxy = null,
  cspMode = CONTENT_SERVER_DEFAULT_CSP_MODE,
  cspReportUri = '',
  expectedPort = null,
  log = null,
  fsImpl = fs,
} = {}) {
  if (typeof rootDir !== 'string' || rootDir === '') throw new TypeError('createRequestHandler: rootDir 必填');
  const securityHeaders = buildSecurityHeaders({ cspMode, cspReportUri });
  const sendFile = createFileResponder({ fsImpl });
  const indexFile = path.join(rootDir, INDEX_FILE);
  const notFoundFile = path.join(rootDir, NOT_FOUND_PAGE);

  /** 当前本地 origin（端口由 startContentServer 在 listen 后回填；未知端口时返回 null ⇒ 有 Origin 即拒绝） */
  function currentLocalOrigin() {
    const port = typeof expectedPort === 'function' ? expectedPort() : expectedPort;
    return Number(port) > 0 ? 'http://' + LOOPBACK + ':' + Number(port) : null;
  }

  function sendPlain(res, status, text) {
    res.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
      'Cache-Control': CACHE_NO_STORE,
    });
    res.end(text);
  }

  function sendNotFound(req, res) {
    if (sendFile(req, res, notFoundFile, { status: 404, cacheControl: CACHE_NO_STORE })) return;
    sendPlain(res, 404, '404 Not Found');
  }

  function serveSpa(req, res) {
    if (sendFile(req, res, indexFile, { status: 200, cacheControl: CACHE_NO_STORE })) return;
    sendPlain(res, 500, 'dist-desktop 缺少 index.html：请先运行 node desktop/scripts/build-dist.mjs（需要 client/dist）');
  }

  function delegateProxy(req, res) {
    if (!proxy || typeof proxy.handleHttp !== 'function') {
      sendJson(res, 502, { code: 1502, message: '未配置远端服务器（config.json.serverUrl）' });
      return;
    }
    try {
      proxy.handleHttp(req, res);
    } catch (err) {
      if (log && typeof log.error === 'function') log.error('[content-server] 反代异常：' + ((err && err.message) || err));
      if (!res.headersSent) sendJson(res, 502, { code: 1502, message: '服务器连接失败' });
      else res.destroy();
    }
  }

  return async function handleRequest(req, res) {
    for (const [name, value] of securityHeaders) res.setHeader(name, value);

    // Host 白名单（DNS rebinding 防护）：只接受 loopback + 当前固定端口
    if (!isAllowedHost(req.headers.host, expectedPort)) {
      sendPlain(res, 400, '仅接受本机 loopback Host');
      return;
    }

    // Origin 校验（F1）：有 Origin 时必须严格等于本地服务 origin，否则 403（无 Origin 放行）
    if (!isAllowedOrigin(req.headers.origin, currentLocalOrigin())) {
      sendPlain(res, 403, 'Origin 不在允许范围');
      return;
    }

    const normalized = normalizeRequestUrl(req.url);
    if (!normalized.ok) {
      sendPlain(res, normalized.status || 400, normalized.reason || 'Bad Request');
      return;
    }

    const route = classifyRequestPath(normalized.pathname);

    if (route.type === 'redirect') {
      const location = (route.location || APP_BASE) + normalized.search;
      const body = 'Redirecting to ' + location;
      res.writeHead(route.status || 301, {
        Location: location,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': CACHE_NO_STORE,
      });
      res.end(body);
      return;
    }

    if (route.type === 'proxy-http') {
      delegateProxy(req, res);
      return;
    }

    if (!READ_METHODS.has(req.method)) {
      res.writeHead(405, {
        Allow: 'GET, HEAD',
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': CACHE_NO_STORE,
      });
      res.end('Method Not Allowed');
      return;
    }

    if (route.type === 'spa') {
      serveSpa(req, res);
      return;
    }

    if (route.type === 'static') {
      const relative = staticRelativePath(normalized.pathname);
      const target = relative == null ? null : safeResolve(rootDir, relative);
      if (target && sendFile(req, res, target, { status: 200, cacheControl: cacheControlFor(normalized.pathname) })) return;
      sendNotFound(req, res);
      return;
    }

    sendNotFound(req, res);
  };
}

/**
 * 启动本地内容服务：**只绑 127.0.0.1**（不提供 host 参数，避免误绑到其它地址）。
 * port 支持 0（随机端口，供测试）；返回 { server, port, origin, url, close }。
 * 端口被占用时 reject（调用方明确提示，不静默换端口）。
 */
export async function startContentServer({
  rootDir,
  port = DEFAULT_PORT,
  proxy = null,
  cspMode = undefined,
  env = process.env,
  log = null,
  fsImpl = fs,
} = {}) {
  if (typeof rootDir !== 'string' || rootDir === '') throw new TypeError('startContentServer: rootDir 必填');
  let boundPort = Number(port);
  // F2：默认 enforce（与 Web 文档一致）；仅当显式配置 CSP_MODE 时才按其值（report-only/off）
  const configuredMode = String((env && env.CSP_MODE) || '').trim();
  const mode = cspMode !== undefined
    ? cspMode
    : (configuredMode ? resolveCspMode(env, { warn: log }) : CONTENT_SERVER_DEFAULT_CSP_MODE);
  const cspReportUri = String((env && env.CSP_REPORT_URI) || '').trim();
  const handler = createRequestHandler({
    rootDir,
    proxy,
    cspMode: mode,
    cspReportUri,
    expectedPort: () => boundPort,
    log,
    fsImpl,
  });

  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      if (log && typeof log.error === 'function') log.error('[content-server] 未捕获异常：' + ((err && err.message) || err));
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Internal Server Error');
      } else {
        res.destroy();
      }
    });
  });

  // ★WS 连接在 upgrade 后脱离 HTTP server 的连接管理：必须自行跟踪并在关闭时销毁，否则 close() 永久挂起
  const upgradedSockets = new Set();
  server.on('upgrade', (req, socket, head) => {
    upgradedSockets.add(socket);
    socket.on('close', () => upgradedSockets.delete(socket));
    // Origin 校验与 HTTP 同规则（F1）：有 Origin 时必须等于本地 origin，否则 403
    const localOrigin = boundPort > 0 ? 'http://' + LOOPBACK + ':' + boundPort : null;
    if (!isAllowedOrigin(req.headers.origin, localOrigin)) {
      try { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); } catch { socket.destroy(); }
      return;
    }
    const allowed = isAllowedHost(req.headers.host, () => boundPort);
    if (!allowed || !proxy || typeof proxy.handleUpgrade !== 'function') {
      try { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); } catch { socket.destroy(); }
      return;
    }
    try {
      proxy.handleUpgrade(req, socket, head);
    } catch (err) {
      if (log && typeof log.error === 'function') log.error('[content-server] upgrade 异常：' + ((err && err.message) || err));
      socket.destroy();
    }
  });

  server.keepAliveTimeout = 5000;
  // F3：显式长超时（请求/上传/长轮询），避免慢网 50MB 上传被 Node 默认 5 分钟掐断
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;

  await new Promise((resolve, reject) => {
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(boundPort, LOOPBACK);
  });

  const address = server.address();
  boundPort = address && typeof address === 'object' ? address.port : boundPort;
  server.on('error', (err) => {
    if (log && typeof log.error === 'function') log.error('[content-server] server error：' + ((err && err.message) || err));
  });

  const origin = 'http://' + LOOPBACK + ':' + boundPort;
  const handle = {
    server,
    port: boundPort,
    origin,
    url: origin + APP_BASE,
    async close() {
      const closed = new Promise((resolve) => server.close(() => resolve()));
      for (const socket of upgradedSockets) {
        try { socket.destroy(); } catch { /* ignore */ }
      }
      upgradedSockets.clear();
      if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await closed;
    },
  };
  return handle;
}

/** 停止本地内容服务（显式 stop 供测试/组合根使用；等价于 handle.close()） */
export async function stopContentServer(handle) {
  if (!handle || typeof handle.close !== 'function') return;
  await handle.close();
}

/** 别名：start/stop（A 基线 §5-C9 与 C 测试约定） */
export const start = startContentServer;
export const stop = stopContentServer;
