/**
 * build-dist.mjs —— 把 client/dist 复制成桌面专用 dist-desktop 并裁剪 legacy 兼容产物（计划 §6.2）。
 *
 * 纯 helper + CLI：node desktop/scripts/build-dist.mjs [--src <dir>] [--out <dir>] [--dry-run]
 * 规则：
 *   · 只读 client/dist，**绝不**写/覆盖它；输出固定在仓库根 dist-desktop（已 gitignore）
 *   · 裁剪精确命中：monaco-legacy/ 目录、*-legacy-*.js、polyfills-legacy-*.js（现代 Chromium 不加载）
 *   · 保留现代 Monaco（monaco/vs/** 及其 worker，格式化依赖）；保留 error-pages/、文档图片、robots 等
 *   · --dry-run 只统计、不写盘；源缺失/未构建时明确非零退出（不静默成功）
 * 依赖：只 import node 内置；不 import desktop/src（A 基线 §3.2）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '..');

export const DEFAULT_SRC = path.join(REPO_ROOT, 'client', 'dist');
export const DEFAULT_OUT = path.join(REPO_ROOT, 'dist-desktop');
export const MANIFEST_FILE = '.desktop-build.json';
const REQUIRED_ENTRY = 'index.html';

/** 裁剪规则（精确前缀/文件名，不做模糊 contains —— 防误删现代 Monaco worker） */
export const LEGACY_RULES = Object.freeze([
  { id: 'monaco-legacy-dir', test: (rel) => rel === 'monaco-legacy' || rel.startsWith('monaco-legacy/') },
  { id: 'legacy-chunk', test: (rel) => /(?:^|\/)[^/]*-legacy-[^/]*\.js$/.test(rel) },
  { id: 'legacy-polyfills', test: (rel) => /(?:^|\/)polyfills-legacy-[^/]*\.js$/.test(rel) },
]);

/** 噪声文件（不进入桌面产物；独立于 legacy 裁剪规则，不计入 pruned 统计） */
export const NOISE_BASENAMES = Object.freeze(['.DS_Store']);

export function isNoisePath(relPath) {
  const rel = normalizeRelativePath(relPath);
  if (rel === '') return false;
  const base = rel.slice(rel.lastIndexOf('/') + 1);
  return NOISE_BASENAMES.includes(base);
}

export function normalizeRelativePath(relPath) {
  return String(relPath == null ? '' : relPath).replace(/\\/g, '/').replace(/^\/+/, '');
}

export function pruneReason(relPath) {
  const rel = normalizeRelativePath(relPath);
  if (rel === '') return null;
  const rule = LEGACY_RULES.find((item) => item.test(rel));
  return rule ? rule.id : null;
}

export function shouldPrune(relPath) {
  return pruneReason(relPath) !== null;
}

/** 统计裁剪计划（纯函数）：entries = [{ path, size }] → { keep, prune, keptBytes, prunedBytes } */
export function planPrune(entries) {
  const keep = [];
  const prune = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const rel = normalizeRelativePath(entry && entry.path);
    const size = Number(entry && entry.size) || 0;
    const reason = pruneReason(rel);
    if (reason) prune.push({ path: rel, size, reason });
    else keep.push({ path: rel, size });
  }
  const sum = (items) => items.reduce((total, item) => total + item.size, 0);
  return { keep, prune, keptBytes: sum(keep), prunedBytes: sum(prune) };
}

/** 递归列出文件（相对路径 + 字节数；不跟随符号链接目录） */
export function walkTree(rootDir, { fsImpl = fs } = {}) {
  const root = path.resolve(rootDir);
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fsImpl.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) files.push({ path: path.relative(root, abs).split(path.sep).join('/'), size: fsImpl.statSync(abs).size });
    }
  };
  walk(root);
  return files;
}

/** 路径安全检查：输出目录不得等于/位于源内，源也不得位于输出内 */
export function assertSafePaths(srcDir, outDir) {
  if (typeof srcDir !== 'string' || srcDir === '' || typeof outDir !== 'string' || outDir === '') {
    return { ok: false, reason: 'src/out 不能为空' };
  }
  const src = path.resolve(srcDir);
  const out = path.resolve(outDir);
  // 兜底：任何情况下都不允许把文件系统根目录当输出目录（避免 rmSync 灾难，F5）
  if (out === path.parse(out).root) return { ok: false, reason: '输出目录不能是文件系统根目录' };
  if (src === out) return { ok: false, reason: '输出目录不能等于源目录' };
  if (out.startsWith(src + path.sep)) return { ok: false, reason: '输出目录不能位于 client/dist 内' };
  if (src.startsWith(out + path.sep)) return { ok: false, reason: '源目录不能位于输出目录内' };
  return { ok: true, src, out };
}

/**
 * CLI 专用输出目录约束（F5）：--out 必须在仓库根下、不得等于仓库根。
 * 程序化调用（测试用临时目录）不走此约束；真实 CLI 入口强制启用。
 * "不得包含 src" 由 assertSafePaths 的嵌套判定负责。
 */
export function assertOutWithinRepo(outDir, { repoRoot = REPO_ROOT } = {}) {
  if (typeof outDir !== 'string' || outDir === '') return { ok: false, reason: '输出目录不能为空' };
  const root = path.resolve(repoRoot);
  const out = path.resolve(outDir);
  if (out === root) return { ok: false, reason: '输出目录不能等于仓库根（' + root + '）' };
  if (!out.startsWith(root + path.sep)) return { ok: false, reason: '输出目录必须在仓库根下（' + root + '）' };
  return { ok: true, out };
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + ' MB';
  if (value >= 1024) return (value / 1024).toFixed(1) + ' KB';
  return value + ' B';
}

/**
 * 复制并裁剪：返回 { ok, dryRun, srcDir, outDir, total, copied, pruned, prunedBytes, ... }。
 * dryRun 时只读源目录、不创建/删除任何文件（A 基线 §5-C10）。
 */
export function copyAndPrune({ srcDir = DEFAULT_SRC, outDir = DEFAULT_OUT, dryRun = false, fsImpl = fs, now = Date.now } = {}) {
  const safe = assertSafePaths(srcDir, outDir);
  if (!safe.ok) return { ok: false, reason: safe.reason };
  const srcRoot = safe.src;
  const outRoot = safe.out;

  if (!fsImpl.existsSync(path.join(srcRoot, REQUIRED_ENTRY))) {
    return {
      ok: false,
      srcDir: srcRoot,
      outDir: outRoot,
      reason: 'client/dist 不存在或未构建（缺少 ' + REQUIRED_ENTRY + '）：请先在 client 目录完成前端构建（本轮不安装依赖）',
    };
  }

  const files = walkTree(srcRoot, { fsImpl });
  const plan = planPrune(files);
  const result = {
    ok: true,
    dryRun: dryRun === true,
    srcDir: srcRoot,
    outDir: outRoot,
    total: files.length,
    copied: plan.keep.length,
    pruned: plan.prune.length,
    prunedBytes: plan.prunedBytes,
    prunedPaths: plan.prune.map((item) => item.path),
  };
  if (dryRun === true) return result;

  fsImpl.rmSync(outRoot, { recursive: true, force: true });
  fsImpl.mkdirSync(outRoot, { recursive: true });
  const filter = (source) => {
    const rel = normalizeRelativePath(path.relative(srcRoot, source));
    if (rel === '') return true;
    if (isNoisePath(rel)) return false;
    return !shouldPrune(rel);
  };
  fsImpl.cpSync(srcRoot, outRoot, { recursive: true, filter });

  const manifest = {
    generatedAt: new Date(now()).toISOString(),
    source: srcRoot,
    total: files.length,
    copied: plan.keep.length,
    pruned: plan.prune.length,
    prunedBytes: plan.prunedBytes,
    prunedPaths: plan.prune.map((item) => item.path),
  };
  const manifestPath = path.join(outRoot, MANIFEST_FILE);
  fsImpl.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { ...result, manifestPath };
}

const USAGE = [
  '用法：node desktop/scripts/build-dist.mjs [--src <client/dist>] [--out <dist-desktop>] [--dry-run]',
  '  --dry-run  只打印裁剪计划，不写盘（用于验证 legacy 命中集）',
  '  --src      源目录（默认 <repo>/client/dist，只读）',
  '  --out      输出目录（默认 <repo>/dist-desktop；CLI 下必须位于仓库根内，否则 exit 2）',
].join('\n');

export function parseArgs(argv) {
  const options = { srcDir: DEFAULT_SRC, outDir: DEFAULT_OUT, dryRun: false, help: false };
  const args = Array.isArray(argv) ? argv : [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--src') { options.srcDir = path.resolve(String(args[index + 1] || '')); index += 1; }
    else if (arg.startsWith('--src=')) options.srcDir = path.resolve(arg.slice('--src='.length));
    else if (arg === '--out') { options.outDir = path.resolve(String(args[index + 1] || '')); index += 1; }
    else if (arg.startsWith('--out=')) options.outDir = path.resolve(arg.slice('--out='.length));
    else throw new Error('未知参数：' + String(arg).slice(0, 80));
  }
  return options;
}

/**
 * CLI 主流程：返回退出码（0 成功；2 参数/源缺失/路径非法）。
 * enforceRepoOut=true 时强制 --out 位于仓库根内（真实 CLI 入口启用；程序化测试默认关闭，F5）。
 */
export function main(argv = process.argv.slice(2), {
  log = console, fsImpl = fs, now = Date.now, enforceRepoOut = false,
} = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    log.error('[build-dist] ' + ((err && err.message) || err));
    return 2;
  }
  if (options.help) {
    log.log(USAGE);
    return 0;
  }
  if (enforceRepoOut) {
    const outCheck = assertOutWithinRepo(options.outDir);
    if (!outCheck.ok) {
      log.error('[build-dist] ' + outCheck.reason);
      return 2;
    }
  }
  const result = copyAndPrune({ ...options, fsImpl, now });
  if (!result.ok) {
    log.error('[build-dist] ' + result.reason);
    return 2;
  }
  const prefix = result.dryRun ? '[build-dist] dry-run（未写盘）' : '[build-dist] 完成';
  log.log(prefix + '：保留 ' + result.copied + ' 个文件，裁剪 ' + result.pruned + ' 个（-' + formatBytes(result.prunedBytes) + '）');
  log.log('[build-dist] 源：' + result.srcDir);
  log.log('[build-dist] 输出：' + result.outDir);
  if (result.dryRun && result.prunedPaths && result.prunedPaths.length > 0) {
    log.log('[build-dist] 将裁剪（前 50 条）：' + result.prunedPaths.slice(0, 50).join(', '));
  }
  return 0;
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) process.exitCode = main(process.argv.slice(2), { enforceRepoOut: true });
