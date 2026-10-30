/**
 * security.test.mjs —— security.mjs 装配逻辑（注入 fake Electron 对象，不启动 Electron；任务 T4）。
 * 覆盖：will-navigate/will-redirect/<webview> 拦截、window.open 策略、权限默认拒绝、下载白名单。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFakeEvent, createFakeLog, createFakeSession, createFakeWebContents } from './helpers.mjs';
import { createSecurityPolicy } from '../src/main/security-policy.mjs';
import { applySecurity, applySessionSecurity, applyWebContentsSecurity } from '../src/main/security.mjs';

const APP_ORIGIN = 'http://127.0.0.1:47821';
const policy = createSecurityPolicy({ appOrigin: APP_ORIGIN, externalOrigins: ['https://docs.example.com'] });

test('applyWebContentsSecurity：缺参数抛 TypeError', () => {
  assert.throws(() => applyWebContentsSecurity(null, { policy }), TypeError);
  assert.throws(() => applyWebContentsSecurity(createFakeWebContents(), {}), TypeError);
});

test('applyWebContentsSecurity：站外导航/重定向/<webview> 被拦截，站内导航放行', () => {
  const webContents = createFakeWebContents();
  const log = createFakeLog();
  assert.equal(applyWebContentsSecurity(webContents, { policy, log }), webContents);

  const externalEvent = createFakeEvent();
  webContents.emit('will-navigate', externalEvent, 'https://evil.example.com/phish');
  assert.equal(externalEvent.defaultPrevented, true);
  assert.equal(log.entries.warn.length, 1);
  assert.match(log.entries.warn[0], /已拦截导航/);

  const internalEvent = createFakeEvent();
  webContents.emit('will-navigate', internalEvent, APP_ORIGIN + '/exam/teacher/course/1');
  assert.equal(internalEvent.defaultPrevented, false);

  const redirectEvent = createFakeEvent();
  webContents.emit('will-redirect', redirectEvent, 'https://evil.example.com/next');
  assert.equal(redirectEvent.defaultPrevented, true);

  const webviewEvent = createFakeEvent();
  webContents.emit('will-attach-webview', webviewEvent);
  assert.equal(webviewEvent.defaultPrevented, true);
});

test('applyWebContentsSecurity：window.open 站内放行、白名单外链转系统浏览器、其余拒绝', () => {
  const webContents = createFakeWebContents();
  const opened = [];
  const log = createFakeLog();
  applyWebContentsSecurity(webContents, { policy, log, openExternal: (url) => opened.push(url) });

  assert.deepEqual(webContents.callWindowOpen(APP_ORIGIN + '/exam/doc'), { action: 'allow' });

  const external = webContents.callWindowOpen('https://docs.example.com/help');
  assert.deepEqual(external, { action: 'deny' });
  assert.deepEqual(opened, ['https://docs.example.com/help']);

  const unknown = webContents.callWindowOpen('https://evil.example.com/');
  assert.deepEqual(unknown, { action: 'deny' });
  assert.deepEqual(opened, ['https://docs.example.com/help']);
});

test('applyWebContentsSecurity：站内新窗口用安全 childWindowOptions 覆盖', () => {
  const webContents = createFakeWebContents();
  const childWindowOptions = { contextIsolation: true, sandbox: true, nodeIntegration: false };
  applyWebContentsSecurity(webContents, { policy, childWindowOptions });
  const result = webContents.callWindowOpen(APP_ORIGIN + '/exam/student');
  assert.equal(result.action, 'allow');
  assert.deepEqual(result.overrideBrowserWindowOptions, childWindowOptions);
});

test('applyWebContentsSecurity：无 log/openExternal 时拦截不抛异常', () => {
  const webContents = createFakeWebContents();
  applyWebContentsSecurity(webContents, { policy });
  const event = createFakeEvent();
  webContents.emit('will-navigate', event, 'https://evil.example.com/');
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(webContents.callWindowOpen('https://docs.example.com/x'), { action: 'deny' });
});

test('applySessionSecurity：权限请求/检查/设备权限默认拒绝', () => {
  const session = createFakeSession();
  const log = createFakeLog();
  assert.equal(applySessionSecurity(session, { policy, log }), session);
  assert.equal(typeof session.permissionRequestHandler, 'function');
  assert.equal(typeof session.permissionCheckHandler, 'function');
  assert.equal(typeof session.devicePermissionHandler, 'function');

  const granted = [];
  session.permissionRequestHandler(null, 'media', (allowed) => granted.push(allowed));
  assert.deepEqual(granted, [false]);
  assert.equal(session.permissionCheckHandler(), false);
  assert.equal(session.devicePermissionHandler(), false);
  assert.ok(log.entries.warn.length >= 1);
});

test('applySessionSecurity：will-download 只放行本站 /exam 资源', () => {
  const session = createFakeSession();
  applySessionSecurity(session, { policy });

  const externalEvent = createFakeEvent();
  session.emit('will-download', externalEvent, { getURL: () => 'https://evil.example.com/x.zip' });
  assert.equal(externalEvent.defaultPrevented, true);

  const internalEvent = createFakeEvent();
  session.emit('will-download', internalEvent, { getURL: () => APP_ORIGIN + '/exam/api/export/grade.xlsx' });
  assert.equal(internalEvent.defaultPrevented, false);
});

test('D25：will-download 放行本站 blob（Excel/日志导出），拦截站外 blob 并留痕', () => {
  const session = createFakeSession();
  const log = createFakeLog();
  applySessionSecurity(session, { policy, log });

  // 假 DownloadItem：导出走 blob，需要 getURL / getFilename / once('done')
  const item = (url) => {
    const handlers = [];
    return {
      getURL: () => url,
      getFilename: () => 'a.xlsx',
      once: (event, fn) => { if (event === 'done') handlers.push(fn); },
      emitDone: (state) => handlers.forEach((fn) => fn({}, state)),
    };
  };

  const okItem = item('blob:' + APP_ORIGIN + '/1b2c3d4e');
  const okEvent = createFakeEvent();
  session.emit('will-download', okEvent, okItem);
  assert.equal(okEvent.defaultPrevented, false, '本站 blob 下载应放行');
  assert.ok(log.entries.info.some((m) => /\[download\] 放行/.test(m)), '放行需留痕');

  okItem.emitDone('completed');
  assert.ok(log.entries.info.some((m) => /\[download\] completed/.test(m)), '完成需留痕');

  const evilEvent = createFakeEvent();
  session.emit('will-download', evilEvent, item('blob:https://evil.example.com/1b2c3d4e'));
  assert.equal(evilEvent.defaultPrevented, true, '站外 blob 下载应拦截');
  assert.ok(log.entries.warn.some((m) => /不可信来源的 blob 下载/.test(m)), '拦截需留痕');
});

test('applySecurity：组合装配 session + webContents；缺 policy 抛 TypeError', () => {
  const session = createFakeSession();
  const webContents = createFakeWebContents();
  applySecurity({ session, webContents, policy });
  assert.equal(typeof session.permissionRequestHandler, 'function');
  assert.equal(typeof webContents.windowOpenHandler, 'function');
  assert.throws(() => applySecurity({}), TypeError);

  const sessionOnly = createFakeSession();
  applySecurity({ session: sessionOnly, policy });
  assert.equal(typeof sessionOnly.permissionRequestHandler, 'function');

  const wcOnly = createFakeWebContents();
  applySecurity({ webContents: wcOnly, policy });
  assert.equal(typeof wcOnly.windowOpenHandler, 'function');
});
