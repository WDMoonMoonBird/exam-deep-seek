#!/usr/bin/env node
/**
 * 门禁自测（W1-C-gate）：typeof 守卫的「构建期 define」豁免 —— 复现夹具 + 真阳性反证
 *
 * 用法：node scripts/gates/lint-check-self-test.test.mjs
 * 退出码：0 = 全部断言通过；1 = 有断言失败（含"应当红却没红"）
 *
 * 覆盖：
 *   ① `--self-test` 正控自检必须过（正控全命中 + 干净树 0 误报）
 *   ② 复现夹具：vite `define` 的标准写法
 *      `typeof X !== 'undefined' && X ? String(X) : 'dev'` 必须**零 no-undef**（修复前该条被误报 2 次）
 *   ③ 真阳性仍被抓（豁免不得过头）：裸未声明标识符 / 异名 typeof 守卫 / `||` 右侧 必须**仍报** no-undef
 *   ④ 真实仓库 `client/src/composables/appVersion.js` 不再出现 `__BUILD_VERSION__` 违规（本仓实况）
 *
 * 生产零写入：只在 os.tmpdir() 下建临时树，跑完即删；不改 client/**、server/**、scripts/** 任何文件。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const GATE = path.join(REPO, 'scripts/gates/lint-check.mjs');
const GUARDED_NAME = '__BUILD_VERSION__';

const results = [];
const check = (desc, ok, detail = '') => results.push({ desc, ok, detail });

function runGate(args) {
  const res = spawnSync(process.execPath, [GATE, ...args], { cwd: REPO, encoding: 'utf8', timeout: 180000 });
  return { status: res.status, out: String(res.stdout || ''), err: String(res.stderr || '') };
}

function noUndefOf(root) {
  const r = runGate(['--root', root, '--rule=no-undef', '--json']);
  const parsed = JSON.parse(r.out);              // 门禁 --json 输出
  return (parsed.violations || []).filter((v) => v.rule === 'no-undef');
}

// ── ① 正控自检
const st = runGate(['--self-test']);
check('--self-test 通过（正控全命中 + 干净树 0 误报）',
  st.status === 0 && st.out.includes('SELF-TEST PASSED'),
  'exit=' + st.status);

// ── ②③ 临时树：复现夹具 + 反证夹具
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-gate-w1c-'));
try {
  const put = (rel, code) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, code);
  };
  put('guard/guarded-define.js', [
    '// vite define 的标准写法（修复前被误报 2 次 no-undef）',
    "export const buildStamp = typeof " + GUARDED_NAME + " !== 'undefined' && " + GUARDED_NAME
      + ' ? String(' + GUARDED_NAME + ") : 'dev';",
  ].join('\n'));
  put('guard/true-positive-bare.js', 'export function boom() { return neverDeclaredAnywhere(); }');
  put('guard/true-positive-wrong-name.js', "export const x = typeof window !== 'undefined' && missingAfterGuard;");
  put('guard/true-positive-or-branch.js', 'export const y = globalFlag || ghostInOr;');

  const fresh = noUndefOf(dir);
  const inFile = (symbol) => fresh.filter((v) => v.symbol === symbol);
  const symbolOfGuarded = GUARDED_NAME;

  check('② 复现夹具（typeof 守卫的构建期 define）零 no-undef',
    inFile(symbolOfGuarded).length === 0,
    '命中 ' + inFile(symbolOfGuarded).length + ' 条');
  check('③ 真阳性·裸未声明标识符仍被抓',
    inFile('neverDeclaredAnywhere').length === 1,
    '命中 ' + inFile('neverDeclaredAnywhere').length + ' 条');
  check('③ 真阳性·异名 typeof 守卫不得豁免（typeof window && missingAfterGuard）',
    inFile('missingAfterGuard').length === 1,
    '命中 ' + inFile('missingAfterGuard').length + ' 条');
  check('③ 真阳性·|| 右侧不得豁免（flag || ghostInOr）',
    inFile('ghostInOr').length === 1,
    '命中 ' + inFile('ghostInOr').length + ' 条');

  // ── ④ 真实仓库实况：appVersion.js 不再有 __BUILD_VERSION__
  const repoRun = runGate(['--rule=no-undef', '--json']);
  const repoParsed = JSON.parse(repoRun.out);
  const repoHit = (repoParsed.violations || []).filter((v) => v.symbol === GUARDED_NAME);
  check('④ 真实仓库中 __BUILD_VERSION__ 违规已消失（client/src/composables/appVersion.js）',
    repoHit.length === 0,
    '命中 ' + repoHit.length + ' 条' + (repoHit.length ? '：' + JSON.stringify(repoHit) : ''));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── 汇总
const failed = results.filter((r) => !r.ok);
console.log('=== lint-check-self-test（W1-C-gate：typeof 守卫豁免 + 真阳性反证）===');
for (const r of results) console.log('  ' + (r.ok ? '✓' : '✗') + ' ' + r.desc + (r.detail ? '  [' + r.detail + ']' : ''));
if (failed.length) {
  console.log('FAILED（' + failed.length + ' 项）');
  process.exit(1);
}
console.log('PASSED（' + results.length + '/' + results.length + '）');
process.exit(0);
