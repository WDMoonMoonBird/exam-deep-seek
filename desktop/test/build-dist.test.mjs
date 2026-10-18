/**
 * build-dist.test.mjs —— client/dist → dist-desktop 复制与 legacy 裁剪（任务 T4，计划 §6.2）。
 * 覆盖：裁剪规则（monaco-legacy/*-legacy-* / polyfills-legacy）、现代 Monaco 保留、路径安全、dry-run、manifest；
 *       R4-2/F1：noise（.DS_Store）不计入 copied，dry-run 真实口径 copied=390 / noise=2 / pruned=206。
 * 所有用例只用临时目录，不读写仓库 client/dist、不生成 dist-desktop。
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { cleanupTempDirs, createFakeLog, makeTempDir, writeFiles } from './helpers.mjs';
import {
  DEFAULT_OUT, DEFAULT_SRC, LEGACY_RULES, MANIFEST_FILE, NOISE_BASENAMES,
  assertOutWithinRepo, assertSafePaths, copyAndPrune, formatBytes, isNoisePath, main,
  normalizeRelativePath, parseArgs, planPrune, pruneReason, shouldPrune, walkTree,
} from '../scripts/build-dist.mjs';

after(cleanupTempDirs);

// F1：真实 client/dist 只读验证（source 来自 dist-desktop/.desktop-build.json；缺失则 skip）
const DIST_MANIFEST_PATH = path.join(DEFAULT_OUT, MANIFEST_FILE);
const REAL_CLIENT_DIST = (() => {
  try { return JSON.parse(fs.readFileSync(DIST_MANIFEST_PATH, 'utf8')).source; } catch { return null; }
})();
const skipRealSource = !REAL_CLIENT_DIST || !fs.existsSync(path.join(REAL_CLIENT_DIST, 'index.html'))
  ? '真实 client/dist 不可用（dist-desktop manifest source 缺失或未构建）'
  : false;

function makeClientDist() {
  const root = makeTempDir('desktop-dist-src-');
  writeFiles(root, {
    'index.html': '<!doctype html><title>client</title>',
    'assets/app-abc123.js': 'console.log("app");',
    'assets/app-legacy-abc123.js': 'legacy();',
    'monaco/vs/loader.js': '/* modern monaco */',
    'monaco-legacy/vs/loader.js': '/* legacy monaco */',
    'polyfills-legacy-abc123.js': 'polyfill();',
    'error-pages/404.html': '<h1>404</h1>',
    'docs/img/diagram.png': 'PNG-DATA',
    '.DS_Store': 'noise-root',
    'sub/.DS_Store': 'noise-sub',
  });
  return root;
}

test('常量：默认 src/out 指向 client/dist 与 dist-desktop；裁剪规则三条', () => {
  assert.equal(DEFAULT_SRC.endsWith(path.join('client', 'dist')), true);
  assert.equal(DEFAULT_OUT.endsWith('dist-desktop'), true);
  assert.equal(MANIFEST_FILE, '.desktop-build.json');
  assert.deepEqual(LEGACY_RULES.map((rule) => rule.id), ['monaco-legacy-dir', 'legacy-chunk', 'legacy-polyfills']);
});

test('normalizeRelativePath：反斜杠转 /、去前导 /、空值归一', () => {
  assert.equal(normalizeRelativePath('a\\b\\c.js'), 'a/b/c.js');
  assert.equal(normalizeRelativePath('/a/b.js'), 'a/b.js');
  assert.equal(normalizeRelativePath('a/b.js'), 'a/b.js');
  assert.equal(normalizeRelativePath(null), '');
  assert.equal(normalizeRelativePath(undefined), '');
});

test('pruneReason：legacy 目录/legacy chunk/polyfills 命中；现代 Monaco 与普通产物保留', () => {
  assert.equal(pruneReason('monaco-legacy'), 'monaco-legacy-dir');
  assert.equal(pruneReason('monaco-legacy/vs/loader.js'), 'monaco-legacy-dir');
  assert.equal(pruneReason('assets/index-legacy-abc.js'), 'legacy-chunk');
  assert.ok(pruneReason('assets/polyfills-legacy-abc.js'));
  assert.ok(pruneReason('polyfills-legacy-abc.js'));

  for (const keep of ['index.html', 'monaco/vs/loader.js', 'monaco/vs/editor/editor.worker.js',
    'error-pages/404.html', 'docs/img/diagram.png', 'assets/app-abc123.js', 'assets/app-legacy.js', 'legacy.js']) {
    assert.equal(pruneReason(keep), null, '不应裁剪：' + keep);
  }
  assert.equal(pruneReason(''), null);
  assert.equal(pruneReason(null), null);
  assert.equal(shouldPrune('assets/index-legacy-abc.js'), true);
  assert.equal(shouldPrune('assets/app-abc123.js'), false);

  // F1：.DS_Store 噪声属独立分类，不是 legacy 裁剪
  assert.deepEqual([...NOISE_BASENAMES], ['.DS_Store']);
  assert.equal(isNoisePath('.DS_Store'), true);
  assert.equal(isNoisePath('sub/.DS_Store'), true);
  assert.equal(isNoisePath('a/.DS_Store.bak'), false);
  assert.equal(isNoisePath('assets/app.js'), false);
  assert.equal(pruneReason('.DS_Store'), null);
});

test('planPrune：统计保留/裁剪数量与字节数', () => {
  const plan = planPrune([
    { path: 'index.html', size: 100 },
    { path: 'assets/app-legacy-1.js', size: 50 },
    { path: 'monaco/vs/loader.js', size: 20 },
    { path: '/polyfills-legacy-2.js', size: 5 },
    { path: '.DS_Store', size: 7 },
  ]);
  assert.equal(plan.keep.length, 2);
  assert.equal(plan.prune.length, 2);
  assert.equal(plan.noise.length, 1, 'F1：.DS_Store 应归入 noise');
  assert.equal(plan.keptBytes, 120);
  assert.equal(plan.prunedBytes, 55);
  assert.equal(plan.noiseBytes, 7);
  assert.equal(plan.prune[0].reason, 'legacy-chunk');
});

test('walkTree：递归列出文件相对路径（posix 分隔符）与字节数', () => {
  const root = makeTempDir('desktop-walk-');
  writeFiles(root, { 'a.js': 'abc', 'sub/b.css': '12345', 'sub/deep/c.txt': 'x' });
  const files = walkTree(root);
  assert.deepEqual(Object.fromEntries(files.map((file) => [file.path, file.size])), {
    'a.js': 3,
    'sub/b.css': 5,
    'sub/deep/c.txt': 1,
  });
});

test('assertSafePaths：拒绝相同/嵌套目录，正常路径返回解析结果', () => {
  assert.equal(assertSafePaths('/a/client/dist', '/a/client/dist').ok, false);
  assert.equal(assertSafePaths('/a/client/dist', '/a/client/dist/out').ok, false);
  assert.equal(assertSafePaths('/a/client/dist/sub', '/a/client/dist').ok, false);
  assert.equal(assertSafePaths('', '/a/out').ok, false);

  const ok = assertSafePaths('./client/dist', './dist-desktop');
  assert.equal(ok.ok, true);
  assert.equal(ok.src, path.resolve('./client/dist'));
  assert.equal(ok.out, path.resolve('./dist-desktop'));
});

test('assertSafePaths：拒绝文件系统根目录（F5 兜底）', () => {
  const rootOut = assertSafePaths('/tmp/desktop-src-root-guard', '/');
  assert.equal(rootOut.ok, false);
  assert.match(rootOut.reason, /根目录/);
});

test('assertOutWithinRepo：--out 必须在仓库根下且不得等于仓库根（F5 CLI 约束）', () => {
  const repoRoot = path.resolve('/tmp/fake-repo');
  assert.equal(assertOutWithinRepo(path.join(repoRoot, 'dist-desktop'), { repoRoot }).ok, true);
  assert.equal(assertOutWithinRepo(path.join(repoRoot, 'nested', 'out'), { repoRoot }).ok, true);
  assert.equal(assertOutWithinRepo(repoRoot, { repoRoot }).ok, false);
  assert.equal(assertOutWithinRepo('/', { repoRoot }).ok, false);
  assert.equal(assertOutWithinRepo(path.join(repoRoot, '..', 'outside'), { repoRoot }).ok, false);
  assert.equal(assertOutWithinRepo('', { repoRoot }).ok, false);
});

test('formatBytes：B/KB/MB 展示', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(500), '500 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(1024 * 1024), '1.0 MB');
  assert.equal(formatBytes(undefined), '0 B');
});

test('parseArgs：默认值、--dry-run、--src/--out 两种写法、未知参数抛错', () => {
  assert.deepEqual(parseArgs([]), { srcDir: DEFAULT_SRC, outDir: DEFAULT_OUT, dryRun: false, help: false });
  const options = parseArgs(['--src', '/tmp/src', '--out', '/tmp/out', '--dry-run']);
  assert.deepEqual(options, { srcDir: path.resolve('/tmp/src'), outDir: path.resolve('/tmp/out'), dryRun: true, help: false });
  const inline = parseArgs(['--src=/tmp/src2', '--out=/tmp/out2']);
  assert.equal(inline.srcDir, path.resolve('/tmp/src2'));
  assert.equal(inline.outDir, path.resolve('/tmp/out2'));
  assert.equal(parseArgs(['-h']).help, true);
  assert.throws(() => parseArgs(['--bogus']), /未知参数/);
});

test('copyAndPrune：dry-run 只统计不写盘；真实复制裁剪 legacy 并写 manifest', () => {
  const src = makeClientDist();
  const outDry = path.join(makeTempDir('desktop-dist-out-'), 'dist-desktop');

  const dry = copyAndPrune({ srcDir: src, outDir: outDry, dryRun: true });
  assert.equal(dry.ok, true);
  assert.equal(dry.dryRun, true);
  assert.equal(dry.total, 10);
  assert.equal(dry.copied, 5, 'F1：noise 不计入 copied');
  assert.equal(dry.pruned, 3);
  assert.equal(dry.noise, 2);
  assert.equal(dry.noiseBytes, Buffer.byteLength('noise-root') + Buffer.byteLength('noise-sub'));
  assert.equal(dry.copied + dry.pruned + dry.noise, dry.total);
  assert.equal(fs.existsSync(outDry), false, 'dry-run 不应创建输出目录');
  assert.deepEqual(dry.prunedPaths.sort(), [
    'assets/app-legacy-abc123.js',
    'monaco-legacy/vs/loader.js',
    'polyfills-legacy-abc123.js',
  ]);

  const out = path.join(makeTempDir('desktop-dist-out-'), 'dist-desktop');
  const result = copyAndPrune({ srcDir: src, outDir: out, now: () => 0 });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, false);
  assert.equal(result.manifestPath, path.join(out, MANIFEST_FILE));

  for (const kept of ['index.html', 'assets/app-abc123.js', 'monaco/vs/loader.js', 'error-pages/404.html', 'docs/img/diagram.png']) {
    assert.equal(fs.existsSync(path.join(out, kept)), true, '应保留：' + kept);
  }
  for (const pruned of ['assets/app-legacy-abc123.js', 'monaco-legacy', 'polyfills-legacy-abc123.js']) {
    assert.equal(fs.existsSync(path.join(out, pruned)), false, '应裁剪：' + pruned);
  }
  assert.equal(fs.existsSync(path.join(out, '.DS_Store')), false, '噪声 .DS_Store 不应进入产物');
  assert.equal(fs.existsSync(path.join(out, 'sub', '.DS_Store')), false, '子目录噪声 .DS_Store 不应进入产物');

  const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
  assert.equal(manifest.total, 10);
  assert.equal(manifest.copied, 5);
  assert.equal(manifest.pruned, 3);
  assert.equal(manifest.noise, 2);
  assert.ok(manifest.noiseBytes > 0, 'manifest noiseBytes 应 >0');
  assert.equal(manifest.copied + manifest.pruned + manifest.noise, manifest.total);
  assert.equal(manifest.generatedAt, '1970-01-01T00:00:00.000Z');
  assert.equal(manifest.prunedPaths.length, 3);
});

test('copyAndPrune：源目录缺 index.html / 输出嵌套在源内 / 源输出相同 均失败', () => {
  const src = makeClientDist();
  fs.rmSync(path.join(src, 'index.html'));
  const out = path.join(makeTempDir('desktop-dist-out-'), 'out');
  const missing = copyAndPrune({ srcDir: src, outDir: out });
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /index\.html/);

  const realSrc = makeClientDist();
  const nested = copyAndPrune({ srcDir: realSrc, outDir: path.join(realSrc, 'dist-desktop') });
  assert.equal(nested.ok, false);
  assert.match(nested.reason, /不能位于/);

  const same = copyAndPrune({ srcDir: realSrc, outDir: realSrc });
  assert.equal(same.ok, false);
});

test('main：--help 返回 0；未知参数/缺源返回 2；dry-run 与真实构建返回 0', () => {
  const src = makeClientDist();
  const out = path.join(makeTempDir('desktop-dist-main-'), 'dist-desktop');

  const helpLog = createFakeLog();
  assert.equal(main(['--help'], { log: helpLog }), 0);
  assert.ok(helpLog.entries.log.join('\n').includes('用法'));

  const badLog = createFakeLog();
  assert.equal(main(['--bogus'], { log: badLog }), 2);
  assert.equal(badLog.entries.error.length, 1);

  const missingLog = createFakeLog();
  assert.equal(main(['--src', path.join(makeTempDir('desktop-dist-none-'), 'nope'), '--out', out], { log: missingLog }), 2);
  assert.equal(missingLog.entries.error.length, 1);

  const dryLog = createFakeLog();
  assert.equal(main(['--src', src, '--out', out, '--dry-run'], { log: dryLog, now: () => 0 }), 0);
  assert.ok(dryLog.entries.log.join('\n').includes('dry-run'));
  assert.equal(fs.existsSync(out), false);

  const buildLog = createFakeLog();
  assert.equal(main(['--src', src, '--out', out], { log: buildLog, now: () => 0 }), 0);
  assert.ok(fs.existsSync(path.join(out, 'index.html')));
  assert.ok(fs.existsSync(path.join(out, MANIFEST_FILE)));
});

test('copyAndPrune：--out 为文件系统根目录 ⇒ 拒绝且不删除（F5）', () => {
  const src = makeClientDist();
  const result = copyAndPrune({ srcDir: src, outDir: '/' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /根目录/);
});

test('main(enforceRepoOut)：--out / 或 /tmp 系路径 exit 2 且不删；仓库内默认路径正常（F5）', () => {
  const src = makeClientDist();
  const victimDir = path.join(makeTempDir('desktop-dist-victim-'), 'dist-desktop');
  fs.mkdirSync(victimDir, { recursive: true });
  const marker = path.join(victimDir, 'keep-me.txt');
  fs.writeFileSync(marker, 'keep');

  const rootLog = createFakeLog();
  assert.equal(main(['--src', src, '--out', '/'], { log: rootLog, enforceRepoOut: true }), 2);
  assert.match(rootLog.entries.error.join('\n'), /输出目录/);

  const tmpLog = createFakeLog();
  assert.equal(main(['--src', src, '--out', victimDir], { log: tmpLog, enforceRepoOut: true }), 2);
  assert.equal(fs.existsSync(marker), true, 'exit 2 时不得删除目标目录');
  assert.equal(fs.existsSync(path.join(victimDir, 'index.html')), false);
  assert.match(tmpLog.entries.error.join('\n'), /仓库根/);

  // 默认 --out（仓库内 dist-desktop）+ dry-run：CLI 约束通过且不写盘
  const existedBefore = fs.existsSync(DEFAULT_OUT);
  const defaultLog = createFakeLog();
  assert.equal(main(['--src', src, '--dry-run'], { log: defaultLog, enforceRepoOut: true }), 0);
  assert.ok(defaultLog.entries.log.join('\n').includes('dry-run'));
  assert.equal(fs.existsSync(DEFAULT_OUT), existedBefore, 'dry-run 不得创建/删除仓库 dist-desktop');
});

test('F1：真实 client/dist dry-run 口径 copied=390 / noise=2 / noiseBytes>0 / pruned=206', { skip: skipRealSource }, () => {
  const out = path.join(makeTempDir('desktop-dist-realdry-'), 'dist-desktop');
  const dry = copyAndPrune({ srcDir: REAL_CLIENT_DIST, outDir: out, dryRun: true });

  assert.equal(dry.ok, true);
  assert.equal(dry.dryRun, true, '必须只统计、不写盘');
  assert.equal(dry.total, 598);
  assert.equal(dry.copied, 390, 'F1：copied 不应包含 .DS_Store 噪声');
  assert.equal(dry.noise, 2, 'master client/dist 应含 2 个 .DS_Store');
  assert.ok(dry.noiseBytes > 0, 'noiseBytes 应 >0');
  assert.equal(dry.pruned, 206);
  assert.equal(dry.copied + dry.pruned + dry.noise, dry.total);
  assert.equal(fs.existsSync(out), false, 'dry-run 不得创建输出目录');

  // legacy 规则本轮未动（3 条：monaco-legacy 目录 / *-legacy-*.js / polyfills-legacy-*.js）
  assert.deepEqual(LEGACY_RULES.map((rule) => rule.id), ['monaco-legacy-dir', 'legacy-chunk', 'legacy-polyfills']);
  for (const prunedPath of dry.prunedPaths) {
    assert.equal(pruneReason(prunedPath) !== null, true, '裁剪项未命中 legacy 规则：' + prunedPath);
  }
});
