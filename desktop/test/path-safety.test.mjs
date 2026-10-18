/**
 * path-safety.test.mjs —— 路由分类 / URL 规范化 / 目录穿越防护（任务 T4）。
 * 覆盖：/exam 301、SPA fallback 白名单、未知 404、.. 与 %2e 穿越、URL 编码路径。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  APP_BASE, APP_BASE_BARE, INDEX_FILE, NOT_FOUND_PAGE, SPA_PREFIXES,
  classifyRequestPath, isApiPath, isFileLike, isInternalApiPath, isSocketPath, isSpaRoute,
  normalizeRequestUrl, safeResolve, staticRelativePath,
} from '../src/main/path-safety.mjs';

test('常量：base / index / 404 页与计划一致', () => {
  assert.equal(APP_BASE, '/exam/');
  assert.equal(APP_BASE_BARE, '/exam');
  assert.equal(INDEX_FILE, 'index.html');
  assert.equal(NOT_FOUND_PAGE, 'error-pages/404.html');
  assert.deepEqual([...SPA_PREFIXES], ['/exam/teacher', '/exam/student', '/exam/admin', '/exam/m']);
});

test('API/Socket/内部回调路径判定', () => {
  assert.equal(isApiPath('/exam/api'), true);
  assert.equal(isApiPath('/exam/api/users'), true);
  assert.equal(isApiPath('/exam/apix'), false);
  assert.equal(isSocketPath('/exam/socket.io'), true);
  assert.equal(isSocketPath('/exam/socket.io/'), true);
  assert.equal(isSocketPath('/exam/socket.io2'), false);
  assert.equal(isInternalApiPath('/exam/api/internal'), true);
  assert.equal(isInternalApiPath('/exam/api/internal/health'), true);
  assert.equal(isInternalApiPath('/exam/api/internals'), false);
});

test('isFileLike：末段含扩展名才算文件；目录/隐藏文件不算', () => {
  assert.equal(isFileLike('/exam/assets/app.js'), true);
  assert.equal(isFileLike('/exam/assets/'), false);
  assert.equal(isFileLike('/exam/assets'), false);
  assert.equal(isFileLike('/exam/.env'), false);
});

test('isSpaRoute：精确白名单与前缀白名单', () => {
  for (const pathname of ['/exam/', '/exam/login', '/exam/change-password', '/exam/doc', '/exam/doc/demos',
    '/exam/teacher', '/exam/teacher/course/1', '/exam/student', '/exam/admin/users', '/exam/m', '/exam/m/x']) {
    assert.equal(isSpaRoute(pathname), true, '应视为 SPA：' + pathname);
  }
  for (const pathname of ['/exam/unknown', '/exam/teacherx', '/exam/doc/demos/x', '/other']) {
    assert.equal(isSpaRoute(pathname), false, '不应视为 SPA：' + pathname);
  }
});

test('normalizeRequestUrl：合法路径解码 + 查询串保留', () => {
  assert.deepEqual(normalizeRequestUrl('/exam/'), { ok: true, pathname: '/exam/', search: '' });
  assert.deepEqual(normalizeRequestUrl('/exam/?tab=1'), { ok: true, pathname: '/exam/', search: '?tab=1' });
  assert.deepEqual(normalizeRequestUrl('/exam/assets/app.js?v=2'), { ok: true, pathname: '/exam/assets/app.js', search: '?v=2' });
  assert.deepEqual(normalizeRequestUrl('/exam/doc/%E6%96%87%E6%A1%A3'), { ok: true, pathname: '/exam/doc/文档', search: '' });
  assert.deepEqual(normalizeRequestUrl('//evil.example.com/exam/'), { ok: true, pathname: '/evil.example.com/exam/', search: '' });
});

test('normalizeRequestUrl：目录穿越一律 400（含 %2e 编码变体）', () => {
  for (const raw of ['/exam/../etc/passwd', '/exam/%2e%2e/etc/passwd', '/exam/%2E%2E/secret', '/exam/..%2fetc',
    '/exam/a/../b', '/exam/%2e/']) {
    const result = normalizeRequestUrl(raw);
    assert.equal(result.ok, false, '应拒绝：' + raw);
    assert.equal(result.status, 400);
  }
});

test('normalizeRequestUrl：非法编码/控制字符/反斜杠/非 path/空 URL 均 400', () => {
  const cases = [
    ['', /为空/],
    ['exam/', /path 形式/],
    ['http://evil.example.com/x', /path 形式/],
    ['/exam/%zz', /编码非法/],
    ['/exam/%5c..%5cetc', /反斜杠/],
    ['/exam/\u0000x', /./],
  ];
  for (const [raw, pattern] of cases) {
    const result = normalizeRequestUrl(raw);
    assert.equal(result.ok, false, '应拒绝：' + JSON.stringify(raw));
    assert.equal(result.status, 400);
    assert.match(result.reason, pattern);
  }
});

test('normalizeRequestUrl：连续斜杠归一', () => {
  assert.deepEqual(normalizeRequestUrl('/exam//assets///app.js'), { ok: true, pathname: '/exam/assets/app.js', search: '' });
});

test('staticRelativePath：仅 /exam/ 前缀内返回相对路径', () => {
  assert.equal(staticRelativePath('/exam/assets/app.js'), 'assets/app.js');
  assert.equal(staticRelativePath('/exam/'), null);
  assert.equal(staticRelativePath('/exam'), null);
  assert.equal(staticRelativePath('/other/x.js'), null);
  assert.equal(staticRelativePath(null), null);
});

test('safeResolve：限制在 rootDir 内，拒绝 ..、反斜杠、NUL、空路径', () => {
  const root = '/tmp/dist-desktop-fixture';
  assert.equal(safeResolve(root, 'assets/app.js'), root + '/assets/app.js');
  const rejected = ['', '..', '../secret', 'a/../b', 'a\\b', 'x\u0000y', '/etc/passwd'];
  for (const rel of rejected) {
    assert.equal(safeResolve(root, rel), null, '应拒绝相对路径：' + JSON.stringify(rel));
  }
  assert.equal(safeResolve('', 'a.js'), null);
  assert.equal(safeResolve(root, null), null);
});

test('classifyRequestPath：redirect / proxy / spa / static / notfound 全覆盖', () => {
  assert.deepEqual(classifyRequestPath('/exam'), { type: 'redirect', status: 301, location: '/exam/' });
  assert.deepEqual(classifyRequestPath('/'), { type: 'redirect', status: 301, location: '/exam/' });
  assert.equal(classifyRequestPath('/exam/').type, 'spa');
  assert.equal(classifyRequestPath('/exam/login').type, 'spa');
  assert.equal(classifyRequestPath('/exam/teacher/course/1').type, 'spa');
  assert.equal(classifyRequestPath('/exam/api/users').type, 'proxy-http');
  assert.equal(classifyRequestPath('/exam/socket.io/?EIO=4').type, 'proxy-http');
  assert.equal(classifyRequestPath('/exam/api/internal/health').type, 'notfound');
  assert.equal(classifyRequestPath('/exam/assets/app.js').type, 'static');
  assert.equal(classifyRequestPath('/exam/doc/guide.png').type, 'static');
  // F4：source map 一律 404（与 nginx 口径一致）
  assert.equal(classifyRequestPath('/exam/assets/app.js.map').type, 'notfound');
  assert.equal(classifyRequestPath('/exam/assets/app.js.MAP').type, 'notfound');
  assert.equal(classifyRequestPath('/exam/unknown').type, 'notfound');
  assert.equal(classifyRequestPath('/exam/unknown/').type, 'notfound');
  assert.equal(classifyRequestPath('/other').type, 'notfound');
  assert.equal(classifyRequestPath('exam/').type, 'notfound');
  assert.equal(classifyRequestPath(null).type, 'notfound');
});
