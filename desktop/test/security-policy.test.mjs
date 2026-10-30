/**
 * security-policy.test.mjs —— Electron 安全决策纯函数（任务 T4，计划 §7.1）。
 * 覆盖：webPreferences 基线、导航/新窗口/权限/下载决策、外链白名单、日志脱敏。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DECISION_ALLOW, DECISION_BLOCK, WEB_PREFERENCES,
  createSecurityPolicy, evaluateDownload, evaluateNavigation, evaluateWindowOpen,
  permissionDecision, redactUrl, secureWebPreferences,
} from '../src/main/security-policy.mjs';

const APP_ORIGIN = 'http://127.0.0.1:47821';
const policy = createSecurityPolicy({ appOrigin: APP_ORIGIN, externalOrigins: ['https://docs.example.com'] });

test('WEB_PREFERENCES：安全基线不可降级且冻结', () => {
  assert.equal(Object.isFrozen(WEB_PREFERENCES), true);
  assert.equal(WEB_PREFERENCES.contextIsolation, true);
  assert.equal(WEB_PREFERENCES.sandbox, true);
  assert.equal(WEB_PREFERENCES.nodeIntegration, false);
  assert.equal(WEB_PREFERENCES.nodeIntegrationInWorker, false);
  assert.equal(WEB_PREFERENCES.nodeIntegrationInSubFrames, false);
  assert.equal(WEB_PREFERENCES.webSecurity, true);
  assert.equal(WEB_PREFERENCES.allowRunningInsecureContent, false);
  assert.equal(WEB_PREFERENCES.webviewTag, false);
});

test('secureWebPreferences：默认 devTools=false；可选 preload；不改基线常量', () => {
  const defaults = secureWebPreferences();
  assert.equal(defaults.devTools, false);
  assert.equal('preload' in defaults, false);
  assert.equal(defaults.contextIsolation, true);

  const withPreload = secureWebPreferences({ preload: '/app/preload/index.cjs', devTools: true });
  assert.equal(withPreload.preload, '/app/preload/index.cjs');
  assert.equal(withPreload.devTools, true);
  assert.equal(WEB_PREFERENCES.preload, undefined);
});

test('createSecurityPolicy：appOrigin 必须 http；外链只留 https 且去重/排除自身', () => {
  assert.deepEqual(policy, {
    appOrigin: APP_ORIGIN,
    externalOrigins: ['https://docs.example.com'],
  });
  assert.throws(() => createSecurityPolicy({}), TypeError);
  assert.throws(() => createSecurityPolicy({ appOrigin: 'https://127.0.0.1:47821' }), TypeError);
  assert.throws(() => createSecurityPolicy({ appOrigin: 'not-a-url' }), TypeError);

  const filtered = createSecurityPolicy({
    appOrigin: APP_ORIGIN,
    externalOrigins: [
      'https://docs.example.com',
      'https://docs.example.com/',
      'http://insecure.example.com',
      'https://u:p@cred.example.com',
      'javascript:alert(1)',
      'http://127.0.0.1:47821',
    ],
  });
  assert.deepEqual(filtered.externalOrigins, ['https://docs.example.com']);
});

test('evaluateNavigation：只允许本地 origin 的 /exam 路径', () => {
  const allow = evaluateNavigation(APP_ORIGIN + '/exam/teacher/course/1', policy);
  assert.equal(allow.decision, DECISION_ALLOW);

  assert.equal(evaluateNavigation('https://evil.example.com/exam/', policy).decision, DECISION_BLOCK);
  assert.equal(evaluateNavigation(APP_ORIGIN + '/other', policy).decision, DECISION_BLOCK);
  assert.equal(evaluateNavigation('javascript:alert(1)', policy).decision, DECISION_BLOCK);
  assert.equal(evaluateNavigation('/exam/login', policy).decision, DECISION_BLOCK);
  assert.equal(evaluateNavigation(APP_ORIGIN + '/exam/', {}).decision, DECISION_BLOCK);
});

test('evaluateWindowOpen：站内 allow；https 白名单转系统浏览器；其余 deny', () => {
  assert.equal(evaluateWindowOpen(APP_ORIGIN + '/exam/login', policy).decision, DECISION_ALLOW);
  assert.equal(evaluateWindowOpen(APP_ORIGIN + '/other', policy).decision, DECISION_BLOCK);

  const external = evaluateWindowOpen('https://docs.example.com/help?q=1', policy);
  assert.equal(external.decision, DECISION_BLOCK);
  assert.equal(external.openExternal, 'https://docs.example.com/help?q=1');

  assert.equal(evaluateWindowOpen('https://evil.example.com/', policy).decision, DECISION_BLOCK);
  assert.equal(evaluateWindowOpen('https://evil.example.com/', policy).openExternal, undefined);
  assert.equal(evaluateWindowOpen('file:///etc/passwd', policy).decision, DECISION_BLOCK);
});

test('permissionDecision：默认拒绝一切权限', () => {
  const result = permissionDecision('media');
  assert.equal(result.allow, false);
  assert.match(result.reason, /media/);
  assert.equal(permissionDecision(undefined).allow, false);
});

test('evaluateDownload：只允许本站 /exam 资源', () => {
  assert.equal(evaluateDownload(APP_ORIGIN + '/exam/api/export/grade.xlsx', policy).allow, true);
  assert.equal(evaluateDownload('https://evil.example.com/x.zip', policy).allow, false);
  assert.equal(evaluateDownload(APP_ORIGIN + '/other/x.zip', policy).allow, false);
  assert.equal(evaluateDownload('file:///etc/passwd', policy).allow, false);
});

test('evaluateDownload（D25）：放行本站页面生成的 blob，拒绝站外/opaque blob 与 data:', () => {
  // SheetJS 的 XLSX.writeFile / 导出日志都走 <a download> + blob:，URL 形如 blob:<origin>/<uuid>
  assert.equal(evaluateDownload('blob:' + APP_ORIGIN + '/1b2c3d4e', policy).allow, true);
  // 站外 origin 生成的 blob 不允许
  assert.equal(evaluateDownload('blob:https://evil.example.com/1b2c3d4e', policy).allow, false);
  // opaque origin（sandbox / 跨源文档）的 blob 形如 blob:null/<uuid>
  assert.equal(evaluateDownload('blob:null/1b2c3d4e', policy).allow, false);
  // 其他 scheme 仍拒绝
  assert.equal(evaluateDownload('data:application/vnd.ms-excel;base64,AAAA', policy).allow, false);
});

test('redactUrl：保留 origin+path，丢弃查询串/凭证', () => {
  assert.equal(redactUrl('https://x.example.com/a/b?token=secret#frag'), 'https://x.example.com/a/b');
  assert.equal(redactUrl('https://u:p@x.example.com/a'), '(invalid-url)');
  assert.equal(redactUrl('blob:' + APP_ORIGIN + '/1b2c3d4e'), 'blob:' + APP_ORIGIN);
  assert.equal(redactUrl('not-a-url'), '(invalid-url)');
  assert.equal(redactUrl(''), '(invalid-url)');
});
