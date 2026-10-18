/**
 * static-assets.test.mjs —— 静态响应 MIME / 缓存策略 / 文件发送器（任务 T4）。
 * 覆盖：MIME 表、hashed assets 长缓存、index no-store、缺失文件 false、HEAD、流错误销毁。
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { cleanupTempDirs, createFakeRes, makeTempDir, waitForFinish } from './helpers.mjs';
import {
  CACHE_DEFAULT, CACHE_LONG, CACHE_MONACO, CACHE_NO_STORE,
  cacheControlFor, createFileResponder, mimeFor,
} from '../src/main/static-assets.mjs';

after(cleanupTempDirs);

test('常量：缓存策略口径', () => {
  assert.equal(CACHE_LONG, 'public, max-age=31536000, immutable');
  assert.equal(CACHE_MONACO, 'public, max-age=604800');
  assert.equal(CACHE_DEFAULT, 'public, max-age=3600');
  assert.equal(CACHE_NO_STORE, 'no-store');
});

test('mimeFor：常见前端产物 MIME（含 charset）；未知扩展名回落 octet-stream', () => {
  assert.equal(mimeFor('/x/index.html'), 'text/html; charset=utf-8');
  assert.equal(mimeFor('/x/app.js'), 'text/javascript; charset=utf-8');
  assert.equal(mimeFor('/x/app.mjs'), 'text/javascript; charset=utf-8');
  assert.equal(mimeFor('/x/app.css'), 'text/css; charset=utf-8');
  assert.equal(mimeFor('/x/data.json'), 'application/json; charset=utf-8');
  assert.equal(mimeFor('/x/font.woff2'), 'font/woff2');
  assert.equal(mimeFor('/x/icon.svg'), 'image/svg+xml');
  assert.equal(mimeFor('/x/pic.PNG'), 'image/png');
  assert.equal(mimeFor('/x/module.wasm'), 'application/wasm');
  assert.equal(mimeFor('/x/blob.bin'), 'application/octet-stream');
  assert.equal(mimeFor('/x/noext'), 'application/octet-stream');
  assert.equal(mimeFor(null), 'application/octet-stream');
});

test('cacheControlFor：assets 长缓存 / monaco 中缓存 / 入口 no-store / 其余短缓存', () => {
  assert.equal(cacheControlFor('/exam/assets/index-abc123.js'), CACHE_LONG);
  assert.equal(cacheControlFor('/exam/monaco/vs/loader.js'), CACHE_MONACO);
  assert.equal(cacheControlFor('/exam/'), CACHE_NO_STORE);
  assert.equal(cacheControlFor('/exam/index.html'), CACHE_NO_STORE);
  assert.equal(cacheControlFor('/exam/favicon.ico'), CACHE_DEFAULT);
  assert.equal(cacheControlFor('/exam/login'), CACHE_DEFAULT);
});

test('createFileResponder：成功发送文件（状态/MIME/长度/缓存/Last-Modified/body）', async () => {
  const dir = makeTempDir('desktop-static-');
  const filePath = path.join(dir, 'hello.txt');
  fs.writeFileSync(filePath, 'hello');

  const sendFile = createFileResponder();
  const res = createFakeRes();
  const ok = sendFile({ method: 'GET' }, res, filePath, { status: 200, cacheControl: CACHE_LONG });
  assert.equal(ok, true);
  await waitForFinish(res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'text/plain; charset=utf-8');
  assert.equal(res.headers['Content-Length'], 5);
  assert.equal(res.headers['Cache-Control'], CACHE_LONG);
  assert.equal(typeof res.headers['Last-Modified'], 'string');
  assert.equal(res.body.toString('utf8'), 'hello');
});

test('createFileResponder：HEAD 只发头不发 body', async () => {
  const dir = makeTempDir('desktop-static-head-');
  const filePath = path.join(dir, 'app.js');
  fs.writeFileSync(filePath, 'console.log(1)');

  const sendFile = createFileResponder();
  const res = createFakeRes();
  assert.equal(sendFile({ method: 'HEAD' }, res, filePath), true);
  await waitForFinish(res);
  assert.equal(res.headers['Content-Type'], 'text/javascript; charset=utf-8');
  assert.equal(res.body.length, 0);
});

test('createFileResponder：缺失文件或目录返回 false，不写响应', () => {
  const dir = makeTempDir('desktop-static-miss-');
  const sendFile = createFileResponder();

  const missingRes = createFakeRes();
  assert.equal(sendFile({ method: 'GET' }, missingRes, path.join(dir, 'nope.js')), false);
  assert.equal(missingRes.statusCode, null);
  assert.equal(missingRes.headersSent, false);

  const dirRes = createFakeRes();
  assert.equal(sendFile({ method: 'GET' }, dirRes, dir), false);
  assert.equal(dirRes.headersSent, false);
});

test('createFileResponder：读流在头已发送后出错 ⇒ destroy，不挂起', async () => {
  const fsImpl = {
    statSync: () => ({ isFile: () => true, size: 5, mtime: new Date(0) }),
    createReadStream: () => {
      const stream = new PassThrough();
      process.nextTick(() => stream.emit('error', new Error('simulated read failure')));
      return stream;
    },
  };
  const sendFile = createFileResponder({ fsImpl });
  const res = createFakeRes();
  assert.equal(sendFile({ method: 'GET' }, res, '/fake/file.txt', { status: 200 }), true);
  await new Promise((resolve) => res.once('close', resolve));
  assert.equal(res.destroyed, true);
});
