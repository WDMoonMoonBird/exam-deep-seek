/**
 * config.test.mjs —— desktop/src/main/config.mjs 纯逻辑单元测试（任务 T4）。
 * 覆盖：默认端口 47821、serverUrl 校验、非法配置拒绝、保留端口、CA/外链规范化、userData 配置读写；
 *       HOTFIX-1：默认 serverUrl=https://deadpan.asia、首启模板、旧配置迁移（保留字段/幂等/坏 JSON 不覆盖/合法 URL 不覆盖）；
 *       HOTFIX-2：isPlatformSupported（darwin 校验 / win32+linux 放行 / 未知平台拒绝）+ index.mjs 平台感知静态断言。
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanupTempDirs, makeTempDir } from './helpers.mjs';
import {
  CONFIG_FILE_NAME, DEFAULT_PORT, DEFAULT_SERVER_URL, MAX_PORT, MIN_MACOS_MAJOR, MIN_PORT, RESERVED_PORTS,
  configPath, configTemplate, ensureConfigFile, isInsecureServerUrl, isMacosVersionSupported, isPlatformSupported, loadConfig,
  migrateConfig, normalizeCaFile, normalizeExternalOrigins, normalizePort, normalizeServerUrl, parseConfig,
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
  assert.equal(DEFAULT_SERVER_URL, 'https://deadpan.asia', 'HOTFIX-1：默认 serverUrl 应为 https://deadpan.asia');
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

test('configTemplate：首启模板 serverUrl 默认 https://deadpan.asia、端口默认 47821（HOTFIX-1）', () => {
  const template = configTemplate();
  assert.equal(template.serverUrl, DEFAULT_SERVER_URL);
  assert.equal(template.serverUrl, 'https://deadpan.asia');
  assert.match(template._comment, /deadpan\.asia/);
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

test('userData 配置读写：首启模板可直接 load、write/load 往返、坏 JSON 拒绝、缺失文件报错含路径（HOTFIX-1）', () => {
  const userDataDir = makeTempDir('desktop-cfg-userdata-');

  const first = ensureConfigFile({ userDataDir });
  assert.equal(first.created, true);
  assert.equal(first.repaired, false);
  assert.equal(fs.existsSync(first.filePath), true);
  assert.equal(path.basename(first.filePath), 'config.json');
  const second = ensureConfigFile({ userDataDir });
  assert.deepEqual({ created: second.created, repaired: second.repaired }, { created: false, repaired: false });

  // HOTFIX-1：首启模板 serverUrl 已有默认值 ⇒ loadConfig 直接成功（不再要求用户手填）
  const firstRun = loadConfig({ userDataDir });
  assert.equal(firstRun.ok, true);
  assert.equal(firstRun.config.serverUrl, DEFAULT_SERVER_URL);
  assert.equal(firstRun.config.port, DEFAULT_PORT);

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

test('migrateConfig：空/缺失/空白 serverUrl 补默认值并保留其他字段；合法 URL 不动（HOTFIX-1）', () => {
  const empty = migrateConfig({ serverUrl: '', port: 48000, externalOrigins: ['https://docs.example.com'], caFile: 'ca.pem', custom: 'x' });
  assert.equal(empty.changed, true);
  assert.deepEqual(empty.config, {
    serverUrl: DEFAULT_SERVER_URL, port: 48000, externalOrigins: ['https://docs.example.com'], caFile: 'ca.pem', custom: 'x',
  });

  const missing = migrateConfig({ port: 47821 });
  assert.equal(missing.changed, true);
  assert.equal(missing.config.serverUrl, DEFAULT_SERVER_URL);
  assert.equal(missing.config.port, 47821);

  const blank = migrateConfig({ serverUrl: '   ' });
  assert.equal(blank.changed, true);
  assert.equal(blank.config.serverUrl, DEFAULT_SERVER_URL);

  const valid = { serverUrl: 'https://example.org', port: 47821 };
  const untouched = migrateConfig(valid);
  assert.equal(untouched.changed, false);
  assert.equal(untouched.config, valid);

  for (const raw of [null, undefined, 'str', 42, []]) {
    assert.equal(migrateConfig(raw).changed, false);
  }
});

test('ensureConfigFile 迁移：旧空 config 保留字段并修复、幂等、坏 JSON 不覆盖、合法 URL 不覆盖（HOTFIX-1）', () => {
  const userDataDir = makeTempDir('desktop-cfg-migrate-');
  fs.mkdirSync(userDataDir, { recursive: true });
  const filePath = path.join(userDataDir, 'config.json');

  // 模拟 v0.1.0 旧配置：serverUrl 为空串，其余字段/未知字段存在
  const legacy = { _comment: 'legacy', serverUrl: '', port: 48000, externalOrigins: ['https://docs.example.com'], caFile: 'certs/ca.pem', custom: 'x' };
  fs.writeFileSync(filePath, JSON.stringify(legacy, null, 2));
  const repaired = ensureConfigFile({ userDataDir });
  assert.deepEqual({ created: repaired.created, repaired: repaired.repaired }, { created: false, repaired: true });
  const afterMigration = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(afterMigration.serverUrl, DEFAULT_SERVER_URL);
  for (const key of ['_comment', 'port', 'externalOrigins', 'caFile', 'custom']) {
    assert.deepEqual(afterMigration[key], legacy[key], '迁移应保留字段：' + key);
  }
  const loaded = loadConfig({ userDataDir });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.config.serverUrl, DEFAULT_SERVER_URL);
  assert.equal(loaded.config.port, 48000);

  // 幂等：再次 ensure 不再改写
  const contentAfterMigration = fs.readFileSync(filePath, 'utf8');
  const again = ensureConfigFile({ userDataDir });
  assert.deepEqual({ created: again.created, repaired: again.repaired }, { created: false, repaired: false });
  assert.equal(fs.readFileSync(filePath, 'utf8'), contentAfterMigration);

  // 合法 URL 不被覆盖
  fs.writeFileSync(filePath, JSON.stringify({ serverUrl: 'https://example.org', port: 47821 }, null, 2));
  const validContent = fs.readFileSync(filePath, 'utf8');
  const validRun = ensureConfigFile({ userDataDir });
  assert.equal(validRun.repaired, false);
  assert.equal(fs.readFileSync(filePath, 'utf8'), validContent);

  // 坏 JSON：不覆盖用户文件，loadConfig 明确报错
  fs.writeFileSync(filePath, '{broken json');
  const badRun = ensureConfigFile({ userDataDir });
  assert.deepEqual({ created: badRun.created, repaired: badRun.repaired }, { created: false, repaired: false });
  assert.equal(fs.readFileSync(filePath, 'utf8'), '{broken json');
  const badLoad = loadConfig({ userDataDir });
  assert.equal(badLoad.ok, false);
  assert.match(badLoad.errors.join('\n'), /JSON/);
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

test('isPlatformSupported：darwin 校验版本、win32/linux 放行、未知平台 fail-closed（HOTFIX-2）', () => {
  // Windows 版本号（10.x / 6.1）不得被当成 macOS 版本判定
  assert.equal(isPlatformSupported('win32', '10.0.19045'), true);
  assert.equal(isPlatformSupported('win32', '10.0.22631'), true);
  assert.equal(isPlatformSupported('win32', '6.1.7601'), true);
  assert.equal(isPlatformSupported('linux', '5.15.0'), true);
  // darwin 仍按 macOS 最低版本校验
  assert.equal(isPlatformSupported('darwin', '13'), true);
  assert.equal(isPlatformSupported('darwin', '13.5.1'), true);
  assert.equal(isPlatformSupported('darwin', '26.1'), true);
  assert.equal(isPlatformSupported('darwin', '12'), false);
  assert.equal(isPlatformSupported('darwin', '12.7.1'), false);
  // 平台名大小写不敏感
  assert.equal(isPlatformSupported('DARWIN', '14.0'), true);
  assert.equal(isPlatformSupported('Win32', '10.0'), true);
  // 未知/空平台 fail-closed
  assert.equal(isPlatformSupported('freebsd', '14'), false);
  assert.equal(isPlatformSupported('unknown', ''), false);
  assert.equal(isPlatformSupported('', ''), false);
  assert.equal(isPlatformSupported(null, null), false);
  // minimumMacosMajor 覆盖：只影响 darwin，不影响 win/linux
  assert.equal(isPlatformSupported('darwin', '13', { minimumMacosMajor: 14 }), false);
  assert.equal(isPlatformSupported('darwin', '14', { minimumMacosMajor: 14 }), true);
  assert.equal(isPlatformSupported('win32', '10.0', { minimumMacosMajor: 99 }), true);
});

test('index.mjs 平台检查：isPlatformSupported(platform, systemVersion)，不再无条件 macOS 检查（HOTFIX-2 静态断言）', () => {
  const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const indexPath = path.join(desktopDir, 'src', 'main', 'index.mjs');
  const source = fs.readFileSync(indexPath, 'utf8');

  assert.match(source, /const platform = process\.platform;/);
  assert.match(source, /const systemVersion = process\.getSystemVersion\(\);/);
  assert.match(source, /if \(!isPlatformSupported\(platform, systemVersion\)\)/);
  // 回归防护：不得再直接调用 isMacosVersionSupported，也不得把系统版本当 macOS 版本检查
  assert.equal(/!isMacosVersionSupported\s*\(/.test(source), false, 'index 不应再直接无条件调用 isMacosVersionSupported');
  assert.equal(/isMacosVersionSupported\(\s*process\.getSystemVersion/.test(source), false, 'index 不应把系统版本直接当 macOS 版本检查');

  const configImport = /import\s*\{([\s\S]*?)\}\s*from\s*'\.\/config\.mjs';/.exec(source);
  assert.ok(configImport, 'index.mjs 应从 ./config.mjs 导入');
  assert.match(configImport[1], /isPlatformSupported/, 'index.mjs 应导入 isPlatformSupported');
});
