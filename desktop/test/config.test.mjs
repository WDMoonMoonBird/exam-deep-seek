/**
 * config.test.mjs —— desktop/src/main/config.mjs 纯逻辑单元测试（任务 T4）。
 * 覆盖：默认端口 47821、serverUrl 校验、非法配置拒绝、保留端口、CA/外链规范化、userData 配置读写。
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { cleanupTempDirs, makeTempDir } from './helpers.mjs';
import {
  CONFIG_FILE_NAME, DEFAULT_PORT, MAX_PORT, MIN_MACOS_MAJOR, MIN_PORT, RESERVED_PORTS,
  configPath, configTemplate, ensureConfigFile, isInsecureServerUrl, isMacosVersionSupported, loadConfig,
  normalizeCaFile, normalizeExternalOrigins, normalizePort, normalizeServerUrl, parseConfig,
  readCaPem, readConfigFile, runtimeOrigin, writeConfigFile,
} from '../src/main/config.mjs';

after(cleanupTempDirs);

test('常量：默认端口 47821 / 保留端口 3000+5173 / macOS 最低 13', () => {
  assert.equal(DEFAULT_PORT, 47821);
  assert.equal(MIN_PORT, 1024);
  assert.equal(MAX_PORT, 65535);
  assert.deepEqual([...RESERVED_PORTS], [3000, 5173]);
  assert.equal(MIN_MACOS_MAJOR, 13);
  assert.equal(CONFIG_FILE_NAME, 'config.json');
});

test('configPath：拼接 userData/config.json；空参数抛 TypeError', () => {
  assert.equal(configPath('/tmp/uda'), path.join('/tmp/uda', 'config.json'));
  assert.throws(() => configPath(''), TypeError);
  assert.throws(() => configPath(undefined), TypeError);
});

test('normalizeServerUrl：合法 http(s) origin 通过并规范化', () => {
  assert.deepEqual(normalizeServerUrl('https://deadpan.asia'), { ok: true, value: 'https://deadpan.asia' });
  assert.deepEqual(normalizeServerUrl('  https://deadpan.asia/  '), { ok: true, value: 'https://deadpan.asia' });
  assert.deepEqual(normalizeServerUrl('http://127.0.0.1:8080'), { ok: true, value: 'http://127.0.0.1:8080' });
  assert.deepEqual(normalizeServerUrl('HTTPS://DeadPan.ASIA'), { ok: true, value: 'https://deadpan.asia' });
});

test('normalizeServerUrl：非法输入（空/无协议/凭证/路径/查询/锚点/非字符串）一律拒绝', () => {
  const invalid = [
    '', '   ', 'deadpan.asia', 'ftp://deadpan.asia', 'https://u:p@deadpan.asia',
    'https://deadpan.asia/api', 'https://deadpan.asia/?a=1', 'https://deadpan.asia/#frag',
    null, undefined, 42, {}, [],
  ];
  for (const input of invalid) {
    const result = normalizeServerUrl(input);
    assert.equal(result.ok, false, '应拒绝：' + String(input).slice(0, 40));
    assert.equal(typeof result.reason, 'string');
  }
});

test('normalizePort：默认端口/边界/字符串数字通过', () => {
  assert.deepEqual(normalizePort(47821), { ok: true, value: 47821 });
  assert.deepEqual(normalizePort('47821'), { ok: true, value: 47821 });
  assert.deepEqual(normalizePort(MIN_PORT), { ok: true, value: 1024 });
  assert.deepEqual(normalizePort(MAX_PORT), { ok: true, value: 65535 });
});

test('normalizePort：越界/保留端口/非整数拒绝', () => {
  for (const input of [1023, 65536, 0, -1, 3000, 5173, 47821.5, 'abc', null, undefined, true, '']) {
    const result = normalizePort(input);
    assert.equal(result.ok, false, '应拒绝：' + String(input));
    assert.match(result.reason, /port/);
  }
});

test('normalizeExternalOrigins：null/undefined 为空数组；去重；非法项 fail-closed', () => {
  assert.deepEqual(normalizeExternalOrigins(null), { ok: true, value: [] });
  assert.deepEqual(normalizeExternalOrigins(undefined), { ok: true, value: [] });
  assert.deepEqual(
    normalizeExternalOrigins(['https://a.example.com', 'https://a.example.com/', 'https://b.example.com']),
    { ok: true, value: ['https://a.example.com', 'https://b.example.com'] },
  );
  assert.equal(normalizeExternalOrigins('https://a.example.com').ok, false);
  const mixed = normalizeExternalOrigins(['https://a.example.com', 'not-an-origin']);
  assert.equal(mixed.ok, false);
  assert.deepEqual(mixed.value, ['https://a.example.com']);
  assert.match(mixed.reason, /externalOrigins/);
});

test('normalizeCaFile：空值通过；相对路径按 baseDir 解析；绝对路径原样；非字符串拒绝', () => {
  assert.deepEqual(normalizeCaFile(null), { ok: true, value: null });
  assert.deepEqual(normalizeCaFile(''), { ok: true, value: null });
  assert.deepEqual(normalizeCaFile('certs/ca.pem', '/tmp/base'), { ok: true, value: '/tmp/base/certs/ca.pem' });
  assert.deepEqual(normalizeCaFile('/abs/ca.pem', '/tmp/base'), { ok: true, value: '/abs/ca.pem' });
  assert.equal(normalizeCaFile(123).ok, false);
});

test('configTemplate：首启模板 serverUrl 留空、端口默认 47821', () => {
  const template = configTemplate();
  assert.equal(template.serverUrl, '');
  assert.equal(template.port, DEFAULT_PORT);
  assert.deepEqual(template.externalOrigins, []);
  assert.equal(template.caFile, null);
});

test('parseConfig：缺 serverUrl 失败但给出默认端口；完整配置通过', () => {
  const empty = parseConfig({});
  assert.equal(empty.ok, false);
  assert.ok(empty.errors.some((item) => item.includes('serverUrl')));
  assert.equal(empty.config.port, DEFAULT_PORT);

  const badRoot = parseConfig('not-an-object');
  assert.equal(badRoot.ok, false);
  assert.ok(badRoot.errors[0].includes('根节点'));

  const full = parseConfig({
    serverUrl: 'https://deadpan.asia',
    port: '47821',
    externalOrigins: ['https://docs.example.com'],
    caFile: 'certs/ca.pem',
    unknownField: 'ignored',
  }, { baseDir: '/tmp/base' });
  assert.equal(full.ok, true);
  assert.deepEqual(full.config, {
    serverUrl: 'https://deadpan.asia',
    port: 47821,
    externalOrigins: ['https://docs.example.com'],
    caFile: '/tmp/base/certs/ca.pem',
  });
  assert.equal('unknownField' in full.config, false);
});

test('parseConfig：保留端口/非法外链/非法 CA 类型均拒绝（不静默降级）', () => {
  const reserved = parseConfig({ serverUrl: 'https://deadpan.asia', port: 3000 });
  assert.equal(reserved.ok, false);
  assert.ok(reserved.errors.some((item) => item.includes('3000')));
  assert.equal(reserved.config.port, DEFAULT_PORT);

  const badExternal = parseConfig({ serverUrl: 'https://deadpan.asia', externalOrigins: ['javascript:alert(1)'] });
  assert.equal(badExternal.ok, false);

  const badCa = parseConfig({ serverUrl: 'https://deadpan.asia', caFile: 42 });
  assert.equal(badCa.ok, false);
});

test('readConfigFile：文件不存在不算错误；坏 JSON 明确失败；合法 JSON 返回原文', () => {
  const dir = makeTempDir('desktop-cfg-read-');
  const missing = readConfigFile(path.join(dir, 'missing.json'));
  assert.deepEqual(missing, { ok: true, exists: false, raw: null });

  const badPath = path.join(dir, 'bad.json');
  fs.writeFileSync(badPath, '{not json');
  const bad = readConfigFile(badPath);
  assert.equal(bad.ok, false);
  assert.equal(bad.exists, true);
  assert.match(bad.reason, /JSON/);

  const goodPath = path.join(dir, 'good.json');
  fs.writeFileSync(goodPath, JSON.stringify({ serverUrl: 'https://deadpan.asia' }));
  const good = readConfigFile(goodPath);
  assert.equal(good.ok, true);
  assert.equal(good.exists, true);
  assert.deepEqual(good.raw, { serverUrl: 'https://deadpan.asia' });
});

test('userData 配置读写：ensure 生成模板、write/load 往返、坏 JSON 拒绝、缺失文件报错含路径', () => {
  const userDataDir = makeTempDir('desktop-cfg-userdata-');

  const first = ensureConfigFile({ userDataDir });
  assert.equal(first.created, true);
  assert.equal(fs.existsSync(first.filePath), true);
  assert.equal(path.basename(first.filePath), 'config.json');
  assert.equal(ensureConfigFile({ userDataDir }).created, false);

  const notConfigured = loadConfig({ userDataDir });
  assert.equal(notConfigured.ok, false);
  assert.ok(notConfigured.errors.some((item) => item.includes('serverUrl')));

  writeConfigFile(first.filePath, { serverUrl: 'https://deadpan.asia', port: 47821, externalOrigins: [], caFile: null });
  const loaded = loadConfig({ userDataDir });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.config.serverUrl, 'https://deadpan.asia');
  assert.equal(loaded.config.port, 47821);

  fs.writeFileSync(first.filePath, '{broken');
  const broken = loadConfig({ userDataDir });
  assert.equal(broken.ok, false);
  assert.ok(broken.errors.length >= 1);

  const missingDir = makeTempDir('desktop-cfg-missing-');
  const missing = loadConfig({ userDataDir: missingDir });
  assert.equal(missing.ok, false);
  assert.equal(missing.exists, false);
  assert.ok(missing.errors[0].includes(missing.filePath));
});

test('readCaPem：无 CA 返回 null；存在返回 PEM；缺失返回失败但不抛异常', () => {
  const dir = makeTempDir('desktop-cfg-ca-');
  assert.deepEqual(readCaPem(null), { ok: true, ca: null });
  const caPath = path.join(dir, 'ca.pem');
  fs.writeFileSync(caPath, '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n');
  const ok = readCaPem(caPath);
  assert.equal(ok.ok, true);
  assert.match(ok.ca, /BEGIN CERTIFICATE/);
  const missing = readCaPem(path.join(dir, 'nope.pem'));
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /caFile/);
});

test('isInsecureServerUrl：明文 http 判定（F9 启动告警依据）', () => {
  assert.equal(isInsecureServerUrl('http://deadpan.asia'), true);
  assert.equal(isInsecureServerUrl('http://127.0.0.1:8080'), true);
  assert.equal(isInsecureServerUrl('https://deadpan.asia'), false);
  assert.equal(isInsecureServerUrl(''), false);
  assert.equal(isInsecureServerUrl(null), false);
  assert.equal(isInsecureServerUrl('not-a-url'), false);
});

test('runtimeOrigin / isMacosVersionSupported', () => {
  assert.equal(runtimeOrigin(), 'http://127.0.0.1:47821');
  assert.equal(runtimeOrigin(48000), 'http://127.0.0.1:48000');

  assert.equal(isMacosVersionSupported('13.0'), true);
  assert.equal(isMacosVersionSupported('13'), true);
  assert.equal(isMacosVersionSupported('14.6.1'), true);
  assert.equal(isMacosVersionSupported('12.7'), false);
  assert.equal(isMacosVersionSupported(''), false);
  assert.equal(isMacosVersionSupported(null), false);
  assert.equal(isMacosVersionSupported('abc'), false);
});
