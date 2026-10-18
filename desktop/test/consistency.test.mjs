/**
 * consistency.test.mjs —— R4-9/R4-10 跨产物前端快照一致性测试（task-35）。
 *
 * 验证「同一份 dist-desktop 快照」被正确打进三个产物，且签名/语言等产物属性未回退：
 *   ① dist-desktop（构建真源） ② mac app Contents/Resources/dist ③ win-unpacked/resources/dist
 *   · index.html + 全部 assets（含入口 js/css）逐文件 sha256 一致；
 *   · 新 mac DMG 存在、名称/大小/SHA-256、只读挂载后内部 app codesign adhoc + verify 通过；
 *   · release app（DMG 内容来源）codesign adhoc + verify；
 *   · Windows locales 恰 2 个 .pak（W1 防回归）、win exe SHA 未变；
 *   · HOTFIX-1：快照版本 0.1.1（新 DMG/exe SHA；三树 index.html 仍 `bd782577…`）。
 *
 * 只在 macOS + 产物存在时执行；产物缺失/挂载不可用时 skip，不 fail；只读产物、不联网。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_DIR = path.resolve(__dirname, '..');
const REPO_DIR = path.resolve(DESKTOP_DIR, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, 'package.json'), 'utf8'));
const RELEASE_DIR = path.join(DESKTOP_DIR, 'release');
const DIST_DESKTOP = path.join(REPO_DIR, 'dist-desktop');
const MAC_APP = path.join(RELEASE_DIR, 'mac-arm64', 'Deadpan 判题.app');
const MAC_DIST = path.join(MAC_APP, 'Contents', 'Resources', 'dist');
const WIN_DIST = path.join(RELEASE_DIR, 'win-unpacked', 'resources', 'dist');
const WIN_UNPACKED_EXE = path.join(RELEASE_DIR, 'win-unpacked', 'Deadpan 判题.exe');
const WIN_LOCALES_DIR = path.join(RELEASE_DIR, 'win-unpacked', 'locales');
const WIN_EXE = path.join(RELEASE_DIR, 'Deadpan-' + pkg.version + '-x64.exe');
const DMG_PATH = path.join(RELEASE_DIR, 'Deadpan-' + pkg.version + '-arm64.dmg');

// HOTFIX-1 / 0.1.1 快照（三树 index.html 仍沿用 R4-9 前端快照；重打包需同步更新）
const EXPECTED_VERSION = '0.1.1';
const EXPECTED_INDEX_SHA256 = 'bd78257784dac098bacf2a708bac04af43c9aecc5002c2e0db22684ba0d3f060';
const EXPECTED_DMG_SHA256 = '9535ba0c380367eb62c1dc8aab3ba81e84cb3afd1d9dde294b202e2f633ce9a9';
const EXPECTED_WIN_EXE_SHA256 = '582e6496e4d06ef8e5157bc14bd84870a92ae01b571c8fe4457403aad9b5fd6a';
const EXPECTED_PAYLOAD_FILES = 390;
const EXPECTED_ASSETS_FILES = 186;

const IS_DARWIN = process.platform === 'darwin';
const TREES = [
  { name: 'dist-desktop', root: DIST_DESKTOP },
  { name: 'mac app Resources/dist', root: MAC_DIST },
  { name: 'win-unpacked resources/dist', root: WIN_DIST },
];
const missingTrees = TREES.filter((tree) => !fs.existsSync(path.join(tree.root, 'index.html')));
const skipTrees = !IS_DARWIN
  ? '跨产物快照一致性仅在本机 macOS 产物上验证'
  : missingTrees.length > 0
    ? '产物缺失：' + missingTrees.map((tree) => tree.name).join(', ')
    : false;
const skipDmg = !IS_DARWIN ? '非 macOS，跳过 DMG 检查' : !fs.existsSync(DMG_PATH) ? 'DMG 缺失：' + DMG_PATH : false;
const skipApp = !IS_DARWIN ? '非 macOS，跳过 app 签名检查' : !fs.existsSync(MAC_APP) ? 'mac app 缺失：' + MAC_APP : false;
const skipWin = !fs.existsSync(path.join(RELEASE_DIR, 'win-unpacked')) ? 'win-unpacked 缺失' : false;

function run(command, args, { timeout = 180000 } = {}) {
  return spawnSync(command, args, { encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 });
}

function output(result) {
  return (result.stdout || '') + (result.stderr || '');
}

function walkFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) files.push(path.relative(root, abs).split(path.sep).join('/'));
    }
  };
  walk(root);
  return files.sort();
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/** 构建相对路径 → sha256 映射；排除本地构建元数据/系统噪声（不属于前端 payload） */
function buildMap(root) {
  const map = new Map();
  for (const rel of walkFiles(root)) {
    if (rel === '.desktop-build.json' || rel === '.DS_Store' || rel.endsWith('/.DS_Store')) continue;
    map.set(rel, sha256File(path.join(root, rel)));
  }
  return map;
}

test('跨产物快照：dist-desktop / mac app / win-unpacked 的 index.html + assets 逐文件 sha256 一致', { skip: skipTrees }, (t) => {
  const maps = new Map(TREES.map((tree) => [tree.name, buildMap(tree.root)]));
  const base = maps.get('dist-desktop');
  assert.ok(base.size > 0, 'dist-desktop payload 为空');

  for (const tree of TREES.slice(1)) {
    const other = maps.get(tree.name);
    assert.deepEqual([...other.keys()], [...base.keys()], tree.name + ' 文件集合与 dist-desktop 不一致');
    const mismatches = [];
    for (const [rel, sha] of base) {
      if (other.get(rel) !== sha) mismatches.push(rel);
    }
    assert.deepEqual(mismatches, [], tree.name + ' 存在内容不一致文件：' + mismatches.slice(0, 5).join(', '));
  }

  // 快照数值：F1 copied=390；assets 186；index.html sha 为 R4-9 快照
  assert.equal(base.size, EXPECTED_PAYLOAD_FILES, 'payload 文件数应与 F1 copied=390 一致');
  const assetFiles = [...base.keys()].filter((rel) => rel.startsWith('assets/'));
  assert.equal(assetFiles.length, EXPECTED_ASSETS_FILES, 'assets 文件数与 R4-9 快照不一致');
  assert.equal(base.get('index.html'), EXPECTED_INDEX_SHA256, 'index.html sha256 与 R4-9 快照不一致');

  t.diagnostic('三树一致：' + base.size + ' 文件（assets ' + assetFiles.length + '），index.html sha256=' + base.get('index.html'));
});

test('入口 js/css：index.html 引用的现代入口资源在三树存在且 sha256 一致（legacy nomodule 引用按设计已裁剪）', { skip: skipTrees }, (t) => {
  const indexHtml = fs.readFileSync(path.join(DIST_DESKTOP, 'index.html'), 'utf8');
  const refs = [...indexHtml.matchAll(/(?:src|href)="(\/exam\/[^"]+)"/g)].map((match) => match[1]);
  const assetRefs = refs
    .filter((ref) => /^\/exam\/assets\/[^"?#]+\.(js|css)$/.test(ref) && !/legacy/i.test(ref));
  assert.ok(assetRefs.length >= 2, 'index.html 应至少引用现代入口 js + css，实际：' + JSON.stringify(refs));

  const jsRefs = assetRefs.filter((ref) => ref.endsWith('.js'));
  const cssRefs = assetRefs.filter((ref) => ref.endsWith('.css'));
  assert.ok(jsRefs.length >= 1, '缺少现代入口 js 引用');
  assert.ok(cssRefs.length >= 1, '缺少入口 css 引用');

  const trees = TREES;
  for (const ref of assetRefs) {
    const rel = 'assets/' + ref.slice('/exam/assets/'.length);
    const shas = trees.map((tree) => sha256File(path.join(tree.root, rel)));
    assert.equal(new Set(shas).size, 1, rel + ' 在三树中 sha256 不一致');
  }

  // legacy nomodule 引用存在但对应文件按 F1/legacy 规则被裁剪（不应出现在产物）
  const legacyRefs = refs.filter((ref) => /legacy/i.test(ref));
  for (const ref of legacyRefs) {
    const rel = 'assets/' + ref.slice('/exam/assets/'.length);
    for (const tree of trees) {
      assert.equal(fs.existsSync(path.join(tree.root, rel)), false, 'legacy 资源不应进入产物：' + tree.name + '/' + rel);
    }
  }

  t.diagnostic('入口资源三树一致：' + assetRefs.join(', '));
});

test('新 mac DMG：0.1.1 版本/名称/大小/SHA-256 快照 + UDIF 容器可解析（HOTFIX-1 重建）', { skip: skipDmg }, () => {
  assert.equal(pkg.version, EXPECTED_VERSION, 'package.json 版本应为 HOTFIX-1 的 ' + EXPECTED_VERSION);
  assert.equal(path.basename(DMG_PATH), 'Deadpan-' + EXPECTED_VERSION + '-arm64.dmg');
  const size = fs.statSync(DMG_PATH).size;
  assert.ok(size > 100 * 1024 * 1024 && size < 200 * 1024 * 1024, 'DMG 体积异常：' + size);
  const sha256 = sha256File(DMG_PATH);
  assert.equal(sha256, EXPECTED_DMG_SHA256, 'DMG SHA-256 与 HOTFIX-1 0.1.1 快照不一致（重建后需同步更新 EXPECTED_DMG_SHA256）');

  const imageinfo = run('hdiutil', ['imageinfo', DMG_PATH]);
  assert.equal(imageinfo.status, 0, 'hdiutil imageinfo 失败：' + output(imageinfo));
  assert.match(output(imageinfo), /UDIF|CUDIFDiskImage/);
});

test('新 DMG 内 app：codesign adhoc + --verify 通过（只读挂载）', { skip: skipDmg, timeout: 180000 }, (t) => {
  const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), 'dmg-consistency-'));
  let attached = false;
  try {
    const attach = run('hdiutil', ['attach', '-readonly', '-nobrowse', '-noverify', '-mountpoint', mountPoint, DMG_PATH]);
    if (attach.status !== 0) {
      t.skip('hdiutil 挂载不可用（环境限制）：' + output(attach).slice(0, 300));
      return;
    }
    attached = true;

    const appInDmg = path.join(mountPoint, 'Deadpan 判题.app');
    assert.equal(fs.existsSync(appInDmg), true, 'DMG 内 Deadpan 判题.app 缺失');

    const details = run('codesign', ['-dv', '--verbose=4', appInDmg]);
    assert.equal(details.status, 0, 'DMG 内 app codesign -dv 失败：' + output(details));
    assert.match(output(details), /Signature=adhoc/);
    assert.match(output(details), /TeamIdentifier=not set/);

    const verify = run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appInDmg]);
    assert.equal(verify.status, 0, 'DMG 内 app codesign --verify 失败：' + output(verify));
    assert.match(output(verify), /valid on disk/);

    const dmgIndex = path.join(appInDmg, 'Contents', 'Resources', 'dist', 'index.html');
    assert.equal(sha256File(dmgIndex), EXPECTED_INDEX_SHA256, 'DMG 内 index.html 与 R4-9 快照不一致');
  } finally {
    if (attached) {
      const detach = run('hdiutil', ['detach', mountPoint, '-quiet']);
      if (detach.status !== 0) run('hdiutil', ['detach', mountPoint, '-force']);
    }
    try { fs.rmSync(mountPoint, { recursive: true, force: true }); } catch { /* 挂载点清理失败不致命 */ }
  }
});

test('release app（DMG 内容来源）：codesign adhoc + --verify 通过', { skip: skipApp }, () => {
  const details = run('codesign', ['-dv', '--verbose=4', MAC_APP]);
  assert.equal(details.status, 0, 'codesign -dv 失败：' + output(details));
  assert.match(output(details), /Signature=adhoc/);
  assert.match(output(details), /TeamIdentifier=not set/);

  const verify = run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', MAC_APP]);
  assert.equal(verify.status, 0, 'codesign --verify 失败：' + output(verify));
  assert.match(output(verify), /valid on disk/);
  assert.match(output(verify), /satisfies its Designated Requirement/);
});

test('Windows 产物未回退：locales 恰 2 个 .pak（W1）+ exe SHA 未变 + x64 载荷', { skip: skipWin }, () => {
  const localeEntries = fs.readdirSync(WIN_LOCALES_DIR).sort();
  assert.deepEqual(localeEntries, ['en-US.pak', 'zh-CN.pak'], 'Windows locales 应恰为 en-US.pak + zh-CN.pak（W1）');

  assert.equal(pkg.version, EXPECTED_VERSION);
  assert.equal(fs.existsSync(WIN_EXE), true, 'Windows 0.1.1 安装包缺失：' + WIN_EXE);
  assert.equal(sha256File(WIN_EXE), EXPECTED_WIN_EXE_SHA256, 'Windows exe SHA-256 应为 HOTFIX-1 0.1.1 快照');

  const unpacked = run('file', [WIN_UNPACKED_EXE]);
  assert.equal(unpacked.status, 0, 'file 命令失败：' + output(unpacked));
  assert.match(output(unpacked), /PE32\+ executable/);
  assert.match(output(unpacked), /x86-64/);
});
