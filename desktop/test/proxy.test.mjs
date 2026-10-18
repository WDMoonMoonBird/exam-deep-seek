/**
 * proxy.test.mjs —— 反代白名单/目标解析/请求头转发（注入 fake transport，不访问网络；任务 T4）。
 * 覆盖：只代理 /exam/api 与 /exam/socket.io、内部端点封禁、Host 重写、去 Origin/XFF、流式响应、故障 502。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';

import { createFakeLog, createFakeRes, waitForFinish } from './helpers.mjs';
import {
  createProxy, isForwardableHttpPath, isSocketUpgradePath, parseRequestTarget,
} from '../src/main/proxy.mjs';

class FakeUpstreamRequest extends Writable {
  _write(_chunk, _encoding, callback) { callback(); }
  setTimeout() { return this; }
}

function createFakeReq({ method = 'GET', url = '/exam/api/ping', headers = {} } = {}) {
  const req = Readable.from([]);
  req.method = method;
  req.url = url;
  req.headers = headers;
  return req;
}

function createFakeTransport({ statusCode = 200, headers = {}, body = '{"ok":true}', failWith = null } = {}) {
  const calls = [];
  const transport = {
    calls,
    request(options, onResponse) {
      calls.push(options);
      const upstream = new FakeUpstreamRequest();
      if (failWith) {
        process.nextTick(() => upstream.emit('error', failWith));
      } else {
        process.nextTick(() => {
          const upstreamRes = Readable.from([Buffer.from(body)]);
          upstreamRes.statusCode = statusCode;
          upstreamRes.headers = { ...headers };
          onResponse(upstreamRes);
        });
      }
      return upstream;
    },
  };
  return transport;
}

test('isForwardableHttpPath：只放行 /exam/api 与 /exam/socket.io，内部回调封禁', () => {
  assert.equal(isForwardableHttpPath('/exam/api'), true);
  assert.equal(isForwardableHttpPath('/exam/api/users'), true);
  assert.equal(isForwardableHttpPath('/exam/socket.io/'), true);
  assert.equal(isForwardableHttpPath('/exam/socket.io/?EIO=4'), true);
  assert.equal(isForwardableHttpPath('/exam/api/internal'), false);
  assert.equal(isForwardableHttpPath('/exam/api/internal/health'), false);
  assert.equal(isForwardableHttpPath('/exam/teacher'), false);
  assert.equal(isForwardableHttpPath('/exam/apix'), false);
  assert.equal(isForwardableHttpPath('exam/api'), false);
  assert.equal(isForwardableHttpPath(''), false);
});

test('isSocketUpgradePath：只认 socket.io 前缀', () => {
  assert.equal(isSocketUpgradePath('/exam/socket.io/'), true);
  assert.equal(isSocketUpgradePath('/exam/socket.io'), true);
  assert.equal(isSocketUpgradePath('/exam/api/socket.io'), false);
  assert.equal(isSocketUpgradePath('/exam/socket.io2'), false);
});

test('parseRequestTarget：保留原始 request-target；拒绝控制字符/非法编码', () => {
  assert.deepEqual(parseRequestTarget('/exam/api/users?page=1'), {
    pathname: '/exam/api/users',
    rawTarget: '/exam/api/users?page=1',
  });
  assert.equal(parseRequestTarget(''), null);
  assert.equal(parseRequestTarget('/exam/api/%zz'), null);
  // WHATWG URL 把反斜杠归一为 '/'、把裸 NUL 静默丢弃；真正安全性由后续白名单判定兜底
  assert.deepEqual(parseRequestTarget('/exam/api/x\\y'), { pathname: '/exam/api/x/y', rawTarget: '/exam/api/x\\y' });
  assert.deepEqual(parseRequestTarget('/exam/api/\u0000'), { pathname: '/exam/api/', rawTarget: '/exam/api/\u0000' });
  // 编码后的控制字符才进入显式拒绝分支
  assert.equal(parseRequestTarget('/exam/api/%00'), null);
  assert.equal(parseRequestTarget('/exam/api/%7f'), null);
});

test('parseRequestTarget：点段由 WHATWG URL 规范化，穿越结果必须被白名单挡掉', () => {
  // 现状：编码/未编码的 .. 不会让 parseRequestTarget 返回 null，而是被 URL 规范化；
  // 安全性依赖随后的 isForwardableHttpPath(pathname) 白名单判定（下方 handleHttp 用例验证 404）。
  const encoded = parseRequestTarget('/exam/api/%2e%2e/secret');
  assert.equal(encoded.pathname, '/exam/secret');
  assert.equal(isForwardableHttpPath(encoded.pathname), false);

  const plain = parseRequestTarget('/exam/api/../users');
  assert.equal(plain.pathname, '/exam/users');
  assert.equal(isForwardableHttpPath(plain.pathname), false);
});

test('handleHttp：编码点段穿越规范化后不在白名单 ⇒ 404 且不访问上游', async () => {
  const transport = createFakeTransport();
  const proxy = createProxy({ serverUrl: 'https://deadpan.asia', transport });
  const res = createFakeRes();
  proxy.handleHttp(createFakeReq({ url: '/exam/api/%2e%2e/secret' }), res);
  await waitForFinish(res);
  assert.equal(res.statusCode, 404);
  assert.equal(transport.calls.length, 0);
});

test('createProxy：serverUrl 必须是纯 http(s) origin（拒绝凭证/路径/查询）', () => {
  assert.throws(() => createProxy({ serverUrl: 'ftp://deadpan.asia' }), TypeError);
  assert.throws(() => createProxy({ serverUrl: 'https://u:p@deadpan.asia' }), TypeError);
  assert.throws(() => createProxy({ serverUrl: 'https://deadpan.asia/api' }), TypeError);
  assert.throws(() => createProxy({ serverUrl: 'https://deadpan.asia?x=1' }), TypeError);
  assert.throws(() => createProxy({}), TypeError);

  const proxy = createProxy({ serverUrl: 'https://deadpan.asia' });
  assert.equal(proxy.targetOrigin, 'https://deadpan.asia');
  assert.equal(proxy.targetHost, 'deadpan.asia');
});

test('handleHttp：白名单路径流式转发，Host 重写、去 Origin/XFF、响应头去 hop-by-hop', async () => {
  const transport = createFakeTransport({
    statusCode: 200,
    body: '{"ok":true}',
    headers: {
      connection: 'keep-alive',
      'transfer-encoding': 'chunked',
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': ['sid=1; Path=/', 'theme=dark; Path=/'],
    },
  });
  const proxy = createProxy({ serverUrl: 'https://deadpan.asia', transport });
  const req = createFakeReq({
    method: 'POST',
    url: '/exam/api/users?page=1',
    headers: {
      host: '127.0.0.1:47821',
      origin: 'http://127.0.0.1:47821',
      referer: 'http://127.0.0.1:47821/teacher',
      'x-forwarded-for': '203.0.113.10',
      'x-real-ip': '203.0.113.10',
      connection: 'keep-alive',
      'content-type': 'application/json',
      authorization: 'Bearer token-1',
    },
  });
  const res = createFakeRes();
  proxy.handleHttp(req, res);
  await waitForFinish(res);

  assert.equal(transport.calls.length, 1);
  const options = transport.calls[0];
  assert.equal(options.protocol, 'https:');
  assert.equal(options.hostname, 'deadpan.asia');
  assert.equal(options.path, '/exam/api/users?page=1');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.host, 'deadpan.asia');
  assert.equal('origin' in options.headers, false);
  assert.equal('referer' in options.headers, false);
  assert.equal('x-forwarded-for' in options.headers, false);
  assert.equal('x-real-ip' in options.headers, false);
  assert.equal('connection' in options.headers, false);
  assert.equal(options.headers.authorization, 'Bearer token-1');

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.deepEqual(res.headers['set-cookie'], ['sid=1; Path=/', 'theme=dark; Path=/']);
  assert.equal('connection' in res.headers, false);
  assert.equal('transfer-encoding' in res.headers, false);
  assert.equal(res.body.toString('utf8'), '{"ok":true}');
});

test('handleHttp：白名单外的路径 404 且不发起上游请求', async () => {
  const transport = createFakeTransport();
  const proxy = createProxy({ serverUrl: 'https://deadpan.asia', transport });
  const res = createFakeRes();
  proxy.handleHttp(createFakeReq({ url: '/exam/teacher' }), res);
  await waitForFinish(res);
  assert.equal(res.statusCode, 404);
  assert.equal(JSON.parse(res.body.toString('utf8')).code, 1404);
  assert.equal(transport.calls.length, 0);
});

test('handleHttp：/exam/api/internal/** 一律 404（内部回调不暴露）', async () => {
  const transport = createFakeTransport();
  const proxy = createProxy({ serverUrl: 'https://deadpan.asia', transport });
  const res = createFakeRes();
  proxy.handleHttp(createFakeReq({ url: '/exam/api/internal/health' }), res);
  await waitForFinish(res);
  assert.equal(res.statusCode, 404);
  assert.equal(transport.calls.length, 0);
});

test('handleHttp：上游错误回 502 JSON；close 后回 503', async () => {
  const transport = createFakeTransport({ failWith: new Error('upstream down') });
  const proxy = createProxy({ serverUrl: 'https://deadpan.asia', transport, log: createFakeLog() });
  const res = createFakeRes();
  proxy.handleHttp(createFakeReq({ url: '/exam/api/ping' }), res);
  await waitForFinish(res);
  assert.equal(res.statusCode, 502);
  assert.equal(JSON.parse(res.body.toString('utf8')).code, 1502);

  await proxy.close();
  const closedRes = createFakeRes();
  proxy.handleHttp(createFakeReq({ url: '/exam/api/ping' }), closedRes);
  await waitForFinish(closedRes);
  assert.equal(closedRes.statusCode, 503);
});
