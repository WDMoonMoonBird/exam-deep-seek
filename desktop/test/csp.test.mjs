/**
 * csp.test.mjs —— 本地内容服务 CSP/安全响应头纯函数（任务 T4，计划 §2.3/§7）。
 * 覆盖：关键指令、无通配 *、connect-src、默认 report-only、模式切换、安全头口径。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CSP_DEFAULT_MODE, CSP_ENFORCE_HEADER, CSP_MODES, CSP_REPORT_ONLY_HEADER,
  buildCspDirectives, buildSecurityHeaders, resolveCspMode, serializeCspDirectives,
} from '../src/main/csp.mjs';

function tokensOf(headerValue) {
  return String(headerValue).split(';').flatMap((part) => part.trim().split(/\s+/)).filter(Boolean);
}

test('常量：默认 report-only；模式集合 off/report-only/enforce', () => {
  assert.equal(CSP_DEFAULT_MODE, 'report-only');
  assert.deepEqual([...CSP_MODES], ['off', 'report-only', 'enforce']);
  assert.equal(CSP_REPORT_ONLY_HEADER, 'Content-Security-Policy-Report-Only');
  assert.equal(CSP_ENFORCE_HEADER, 'Content-Security-Policy');
});

test('resolveCspMode：默认/合法值/非法回落 + 告警', () => {
  assert.equal(resolveCspMode({}), CSP_DEFAULT_MODE);
  assert.equal(resolveCspMode(undefined), CSP_DEFAULT_MODE);
  assert.equal(resolveCspMode({ CSP_MODE: 'enforce' }), 'enforce');
  assert.equal(resolveCspMode({ CSP_MODE: ' OFF ' }), 'off');
  assert.equal(resolveCspMode({ CSP_MODE: 'report-only' }), 'report-only');

  const warnings = [];
  assert.equal(resolveCspMode({ CSP_MODE: 'allow-everything' }, { warn: { warn: (message) => warnings.push(message) } }), CSP_DEFAULT_MODE);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /CSP_MODE/);

  const throwingWarn = { warn() { throw new Error('log 失败不影响启动'); } };
  assert.equal(resolveCspMode({ CSP_MODE: 'bad' }, { warn: throwingWarn }), CSP_DEFAULT_MODE);
});

test('buildCspDirectives：关键指令与来源符合计划（无外部源、无通配）', () => {
  const directives = buildCspDirectives();
  assert.deepEqual(directives.defaultSrc, ["'self'"]);
  assert.deepEqual(directives.baseUri, ["'self'"]);
  assert.deepEqual(directives.objectSrc, ["'none'"]);
  assert.deepEqual(directives.frameAncestors, ["'self'"]);
  assert.deepEqual(directives.frameSrc, ["'self'"]);
  assert.deepEqual(directives.formAction, ["'self'"]);
  assert.ok(directives.scriptSrc.includes("'self'"));
  assert.ok(directives.styleSrc.includes("'self'"));
  assert.deepEqual(directives.connectSrc, ["'self'", 'ws:', 'wss:']);
  assert.deepEqual(directives.fontSrc, ["'self'", 'data:']);
  assert.equal('reportUri' in directives, false);

  const withReport = buildCspDirectives({ reportUri: '/exam/csp-report' });
  assert.deepEqual(withReport.reportUri, ['/exam/csp-report']);
});

test('serializeCspDirectives：确定性顺序 + 无通配 * + report-uri 收尾', () => {
  const serialized = serializeCspDirectives(buildCspDirectives({ reportUri: '/exam/csp-report' }));
  assert.ok(serialized.startsWith("default-src 'self'; base-uri 'self'; object-src 'none';"));
  assert.ok(serialized.endsWith('report-uri /exam/csp-report'));
  assert.equal(tokensOf(serialized).includes('*'), false);
  assert.equal(tokensOf(serialized).includes('https:'), false);

  const a = serializeCspDirectives(buildCspDirectives());
  const b = serializeCspDirectives(buildCspDirectives());
  assert.equal(a, b);
});

test('serializeCspDirectives：空数组跳过、未知键追加、非法输入返回空串', () => {
  assert.equal(serializeCspDirectives({ defaultSrc: [], imgSrc: ["'self'"] }), "img-src 'self'");
  assert.equal(serializeCspDirectives({ zzzCustom: ['x'] }), 'zzz-custom x');
  assert.equal(serializeCspDirectives(null), '');
  assert.equal(serializeCspDirectives(undefined), '');
});

test('buildSecurityHeaders：默认 report-only + 六条安全头（与 security-headers.inc 对齐）', () => {
  const headers = buildSecurityHeaders();
  const map = Object.fromEntries(headers);
  assert.equal(headers.length, 6);
  assert.ok(CSP_REPORT_ONLY_HEADER in map);
  assert.equal(CSP_ENFORCE_HEADER in map, false);
  assert.equal(map['X-Content-Type-Options'], 'nosniff');
  assert.equal(map['X-Frame-Options'], 'SAMEORIGIN');
  assert.equal(map['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(map['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
  assert.equal(map['X-Robots-Tag'], 'noindex');
  assert.equal(tokensOf(map[CSP_REPORT_ONLY_HEADER]).includes('*'), false);
});

test('buildSecurityHeaders：enforce 用强执行头；off 不下发 CSP；非法值回落 report-only', () => {
  const enforce = Object.fromEntries(buildSecurityHeaders({ cspMode: 'enforce', cspReportUri: '/exam/csp-report' }));
  assert.ok(CSP_ENFORCE_HEADER in enforce);
  assert.equal(CSP_REPORT_ONLY_HEADER in enforce, false);
  assert.ok(enforce[CSP_ENFORCE_HEADER].endsWith('report-uri /exam/csp-report'));

  const off = buildSecurityHeaders({ cspMode: 'off' });
  assert.equal(off.length, 5);
  assert.equal(off.some(([name]) => name.startsWith('Content-Security-Policy')), false);

  const invalid = Object.fromEntries(buildSecurityHeaders({ cspMode: 'nonsense' }));
  assert.ok(CSP_REPORT_ONLY_HEADER in invalid);
});
