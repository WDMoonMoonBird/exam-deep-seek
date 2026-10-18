/**
 * content-server.test.mjs —— 本地 loopback 内容服务集成测试（任务 T4，计划 §2.3/§7.2）。
 * 覆盖：/exam 301、SPA fallback、静态资源 MIME/缓存、未知 404、CSP(默认 enforce)、Host/Origin 校验、
 *       穿越 400、*.map 404、显式超时、API/WS 委托、127.0.0.1:0 启停与端口释放。
 *       T6 回归已按 D/T7 F1-F4 批准后的行为更新。仅临时目录 + loopback，不访问生产网络。
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  cleanupTempDirs, httpRequest, makeTempDir, rawUpgradeRequest, writeFiles,
} from './helpers.mjs';
import {
  HEADERS_TIMEOUT_MS, REQUEST_TIMEOUT_MS, start, startContentServer, stop, stopContentServer,
} from '../src/main/content-server.mjs';
import { CACHE_LONG, CACHE_MONACO, CACHE_NO_STORE } from '../src/main/static-assets.mjs';
import { buildCspDirectives, serializeCspDirectives } from '../src/main/csp.mjs';

after(cleanupTempDirs);

function makeDistFixture() {
  const root = makeTempDir('desktop-content-');
  writeFiles(root, {
    'index.html': '<!doctype html><html><body>APP-SHELL</body></html>',
    'assets/app-abc123.js': 'console.log("app");',
    'assets/app-abc123.js.map': '{"version":3,"sources":["app.js"]}',
    'assets/app-abc123.css': 'body{color:red}',
    'monaco/vs/loader.js': '/* modern monaco */',
    'error-pages/404.html': '<h1>404 custom</h1>',
  });
  return root;
}

async function withServer(options, callback) {
  const handle = await startContentServer({ port: 0, env: {}, ...options });
  try {
    return await callback(handle);
  } finally {
    await stopContentServer(handle);
  }
}

test('start/stop 别名与绑定：只绑 127.0.0.1、端口随机可用、url 指向 /exam/', async () => {
  assert.equal(start, startContentServer);
  assert.equal(stop, stopContentServer);
  assert.doesNotThrow(() => stopContentServer(null));

  const root = makeDistFixture();
  await withServer({ rootDir: root }, async (server) => {
    const address = server.server.address();
    assert.equal(address.address, '127.0.0.1');
    assert.equal(address.port, server.port);
    assert.ok(server.port > 0);
    assert.equal(server.origin, 'http://127.0.0.1:' + server.port);
    assert.equal(server.url, server.origin + '/exam/');
  });
});

test('301：/ 与 /exam 都跳到 /exam/，保留查询串', async () => {
  const root = makeDistFixture();
  await withServer({ rootDir: root }, async (server) => {
    const root301 = await httpRequest(server.port, '/');
    assert.equal(root301.status, 301);
    assert.equal(root301.headers.location, '/exam/');

    const bare = await httpRequest(server.port, '/exam');
    assert.equal(bare.status, 301);
    assert.equal(bare.headers.location, '/exam/');

    const withQuery = await httpRequest(server.port, '/exam?a=1');
    assert.equal(withQuery.status, 301);
    assert.equal(withQuery.headers.location, '/exam/?a=1');
  });
});

test('SPA fallback：/exam/、精确白名单、前缀白名单深链都回 index.html（no-store）', async () => {
  const root = makeDistFixture();
  await withServer({ rootDir: root }, async (server) => {
    for (const pathname of ['/exam/', '/exam/login', '/exam/change-password', '/exam/doc',
      '/exam/teacher/course/1', '/exam/student', '/exam/admin/users', '/exam/m/x']) {
      const response = await httpRequest(server.port, pathname);
      assert.equal(response.status, 200, pathname);
      assert.match(response.body, /APP-SHELL/, pathname);
      assert.equal(response.headers['content-type'], 'text/html; charset=utf-8', pathname);
      assert.equal(response.headers['cache-control'], CACHE_NO_STORE, pathname);
    }
  });
});

test('安全响应头：默认 CSP enforce（F2，与 Web 一致）+ 指令串等价 + nosniff/XFO/Referrer/HSTS/Robots', async () => {
  const root = makeDistFixture();
  await withServer({ rootDir: root }, async (server) => {
    const response = await httpRequest(server.port, '/exam/');
    const csp = response.headers['content-security-policy'];
    assert.equal(typeof csp, 'string', '默认应为 Content-Security-Policy（enforce）');
    assert.equal('content-security-policy-report-only' in response.headers, false);
    // 指令串与 csp.mjs 单一真源逐字等价（A/T3 已对 nginx map 程序化比对相等）
    assert.equal(csp, serializeCspDirectives(buildCspDirectives()));
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /connect-src 'self' ws: wss:/);
    assert.equal(csp.split(';').some((directive) => directive.includes('*')), false);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN');
    assert.equal(response.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.equal(response.headers['strict-transport-security'], 'max-age=31536000; includeSubDomains');
    assert.equal(response.headers['x-robots-tag'], 'noindex');

    const notFound = await httpRequest(server.port, '/exam/unknown');
    assert.equal(typeof notFound.headers['content-security-policy'], 'string');
  });
});

test('静态资源：MIME、hashed 长缓存、monaco 中缓存、HEAD 无 body', async () => {
  const root = makeDistFixture();
  await withServer({ rootDir: root }, async (server) => {
    const js = await httpRequest(server.port, '/exam/assets/app-abc123.js');
    assert.equal(js.status, 200);
    assert.equal(js.headers['content-type'], 'text/javascript; charset=utf-8');
    assert.equal(js.headers['cache-control'], CACHE_LONG);
    assert.equal(js.body, 'console.log("app");');

    const css = await httpRequest(server.port, '/exam/assets/app-abc123.css');
    assert.equal(css.status, 200);
    assert.equal(css.headers['content-type'], 'text/css; charset=utf-8');

    const monaco = await httpRequest(server.port, '/exam/monaco/vs/loader.js');
    assert.equal(monaco.status, 200);
    assert.equal(monaco.headers['cache-control'], CACHE_MONACO);

    const head = await httpRequest(server.port, '/exam/assets/app-abc123.js', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.equal(head.headers['content-type'], 'text/javascript; charset=utf-8');
  });
});

test('404：未知路径与缺失静态文件都回 error-pages/404.html（no-store）', async () => {
  const root = makeDistFixture();
  await withServer({ rootDir: root }, async (server) => {
    for (const pathname of ['/exam/unknown', '/exam/unknown/deep/path', '/exam/assets/missing.js']) {
      const response = await httpRequest(server.port, pathname);
      assert.equal(response.status, 404, pathname);
      assert.match(response.body, /404 custom/, pathname);
      assert.equal(response.headers['content-type'], 'text/html; charset=utf-8', pathname);
      assert.equal(response.headers['cache-control'], CACHE_NO_STORE, pathname);
    }
  });
});

test('缺 index.html：SPA 路由 500 明确提示先 build-dist；404 页仍可用', async () => {
  const root = makeTempDir('desktop-content-noidx-');
  writeFiles(root, { 'error-pages/404.html': '<h1>404 only</h1>' });
  await withServer({ rootDir: root }, async (server) => {
    const spa = await httpRequest(server.port, '/exam/');
    assert.equal(spa.status, 500);
    assert.match(spa.body, /build-dist/);

    const notFound = await httpRequest(server.port, '/exam/unknown');
    assert.equal(notFound.status, 404);
    assert.match(notFound.body, /404 only/);
  });
});

test('API 委托：未配置 proxy ⇒ 502；内部端点 ⇒ 404；socket.io polling ⇒ 502', async () => {
  const root = makeDistFixture();
  await withServer({ rootDir: root }, async (server) => {
    const api = await httpRequest(server.port, '/exam/api/ping');
    assert.equal(api.status, 502);
    assert.equal(JSON.parse(api.body).code, 1502);

    const internal = await httpRequest(server.port, '/exam/api/internal/health');
    assert.equal(internal.status, 404);
    assert.match(internal.body, /404 custom/);

    const socket = await httpRequest(server.port, '/exam/socket.io/?EIO=4&transport=polling');
    assert.equal(socket.status, 502);
  });
});

test('方法限制：非 GET/HEAD 的静态/SPA 请求回 405 Allow: GET, HEAD', async () => {
  const root = makeDistFixture();
  await withServer({ rootDir: root }, async (server) => {
    const post = await httpRequest(server.port, '/exam/', { method: 'POST' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, 'GET, HEAD');
    const put = await httpRequest(server.port, '/exam/login', { method: 'PUT' });
    assert.equal(put.status, 405);
  });
});

test('Host 校验：站外 Host / 错误端口一律 400（DNS rebinding 防护）', async () => {
  const root = makeDistFixture();
  await withServer({ rootDir: root }, async (server) => {
    const evil = await httpRequest(server.port, '/exam/', { headers: { host: 'evil.example.com' } });
    assert.equal(evil.status, 400);
    assert.match(evil.body, /loopback Host/);

    const wrongPort = await httpRequest(server.port, '/exam/', { headers: { host: '127.0.0.1:1' } });
    assert.equal(wrongPort.status, 400);
  });
});

test('路径安全：编码穿越/非法编码/非 path 目标一律 400', async () => {
  const root = makeDistFixture();
  await withServer({ rootDir: root }, async (server) => {
    const traversal = await httpRequest(server.port, '/exam/%2e%2e/etc/passwd');
    assert.equal(traversal.status, 400);
    assert.match(traversal.body, /目录穿越/);

    const plainTraversal = await httpRequest(server.port, '/exam/../secret');
    assert.equal(plainTraversal.status, 400);

    const badEncoding = await httpRequest(server.port, '/exam/%zz');
    assert.equal(badEncoding.status, 400);
    assert.match(badEncoding.body, /编码非法/);
  });
});

test('CSP 模式覆盖（F2）：CSP_MODE=report-only 可回退；off 不下发；非法值回落 report-only', async () => {
  const root = makeDistFixture();
  await withServer({ rootDir: root, env: { CSP_MODE: 'report-only' } }, async (server) => {
    const response = await httpRequest(server.port, '/exam/');
    assert.equal(typeof response.headers['content-security-policy-report-only'], 'string');
    assert.equal('content-security-policy' in response.headers, false);
  });
  await withServer({ rootDir: root, env: { CSP_MODE: 'off' } }, async (server) => {
    const response = await httpRequest(server.port, '/exam/');
    assert.equal('content-security-policy' in response.headers, false);
    assert.equal('content-security-policy-report-only' in response.headers, false);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
  });
  await withServer({ rootDir: root, env: { CSP_MODE: 'nonsense' } }, async (server) => {
    const response = await httpRequest(server.port, '/exam/');
    assert.equal(typeof response.headers['content-security-policy-report-only'], 'string');
  });
});

test('API 委托：注入 proxy 后 /exam/api 转发；内部端点仍 404 不代理', async () => {
  const root = makeDistFixture();
  const proxied = [];
  const fakeProxy = {
    handleHttp(req, res) {
      proxied.push(req.url);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end('{"proxied":true}');
    },
  };
  await withServer({ rootDir: root, proxy: fakeProxy }, async (server) => {
    const response = await httpRequest(server.port, '/exam/api/users?page=1');
    assert.equal(response.status, 200);
    assert.equal(response.body, '{"proxied":true}');
    assert.deepEqual(proxied, ['/exam/api/users?page=1']);

    const internal = await httpRequest(server.port, '/exam/api/internal/health');
    assert.equal(internal.status, 404);
    assert.deepEqual(proxied, ['/exam/api/users?page=1']);
  });
});

test('WS upgrade：无 proxy ⇒ 403；有 proxy.handleUpgrade ⇒ 委托并写回 101', async () => {
  const root = makeDistFixture();
  await withServer({ rootDir: root }, async (server) => {
    const raw = await rawUpgradeRequest(server.port, '/exam/socket.io/?EIO=4&transport=websocket', {
      extraHeaders: { Connection: 'Upgrade', Upgrade: 'websocket' },
    });
    assert.match(raw, /^HTTP\/1\.1 403/);
  });

  const upgraded = [];
  const fakeProxy = {
    handleHttp() { throw new Error('本用例只测 upgrade'); },
    handleUpgrade(req, socket) {
      upgraded.push(req.url);
      socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
      socket.end();
    },
  };
  await withServer({ rootDir: root, proxy: fakeProxy }, async (server) => {
    const raw = await rawUpgradeRequest(server.port, '/exam/socket.io/?EIO=4&transport=websocket', {
      extraHeaders: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' },
    });
    assert.match(raw, /^HTTP\/1\.1 101/);
    assert.deepEqual(upgraded, ['/exam/socket.io/?EIO=4&transport=websocket']);
  });
});

test('超时显式配置（F3）：requestTimeout=15min、headersTimeout=60s、keepAlive 5s', async () => {
  assert.equal(REQUEST_TIMEOUT_MS, 15 * 60 * 1000);
  assert.equal(HEADERS_TIMEOUT_MS, 60 * 1000);
  await withServer({ rootDir: makeDistFixture() }, async (server) => {
    assert.equal(server.server.requestTimeout, 900000);
    assert.equal(server.server.headersTimeout, 60000);
    assert.equal(server.server.keepAliveTimeout, 5000);
  });
});

test('source map 永不外发（F4）：文件存在也回 404（与 nginx 口径一致）', async () => {
  const root = makeDistFixture();
  assert.equal(fs.existsSync(path.join(root, 'assets/app-abc123.js.map')), true, 'fixture 应含 .map 文件');
  await withServer({ rootDir: root }, async (server) => {
    for (const pathname of ['/exam/assets/app-abc123.js.map', '/exam/assets/app-abc123.js.MAP']) {
      const response = await httpRequest(server.port, pathname);
      assert.equal(response.status, 404, pathname);
      assert.match(response.body, /404 custom/, pathname);
    }
  });
});

test('Origin 校验（F1）：evil Origin 的文档/API ⇒ 403；本地 Origin/无 Origin ⇒ 200', async () => {
  const root = makeDistFixture();
  const proxied = [];
  const fakeProxy = {
    handleHttp(req, res) {
      proxied.push(req.url);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end('{"proxied":true}');
    },
  };
  await withServer({ rootDir: root, proxy: fakeProxy }, async (server) => {
    const localOrigin = 'http://127.0.0.1:' + server.port;
    const evilDoc = await httpRequest(server.port, '/exam/', { headers: { origin: 'https://evil.example.com' } });
    assert.equal(evilDoc.status, 403);
    assert.match(evilDoc.body, /Origin/);

    const evilApi = await httpRequest(server.port, '/exam/api/ping', { headers: { origin: 'https://evil.example.com' } });
    assert.equal(evilApi.status, 403);
    assert.deepEqual(proxied, [], 'evil Origin 不得触发反代');

    const nullOrigin = await httpRequest(server.port, '/exam/api/ping', { headers: { origin: 'null' } });
    assert.equal(nullOrigin.status, 403);

    const wrongPortOrigin = await httpRequest(server.port, '/exam/api/ping', { headers: { origin: 'http://127.0.0.1:1' } });
    assert.equal(wrongPortOrigin.status, 403);

    const localApi = await httpRequest(server.port, '/exam/api/ping', { headers: { origin: localOrigin } });
    assert.equal(localApi.status, 200);
    assert.deepEqual(proxied, ['/exam/api/ping']);

    const noOriginApi = await httpRequest(server.port, '/exam/api/ping');
    assert.equal(noOriginApi.status, 200);
    assert.deepEqual(proxied, ['/exam/api/ping', '/exam/api/ping']);

    const noOriginDoc = await httpRequest(server.port, '/exam/');
    assert.equal(noOriginDoc.status, 200);
    const localDoc = await httpRequest(server.port, '/exam/', { headers: { origin: localOrigin } });
    assert.equal(localDoc.status, 200);
  });
});

test('WS upgrade Origin 校验（F1）：evil Origin ⇒ 403；本地 Origin ⇒ 101', async () => {
  const root = makeDistFixture();
  const forgedSocket = (socket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    socket.end();
  };
  const fakeProxy = { handleHttp() { throw new Error('本用例只测 upgrade'); }, handleUpgrade: (_req, socket) => forgedSocket(socket) };
  await withServer({ rootDir: root, proxy: fakeProxy }, async (server) => {
    const localOrigin = 'http://127.0.0.1:' + server.port;
    const evil = await rawUpgradeRequest(server.port, '/exam/socket.io/?EIO=4&transport=websocket', {
      extraHeaders: { Connection: 'Upgrade', Upgrade: 'websocket', Origin: 'https://evil.example.com' },
    });
    assert.match(evil, /^HTTP\/1\.1 403/);

    const local = await rawUpgradeRequest(server.port, '/exam/socket.io/?EIO=4&transport=websocket', {
      extraHeaders: { Connection: 'Upgrade', Upgrade: 'websocket', Origin: localOrigin },
    });
    assert.match(local, /^HTTP\/1\.1 101/);
  });
});

test('停止后端口释放：close 后同端口可重新监听，旧端口不再接受连接', async () => {
  const root = makeDistFixture();
  const first = await startContentServer({ rootDir: root, port: 0, env: {} });
  const preferredPort = first.port;
  await stopContentServer(first);
  await assert.rejects(() => httpRequest(preferredPort, '/exam/'));

  const second = await startContentServer({ rootDir: root, port: preferredPort, env: {} });
  try {
    assert.equal(second.port, preferredPort);
    const response = await httpRequest(second.port, '/exam/');
    assert.equal(response.status, 200);
  } finally {
    await second.close();
  }
});
