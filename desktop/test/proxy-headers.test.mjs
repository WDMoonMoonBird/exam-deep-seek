/**
 * proxy-headers.test.mjs —— 反代请求/响应头纯函数（任务 T4，计划 §7.2）。
 * 覆盖：本地 Origin 去除、Host 重写、XFF 不伪造、hop-by-hop、WebSocket upgrade。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HOP_BY_HOP_HEADERS, buildForwardHeaders, buildResponseHeaders, buildUpgradeHeaders,
  isAllowedHost, isAllowedOrigin, isHopByHopHeader, isLoopbackHostname, isWebSocketUpgrade, parseHostHeader,
  serializeUpgradeResponse,
} from '../src/main/proxy-headers.mjs';

test('isLoopbackHostname：只认 127.0.0.1 / localhost（含大小写）', () => {
  assert.equal(isLoopbackHostname('127.0.0.1'), true);
  assert.equal(isLoopbackHostname('localhost'), true);
  assert.equal(isLoopbackHostname('LOCALHOST'), true);
  assert.equal(isLoopbackHostname('127.0.0.2'), false);
  assert.equal(isLoopbackHostname('evil.example.com'), false);
  assert.equal(isLoopbackHostname(''), false);
});

test('parseHostHeader：解析 host:port，非法格式返回 null', () => {
  assert.deepEqual(parseHostHeader('127.0.0.1:47821'), { hostname: '127.0.0.1', port: 47821 });
  assert.deepEqual(parseHostHeader('localhost:47821'), { hostname: 'localhost', port: 47821 });
  assert.deepEqual(parseHostHeader('127.0.0.1'), { hostname: '127.0.0.1', port: 80 });
  assert.equal(parseHostHeader(''), null);
  assert.equal(parseHostHeader('   '), null);
  assert.equal(parseHostHeader('user@127.0.0.1:47821'), null);
  assert.equal(parseHostHeader('127.0.0.1:47821/path'), null);
  assert.equal(parseHostHeader('127.0.0.1:70000'), null);
});

test('isAllowedHost：DNS rebinding 防护（loopback + 固定端口）', () => {
  assert.equal(isAllowedHost('127.0.0.1:47821', 47821), true);
  assert.equal(isAllowedHost('localhost:47821', 47821), true);
  assert.equal(isAllowedHost('127.0.0.1:47822', 47821), false);
  assert.equal(isAllowedHost('evil.example.com:47821', 47821), false);
  assert.equal(isAllowedHost('127.0.0.1:1', null), true);
  assert.equal(isAllowedHost('127.0.0.1:1', () => 47821), false);
  assert.equal(isAllowedHost('127.0.0.1:47821', () => 47821), true);
  assert.equal(isAllowedHost(undefined, 47821), false);
});

test('isAllowedOrigin：无 Origin 放行；有 Origin 必须严格等于本地 origin（F1）', () => {
  const local = 'http://127.0.0.1:47821';
  assert.equal(isAllowedOrigin(undefined, local), true);
  assert.equal(isAllowedOrigin(null, local), true);
  assert.equal(isAllowedOrigin('', local), true);
  assert.equal(isAllowedOrigin(local, local), true);
  assert.equal(isAllowedOrigin('  ' + local + '  ', local), true);

  assert.equal(isAllowedOrigin('https://evil.example.com', local), false);
  assert.equal(isAllowedOrigin('http://127.0.0.1:47822', local), false);
  assert.equal(isAllowedOrigin('null', local), false);
  assert.equal(isAllowedOrigin(local, null), false);
  assert.equal(isAllowedOrigin(local, ''), false);
  assert.equal(isAllowedOrigin(42, local), false);
});

test('isHopByHopHeader：大小写不敏感，覆盖标准头', () => {
  for (const name of HOP_BY_HOP_HEADERS) {
    assert.equal(isHopByHopHeader(name), true, name);
    assert.equal(isHopByHopHeader(name.toUpperCase()), true, name.toUpperCase());
  }
  assert.equal(isHopByHopHeader('content-type'), false);
  assert.equal(isHopByHopHeader(''), false);
});

test('buildForwardHeaders：Host 重写远端；去 Origin/Referer/XFF/Forwarded；不新增 XFF', () => {
  const incoming = {
    host: '127.0.0.1:47821',
    origin: 'http://127.0.0.1:47821',
    referer: 'http://127.0.0.1:47821/teacher',
    forwarded: 'for=203.0.113.10',
    'x-forwarded-for': '203.0.113.10',
    'x-forwarded-host': 'evil.example.com',
    'x-forwarded-proto': 'https',
    'x-real-ip': '203.0.113.10',
    'x-client-ip': '203.0.113.10',
    connection: 'keep-alive',
    te: 'trailers',
    upgrade: 'websocket',
    'content-type': 'application/json',
    authorization: 'Bearer token-1',
  };
  const headers = buildForwardHeaders(incoming, { targetHost: 'deadpan.asia' });

  assert.equal(headers.host, 'deadpan.asia');
  for (const name of ['origin', 'referer', 'forwarded', 'x-forwarded-for', 'x-forwarded-host',
    'x-forwarded-proto', 'x-real-ip', 'x-client-ip', 'connection', 'te', 'upgrade']) {
    assert.equal(name in headers, false, '不应转发：' + name);
  }
  assert.equal(Object.keys(headers).some((name) => name.toLowerCase().includes('forwarded')), false);
  assert.equal(headers['content-type'], 'application/json');
  assert.equal(headers.authorization, 'Bearer token-1');
});

test('buildUpgradeHeaders：保留 Sec-WebSocket-*，显式 Connection/Upgrade，仍去 XFF/Origin', () => {
  const incoming = {
    host: '127.0.0.1:47821',
    origin: 'http://127.0.0.1:47821',
    'x-forwarded-for': '203.0.113.10',
    connection: 'Upgrade',
    upgrade: 'websocket',
    'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
    'sec-websocket-version': '13',
    'sec-websocket-protocol': 'graphql-ws',
  };
  const headers = buildUpgradeHeaders(incoming, { targetHost: 'deadpan.asia:443' });

  assert.equal(headers.host, 'deadpan.asia:443');
  assert.equal(headers.connection, 'Upgrade');
  assert.equal(headers.upgrade, 'websocket');
  assert.equal(headers['sec-websocket-key'], 'dGhlIHNhbXBsZSBub25jZQ==');
  assert.equal(headers['sec-websocket-version'], '13');
  assert.equal(headers['sec-websocket-protocol'], 'graphql-ws');
  assert.equal('origin' in headers, false);
  assert.equal('x-forwarded-for' in headers, false);
});

test('buildResponseHeaders：剥离 hop-by-hop，其余（含 set-cookie 数组）透传', () => {
  const headers = buildResponseHeaders({
    connection: 'keep-alive',
    'keep-alive': 'timeout=5',
    'proxy-authenticate': 'Basic',
    'transfer-encoding': 'chunked',
    'content-type': 'application/json; charset=utf-8',
    'set-cookie': ['a=1; Path=/', 'b=2; Path=/'],
    'cache-control': 'no-store',
  });
  assert.deepEqual(headers, {
    'content-type': 'application/json; charset=utf-8',
    'set-cookie': ['a=1; Path=/', 'b=2; Path=/'],
    'cache-control': 'no-store',
  });
});

test('isWebSocketUpgrade：Connection 含 upgrade 且 Upgrade=websocket', () => {
  assert.equal(isWebSocketUpgrade({ connection: 'Upgrade', upgrade: 'websocket' }), true);
  assert.equal(isWebSocketUpgrade({ connection: 'keep-alive, Upgrade', upgrade: 'WebSocket' }), true);
  assert.equal(isWebSocketUpgrade({ Connection: 'Upgrade', Upgrade: 'websocket' }), true);
  assert.equal(isWebSocketUpgrade({ connection: 'Upgrade' }), false);
  assert.equal(isWebSocketUpgrade({ connection: 'keep-alive', upgrade: 'websocket' }), false);
  assert.equal(isWebSocketUpgrade(null), false);
  assert.equal(isWebSocketUpgrade({}), false);
});

test('serializeUpgradeResponse：状态行/头小写/多值/去掉 transfer-encoding', () => {
  const raw = serializeUpgradeResponse(101, 'Switching Protocols', {
    Upgrade: 'websocket',
    Connection: 'Upgrade',
    'Sec-WebSocket-Accept': 'abc',
    'transfer-encoding': 'chunked',
    'set-cookie': ['a=1', 'b=2'],
  });
  assert.ok(raw.startsWith('HTTP/1.1 101 Switching Protocols\r\n'));
  assert.ok(raw.endsWith('\r\n\r\n'));
  assert.match(raw, /upgrade: websocket/i);
  assert.match(raw, /sec-websocket-accept: abc/);
  assert.equal(/transfer-encoding/i.test(raw), false);
  assert.match(raw, /set-cookie: a=1/);
  assert.match(raw, /set-cookie: b=2/);
});

test('serializeUpgradeResponse：非 101 状态码与缺省 reason', () => {
  assert.ok(serializeUpgradeResponse(502, '', {}).startsWith('HTTP/1.1 502\r\n'));
  assert.ok(serializeUpgradeResponse('403', 'Forbidden', {}).startsWith('HTTP/1.1 403 Forbidden\r\n'));
  assert.ok(serializeUpgradeResponse(undefined, undefined, {}).startsWith('HTTP/1.1 502'));
});
