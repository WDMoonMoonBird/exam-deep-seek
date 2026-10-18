/**
 * packaging.test.mjs —— Round 2 打包与静态产物测试（R2-2）。
 *
 * 设计原则：
 *   · Node 内置 node:test，不新增依赖；
 *   · 非 darwin 平台或产物缺失（DMG/app/dist-desktop）时 **skip**，绝不失败；
 *   · 只读产物（release/、dist-desktop/、app bundle），不启动 Electron GUI、不挂载 DMG、不联网。
 *
 * 覆盖：codesign adhoc/TeamIdentifier、签名完整性、Info.plist 最低系统/标识、语言裁剪、
 *       extraResources dist、asar 仅壳代码、无 autoUpdater/publish/notarize 痕迹、
 *       Gatekeeper 预期（本机 disabled 时 skip）、DMG 名称/大小/UDIF、build-dist manifest/legacy=0/现代 Monaco worker。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { pruneReason } from '../scripts/build-dist.mjs';

const DESKTOP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_DIR = path.resolve(DESKTOP_DIR, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, 'package.json'), 'utf8'));

const APP_PATH = path.join(DESKTOP_DIR, 'release', 'mac-arm64', 'Deadpan 判题.app');
const APP_CONTENTS = path.join(APP_PATH, 'Contents');
const RESOURCES = path.join(APP_CONTENTS, 'Resources');
const ASAR_PATH = path.join(RESOURCES, 'app.asar');
const APP_DIST = path.join(RESOURCES, 'dist');
const DIST_DESKTOP = path.join(REPO_DIR, 'dist-desktop');
const RELEASE_DIR = path.join(DESKTOP_DIR, 'release');
const DMG_PATH = path.join(RELEASE_DIR, 'Deadpan-' + pkg.version + '-arm64.dmg');
const BUILDER_YML = path.join(DESKTOP_DIR, 'electron-builder.yml');
const ASAR_BIN = path.join(DESKTOP_DIR, 'node_modules', '@electron', 'asar', 'bin', 'asar.js');

const IS_DARWIN = process.platform === 'darwin';
const skipApp = !IS_DARWIN
  ? '非 macOS（darwin）平台，跳过 app bundle 检查'
  : !fs.existsSync(APP_PATH) ? '打包产物缺失：' + APP_PATH + '（先执行 R2-1 打包）' : false;
const skipDmg = !IS_DARWIN
  ? '非 macOS（darwin）平台，跳过 DMG 检查'
  : !fs.existsSync(DMG_PATH) ? 'DMG 缺失：' + DMG_PATH : false;
const skipDist = !fs.existsSync(path.join(DIST_DESKTOP, 'index.html'))
  ? 'dist-desktop 缺失：先运行 node desktop/scripts/build-dist.mjs'
  : false;

function run(command, args, { timeout = 180000 } = {}) {
  return spawnSync(command, args, { encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 });
}

function output(result) {
  return (result.stdout || '') + (result.stderr || '');
}

function plistValue(key) {
  return run('/usr/libexec/PlistBuddy', ['-c', 'Print :' + key, path.join(APP_CONTENTS, 'Info.plist')]);
}

/** 递归列出真实文件（不跟随符号链接目录） */
function walkFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) files.push({ path: path.relative(root, abs).split(path.sep).join('/'), size: fs.statSync(abs).size });
    }
  };
  walk(root);
  return files;
}

function sumBytes(files) {
  return files.reduce((total, file) => total + file.size, 0);
}

function nonCommentYaml(text) {
  return text.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
}

test('Info.plist：LSMinimumSystemVersion=13.0、BundleIdentifier、版本与 package.json 一致', { skip: skipApp }, () => {
  const minSystem = plistValue('LSMinimumSystemVersion');
  assert.equal(minSystem.status, 0, 'PlistBuddy 读取失败：' + output(minSystem));
  assert.equal(minSystem.stdout.trim(), '13.0');

  const identifier = plistValue('CFBundleIdentifier');
  assert.equal(identifier.status, 0);
  assert.equal(identifier.stdout.trim(), 'asia.deadpan.exam.desktop');

  const version = plistValue('CFBundleShortVersionString');
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), pkg.version);
});

test('语言裁剪：仅保留 en.lproj + zh_CN.lproj，且 electron-builder.yml 的 electronLanguages 匹配', { skip: skipApp }, () => {
  const lprojs = fs.readdirSync(RESOURCES).filter((name) => name.endsWith('.lproj')).sort();
  assert.deepEqual(lprojs, ['en.lproj', 'zh_CN.lproj']);

  const ymlLines = nonCommentYaml(fs.readFileSync(BUILDER_YML, 'utf8')).split('\n').map((line) => line.trim());
  assert.ok(ymlLines.includes('- zh_CN'), 'electronLanguages 应使用 zh_CN（匹配 zh_CN.lproj）');
  assert.ok(ymlLines.includes('- en'));
});

test('extraResources：Resources/dist 含 index.html/error-pages/现代 Monaco，legacy=0 且体积≈dist-desktop', { skip: skipApp }, () => {
  assert.equal(fs.existsSync(path.join(APP_DIST, 'index.html')), true, 'Resources/dist/index.html 缺失');
  assert.equal(fs.existsSync(path.join(APP_DIST, 'error-pages', '404.html')), true);

  const appFiles = walkFiles(APP_DIST);
  const legacyResidual = appFiles.filter((file) => /legacy/i.test(file.path));
  assert.deepEqual(legacyResidual.map((file) => file.path), [], 'legacy 产物不应出现在 app Resources/dist');

  const workerKinds = ['css', 'editor', 'html', 'json', 'ts'];
  for (const kind of workerKinds) {
    const found = appFiles.some((file) => new RegExp('/monaco/.*/' + kind + '\\.worker-[^/]+\\.js$').test('/' + file.path));
    assert.equal(found, true, '现代 Monaco worker 缺失：' + kind + '.worker-*');
  }

  const appBytes = sumBytes(appFiles);
  assert.ok(appBytes > 10 * 1024 * 1024, 'Resources/dist 体积异常偏小：' + appBytes);
  if (!skipDist) {
    const desktopBytes = sumBytes(walkFiles(DIST_DESKTOP));
    assert.ok(Math.abs(appBytes - desktopBytes) / desktopBytes < 0.01, 'Resources/dist 与 dist-desktop 体积差异 >1%');
  }
});

test('asar 仅含壳代码：package.json + src/**，无 node_modules/test/scripts/release/map', { skip: skipApp }, () => {
  assert.equal(fs.existsSync(ASAR_PATH), true, 'app.asar 缺失');
  assert.equal(fs.existsSync(ASAR_BIN), true, '未安装 @electron/asar（先 cd desktop && npm install）');

  const listed = run(process.execPath, [ASAR_BIN, 'list', ASAR_PATH]);
  assert.equal(listed.status, 0, 'asar list 失败：' + output(listed));
  const entries = output(listed).split('\n').map((line) => line.trim()).filter(Boolean);

  assert.ok(entries.includes('/package.json'), 'asar 缺少 /package.json');
  assert.ok(entries.includes('/src/main/index.mjs'), 'asar 缺少主进程入口');
  assert.ok(entries.includes('/src/preload/index.cjs'), 'asar 缺少 preload');
  assert.equal(entries.some((entry) => /node_modules|\/test\/|\/scripts\/|\/release\/|\.map$/.test(entry)), false,
    'asar 不应含测试/脚本/依赖/源码映射：' + entries.filter((entry) => /node_modules|\/test\/|\/scripts\/|\/release\/|\.map$/.test(entry)).join(','));
  assert.ok(entries.length < 100, 'asar 条目异常偏多（疑似打入依赖）：' + entries.length);
});

test('无自动更新/发布/公证痕迹：builder 配置 + 壳源码 + 依赖 + release 目录', () => {
  const yml = nonCommentYaml(fs.readFileSync(BUILDER_YML, 'utf8'));
  assert.equal(/^\s*publish\s*:/m.test(yml), false, 'builder 配置不应含 publish（自动发布/更新）');
  assert.equal(/notarize\s*:\s*true/.test(yml), false, '不应开启 notarize');
  assert.match(yml, /notarize\s*:\s*false/);
  assert.equal(/autoUpdater|electron-updater/i.test(yml), false);

  const srcDir = path.join(DESKTOP_DIR, 'src');
  const srcFiles = walkFiles(srcDir);
  for (const file of srcFiles) {
    const text = fs.readFileSync(path.join(srcDir, file.path), 'utf8');
    assert.equal(/autoUpdater|electron-updater|auto-update/i.test(text), false, '壳源码含自动更新代码：' + file.path);
  }

  const dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  assert.equal(Object.keys(dependencies).some((name) => /electron-updater/i.test(name)), false);

  const releaseFiles = fs.existsSync(RELEASE_DIR) ? fs.readdirSync(RELEASE_DIR) : [];
  assert.equal(releaseFiles.some((name) => /latest-mac\.ya?ml$/i.test(name)), false, '不应产生 latest-mac.yml（自动更新清单）');
  assert.equal(releaseFiles.some((name) => /\.zip$/i.test(name)), false, '不应产生自动更新 zip 包');
});

test('签名：Signature=adhoc 且 TeamIdentifier 不存在（非 Developer ID）', { skip: skipApp }, () => {
  const result = run('codesign', ['-dv', '--verbose=4', APP_PATH]);
  assert.equal(result.status, 0, 'codesign -dv 失败：' + output(result));
  const text = output(result);
  assert.match(text, /Signature=adhoc/);
  assert.match(text, /TeamIdentifier=not set/);
  assert.equal(/Developer ID Application/.test(text), false, '不应出现 Developer ID 身份');
});

test('签名完整性：codesign --verify --deep --strict 通过', { skip: skipApp }, () => {
  const result = run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', APP_PATH]);
  const text = output(result);
  assert.equal(result.status, 0, 'codesign --verify 失败：' + text);
  assert.match(text, /valid on disk/);
  assert.match(text, /satisfies its Designated Requirement/);
});

test('架构：Mach-O 为 arm64 单架构（macOS arm64 目标）', { skip: skipApp }, () => {
  const exe = path.join(APP_CONTENTS, 'MacOS', 'Deadpan 判题');
  assert.equal(fs.existsSync(exe), true, '可执行文件缺失：' + exe);
  const result = run('lipo', ['-archs', exe]);
  assert.equal(result.status, 0, 'lipo 失败：' + output(result));
  assert.deepEqual(result.stdout.trim().split(/\s+/), ['arm64']);
});

test('Gatekeeper：ad-hoc 未公证包预期被 spctl 拒绝（本机 assessments disabled 时 skip）', { skip: skipApp }, (t) => {
  const status = run('spctl', ['--status']);
  const statusText = output(status);
  if (/assessments disabled/i.test(statusText)) {
    t.skip('本机 Gatekeeper assessments disabled（非签名问题；D/R2-1 已记录，需干净 Mac 复验）');
    return;
  }
  const assess = run('spctl', ['--assess', '--type', 'execute', '-vv', APP_PATH]);
  assert.notEqual(assess.status, 0, 'ad-hoc 未公证包应被 spctl 拒绝：' + output(assess));
});

test('DMG：文件存在、名称与版本/架构匹配、体积在合理区间', { skip: skipDmg }, () => {
  assert.equal(path.basename(DMG_PATH), 'Deadpan-' + pkg.version + '-arm64.dmg');
  const size = fs.statSync(DMG_PATH).size;
  assert.ok(size > 90 * 1024 * 1024, 'DMG 体积异常偏小（可能漏打 dist）：' + size);
  assert.ok(size < 200 * 1024 * 1024, 'DMG 体积异常偏大：' + size);
  assert.equal(size, fs.statSync(DMG_PATH).size);
});

test('DMG：UDIF 容器可解析（hdiutil imageinfo 退出 0）', { skip: skipDmg }, () => {
  const result = run('hdiutil', ['imageinfo', DMG_PATH]);
  assert.equal(result.status, 0, 'hdiutil imageinfo 失败：' + output(result));
  assert.match(output(result), /UDIF|CUDIFDiskImage/);
});

test('build-dist 产物：manifest 自洽、legacy=0、现代 Monaco worker 保留、体积记录合理', { skip: skipDist }, () => {
  const manifestPath = path.join(DIST_DESKTOP, '.desktop-build.json');
  assert.equal(fs.existsSync(manifestPath), true, 'dist-desktop/.desktop-build.json 缺失');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(typeof manifest.total, 'number');
  assert.equal(manifest.total, manifest.copied + manifest.pruned, 'manifest total 应等于 copied+pruned');
  assert.ok(manifest.pruned > 0, '应存在被裁剪的 legacy 产物');
  assert.ok(manifest.prunedBytes > 10 * 1024 * 1024, '裁剪字节数异常偏小：' + manifest.prunedBytes);
  assert.ok(Number.isFinite(Date.parse(manifest.generatedAt)), 'generatedAt 非法：' + manifest.generatedAt);
  assert.equal(String(manifest.source).endsWith(path.join('client', 'dist')), true);

  for (const prunedPath of manifest.prunedPaths) {
    assert.equal(pruneReason(prunedPath) !== null, true, 'manifest 裁剪项未命中 legacy 规则：' + prunedPath);
  }

  const files = walkFiles(DIST_DESKTOP);
  const legacyResidual = files.filter((file) => pruneReason(file.path) !== null);
  assert.deepEqual(legacyResidual.map((file) => file.path), [], 'dist-desktop 存在 legacy 残留');

  const workerKinds = ['css', 'editor', 'html', 'json', 'ts'];
  for (const kind of workerKinds) {
    assert.equal(files.some((file) => new RegExp('/monaco/.*/' + kind + '\\.worker-[^/]+\\.js$').test('/' + file.path)), true,
      '现代 Monaco worker 缺失：' + kind);
  }

  const bytes = sumBytes(files);
  assert.ok(bytes > 10 * 1024 * 1024, 'dist-desktop 体积异常偏小：' + bytes);
  assert.ok(bytes < 60 * 1024 * 1024, 'dist-desktop 体积异常偏大：' + bytes);
});
