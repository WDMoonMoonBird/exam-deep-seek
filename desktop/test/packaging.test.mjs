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
 *       Gatekeeper 预期（本机 disabled 时 skip）、DMG 名称/大小/UDIF、build-dist manifest/legacy=0/现代 Monaco worker；
 *       R4-2：Windows NSIS 配置/产物静态检查（exe 缺失则 skip）+ F1 manifest noise 口径；
 *       R4-5/W1：Windows locales 平台级 electronLanguages（en-US.pak + zh-CN.pak）与新 exe SHA-256 回归。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
// R4-2：Windows NSIS（在 macOS 交叉构建）产物
const WIN_EXE = path.join(RELEASE_DIR, 'Deadpan-' + pkg.version + '-x64.exe');
const WIN_UNPACKED_EXE = path.join(RELEASE_DIR, 'win-unpacked', 'Deadpan 判题.exe');
const WIN_LOCALES_DIR = path.join(RELEASE_DIR, 'win-unpacked', 'locales');
const WIN_DIST = path.join(RELEASE_DIR, 'win-unpacked', 'resources', 'dist');
const ICON_ICO = path.join(DESKTOP_DIR, 'resources', 'icon.ico');
// R4/W1 最终 Windows NSIS 构建（2026-10-18）；若重打包需同步更新该快照
const EXPECTED_WIN_EXE_SHA256 = 'b7b4f1621ea95907520532a46bd3f517eeba4152a479666d564bc300bad7691d';

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
// exe 是可移植文件，跨平台也可做存在/大小检查；file 命令在 macOS 可用
const skipWin = !fs.existsSync(WIN_EXE)
  ? 'Windows 安装包缺失：' + WIN_EXE + '（先执行 R4-1 的 Windows 打包）'
  : false;
const skipWinUnpacked = !fs.existsSync(WIN_UNPACKED_EXE)
  ? 'win-unpacked 缺失：' + WIN_UNPACKED_EXE
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

function sha256File(filePath) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function nonCommentYaml(text) {
  return text.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
}

/** 按顶层 key 切分 yaml 块（用于断言 electronLanguages 必须是平台级、不能是全局项） */
function yamlTopLevelBlocks(text) {
  const blocks = new Map();
  let current = '__root__';
  blocks.set(current, []);
  for (const raw of text.split('\n')) {
    const topLevel = /^([A-Za-z0-9_$.-]+):(\s|$)/.exec(raw);
    if (topLevel) {
      current = topLevel[1];
      blocks.set(current, []);
      continue;
    }
    if (/^\s/.test(raw) && raw.trim() !== '') (blocks.get(current) || []).push(raw.trim());
  }
  return blocks;
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

test('build-dist 产物（F1）：manifest 自洽、copied 不含 noise、legacy=0、现代 Monaco worker 保留', { skip: skipDist }, (t) => {
  const manifestPath = path.join(DIST_DESKTOP, '.desktop-build.json');
  assert.equal(fs.existsSync(manifestPath), true, 'dist-desktop/.desktop-build.json 缺失');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(typeof manifest.total, 'number');
  const noise = Number(manifest.noise) || 0;
  assert.equal(manifest.total, manifest.copied + manifest.pruned + noise,
    'manifest total 应等于 copied+pruned+noise（F1）');
  if (Object.prototype.hasOwnProperty.call(manifest, 'noise')) {
    // F1 后新产物：精确校验真实 client/dist 口径
    assert.equal(manifest.copied, 390, 'F1：copied 不应包含 .DS_Store 噪声');
    assert.equal(manifest.noise, 2, 'master client/dist 应含 2 个 .DS_Store');
    assert.ok(manifest.noiseBytes > 0, 'noiseBytes 应 >0');
    assert.equal(manifest.pruned, 206);
  } else {
    // 兼容 R3 旧 manifest（未重跑 build-dist 时）：F1 精确口径由 build-dist.test.mjs 用真实 client/dist dry-run 验证
    t.diagnostic('dist-desktop manifest 为 R3 旧产物（copied=392，无 noise 字段）：建议 D 重跑 build-dist 刷新本地 manifest；F1 精确断言已在 build-dist.test.mjs dry-run 验证');
  }
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

test('Windows 配置：win.target=nsis、arch=x64、icon.ico、无 publish/签名配置（R4-2）', () => {
  const yml = nonCommentYaml(fs.readFileSync(BUILDER_YML, 'utf8'));
  const lines = yml.split('\n').map((line) => line.trim());
  const winIndex = lines.indexOf('win:');
  assert.ok(winIndex >= 0, 'electron-builder.yml 应含 win 段');
  const winBlock = lines.slice(winIndex, winIndex + 12);

  assert.ok(winBlock.includes('- target: nsis'), 'win.target 应为 nsis');
  assert.ok(winBlock.some((line) => line === 'arch: [x64]'), 'win arch 应为 x64');
  assert.ok(winBlock.includes('icon: resources/icon.ico'), 'win.icon 应指向 resources/icon.ico');
  const artifactLine = winBlock.find((line) => line.startsWith('artifactName:'));
  assert.ok(artifactLine && artifactLine.includes('-x64.') && artifactLine.includes('\${version}') && artifactLine.includes('\${ext}'),
    'win.artifactName 应为 Deadpan-\${version}-x64.\${ext}');

  assert.equal(/^\s*publish\s*:/m.test(yml), false, 'Windows 配置不应含 publish（无自动更新）');
  assert.equal(/certificateFile|signingHashAlgorithms|signtoolOptions/.test(yml), false, '不应配置 Windows 代码签名');
  assert.match(yml, /oneClick: false/);
  assert.match(yml, /perMachine: true/);

  // Windows 图标（ICO 容器：00 00 01 00 + count>=6 个尺寸）
  assert.equal(fs.existsSync(ICON_ICO), true, 'Windows 图标缺失：' + ICON_ICO);
  const ico = fs.readFileSync(ICON_ICO);
  assert.ok(ico.length > 1024, 'icon.ico 异常偏小：' + ico.length);
  assert.equal(ico.readUInt16LE(0), 0, 'ICO reserved 应为 0');
  assert.equal(ico.readUInt16LE(2), 1, 'ICO type 应为 1');
  assert.ok(ico.readUInt16LE(4) >= 6, 'icon.ico 应包含 >=6 个尺寸条目，实际 ' + ico.readUInt16LE(4));
});

test('Windows 产物：NSIS 安装包类型/大小/SHA-256/无 latest.yml；win-unpacked 主程序为 PE32+ x86-64（R4-2/R4-5）', { skip: skipWin }, (t) => {
  assert.equal(path.basename(WIN_EXE), 'Deadpan-' + pkg.version + '-x64.exe');
  const size = fs.statSync(WIN_EXE).size;
  assert.ok(size > 90 * 1024 * 1024, 'Windows 安装包体积异常偏小（可能漏打 dist）：' + size);
  assert.ok(size < 160 * 1024 * 1024, 'Windows 安装包体积异常偏大：' + size);

  // R4-5：W1 locale 修复后的最终 exe 快照（含最新 client/dist；SHA 变化说明重新打包/前端变更）
  const sha256 = sha256File(WIN_EXE);
  assert.equal(sha256, EXPECTED_WIN_EXE_SHA256, 'Windows exe SHA-256 与 R4-5 基线不一致（重新打包后需同步更新 EXPECTED_WIN_EXE_SHA256）');
  t.diagnostic('Windows exe：' + size + ' B（' + (size / 1024 / 1024).toFixed(1) + ' MiB），sha256=' + sha256);

  const installer = run('file', [WIN_EXE]);
  assert.equal(installer.status, 0, 'file 命令失败：' + output(installer));
  const installerOut = output(installer);
  assert.ok(installerOut.includes('MS Windows'), '应为 Windows 可执行文件：' + installerOut);
  assert.ok(installerOut.includes('Nullsoft Installer'), 'NSIS 安装包应含 Nullsoft Installer 标识：' + installerOut);
  // 说明：NSIS 安装器外壳固定为 PE32 i386（32 位 stub），x64 载荷在内部；x64 由 win-unpacked 主程序验证
  assert.ok(installerOut.includes('PE32'), '应为 PE 可执行文件：' + installerOut);

  const releaseFiles = fs.readdirSync(RELEASE_DIR);
  assert.equal(releaseFiles.some((name) => /latest.*\.ya?ml$/i.test(name)), false, 'Windows 无 publish ⇒ 不应产生 latest.yml');
  assert.equal(releaseFiles.some((name) => /\.zip$/i.test(name)), false, '不应产生自动更新 zip 包');

  if (!skipWinUnpacked) {
    const unpacked = run('file', [WIN_UNPACKED_EXE]);
    assert.equal(unpacked.status, 0, 'file 命令失败：' + output(unpacked));
    const unpackedOut = output(unpacked);
    assert.ok(unpackedOut.includes('PE32+ executable'), 'win-unpacked 主程序应为 PE32+（x64）：' + unpackedOut);
    assert.ok(unpackedOut.includes('x86-64'), 'win-unpacked 主程序应为 x86-64：' + unpackedOut);
  }
});

test('Windows locale 配置（W1）：mac/win 平台级 electronLanguages，无全局项（R4-5 防回归）', () => {
  const blocks = yamlTopLevelBlocks(nonCommentYaml(fs.readFileSync(BUILDER_YML, 'utf8')));
  assert.equal(blocks.has('electronLanguages'), false,
    '不应存在全局 electronLanguages（W1 根因：mac .lproj 命名会清空 Windows locales）');

  const macBlock = blocks.get('mac') || [];
  assert.ok(macBlock.includes('- zh_CN') && macBlock.includes('- en'), 'mac.electronLanguages 应为 zh_CN/en');
  const winBlock = blocks.get('win') || [];
  assert.ok(winBlock.includes('- en-US') && winBlock.includes('- zh-CN'), 'win.electronLanguages 应为 en-US/zh-CN（匹配 locales/*.pak）');
});

test('Windows locales 产物（W1）：win-unpacked/locales 恰为 en-US.pak + zh-CN.pak；win dist 完整', { skip: skipWinUnpacked }, (t) => {
  assert.equal(fs.existsSync(WIN_LOCALES_DIR), true, 'win-unpacked/locales 缺失（W1 回归：locales 被清空）');
  const localeEntries = fs.readdirSync(WIN_LOCALES_DIR).sort();
  assert.deepEqual(localeEntries, ['en-US.pak', 'zh-CN.pak'], 'Windows locales 应恰为 en-US.pak + zh-CN.pak');

  const sizes = localeEntries.map((name) => fs.statSync(path.join(WIN_LOCALES_DIR, name)).size);
  for (let index = 0; index < localeEntries.length; index += 1) {
    assert.ok(sizes[index] > 400 * 1024, localeEntries[index] + ' 体积异常偏小：' + sizes[index]);
  }
  const totalBytes = sizes.reduce((sum, value) => sum + value, 0);
  assert.ok(totalBytes > 1.0 * 1024 * 1024, 'locales 合计体积异常偏小：' + totalBytes);
  assert.ok(totalBytes < 1.5 * 1024 * 1024, 'locales 合计体积异常偏大：' + totalBytes);

  // win 前端资源：与 dist-desktop payload 对齐（390 文件、legacy=0、无 .DS_Store/manifest）
  assert.equal(fs.existsSync(path.join(WIN_DIST, 'index.html')), true, 'win-unpacked/resources/dist/index.html 缺失');
  const winFiles = walkFiles(WIN_DIST);
  assert.equal(winFiles.length, 390, 'win dist 文件数应与 F1 copied=390 一致');
  assert.equal(winFiles.some((file) => pruneReason(file.path) !== null || /legacy/i.test(file.path)), false, 'win dist 不应含 legacy');
  assert.equal(winFiles.some((file) => file.path.endsWith('.DS_Store') || file.path.endsWith('.desktop-build.json')), false,
    'win dist 不应含 .DS_Store / .desktop-build.json');
  const winBytes = sumBytes(winFiles);
  const desktopPayloadBytes = sumBytes(walkFiles(DIST_DESKTOP).filter((file) => !file.path.endsWith('.desktop-build.json')));
  assert.ok(Math.abs(winBytes - desktopPayloadBytes) / desktopPayloadBytes < 0.01, 'win dist 与 dist-desktop payload 体积差异 >1%');

  t.diagnostic('Windows locales：' + localeEntries.join(', ') + ' 合计 ' + totalBytes + ' B（'
    + localeEntries.map((name, index) => name + '=' + sizes[index]).join(' / ') + '）；win dist ' + winFiles.length + ' 文件/' + winBytes + ' B');
});
