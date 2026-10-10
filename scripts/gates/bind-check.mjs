#!/usr/bin/env node
/**
 * ESM 跨模块绑定门禁（第 4 门禁 · round 5 由 round 3 原型 /tmp/c3-bindcheck.mjs 晋升）
 *
 * 为什么需要它（constraints §3 陷阱 12）：
 *   `node --check` **只做语法检查，不校验跨模块绑定**。于是「删掉本地副本却忘了给被复用方加 export」
 *   这类坏树可以同时骗过：node --check、cycle-check、check-layers、arch-metrics、hard-metrics
 *   —— 三门禁全绿，直到真正 import 那一刻才抛 `SyntaxError: does not provide an export named ...`。
 *   本门禁把「真 import 一次」固化为每次可跑的静态检查（实测 ~0.06s / 全仓）。
 *
 * 判定：
 *   - 对每个被扫描模块，抽取它的 **import 需求**（具名 import / default / re-export）与
 *     被导入模块的 **export 面**（export function|class|const|let|var / export {} / export default）；
 *   - 具名 import 在被导入模块的 export 面中不存在 → **BINDING VIOLATION**；
 *   - 相对路径无法解析到已扫描文件 → 单独计数（external / unresolved），**仅登记不判负**（见文末边界④）。
 *
 * 退出码：0 = 零违规；1 = 有绑定违规；2 = 执行错误；--self-test 下 0 = 负向自测通过。
 * 用法：node scripts/gates/bind-check.mjs [root ...] [--show-clean] [--json] [--self-test]
 *   默认根：server/src 与 server/test（相对仓库根）；只接受 .js/.mjs/.cjs 文本模块。
 *
 * ⚠️ 已知边界（保守跳过 ⇒ 只会**漏报**、不会误报；审计 round 04 §2.7-7 明示）：
 *   ① `export * from` 星号再导出：无法在不求值的情况下判定来源 ⇒ 跳过；
 *   ② CJS（module.exports / exports.x）：不是 ESM 绑定语义 ⇒ 跳过；
 *   ③ 动态 `import()` 与 `require()`：非静态可判定 ⇒ 不纳入；
 *   ④ 解析不到扫描集合的相对 import：仅登记不判负 —— 实测 5 例全部是测试夹具里嵌入的合成 import 字符串
 *      （如 fact-extractor.test.js 的 './App.vue'）或指向扫描根之外的真实文件（'../../../scripts/*.mjs'），
 *      对它们 fail-closed 会让门禁**永远红灯**（= 另一种形式的假门禁）。
 *   故本门禁证明力 = 「具名/default 静态 import 全部有真实导出」，不等于「全仓无坏绑定」。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_ROOTS = ['server/src', 'server/test'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);
const MAX_PRINT = 40;

// ---------------------------------------------------------------- 参数

function parseArgs(argv) {
  const out = { roots: [], showClean: false, json: false, selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') out.roots.push(argv[++i]);
    else if (a === '--show-clean') out.showClean = true;
    else if (a === '--json') out.json = true;
    else if (a === '--self-test') out.selfTest = true;
    else if (a.startsWith('-')) { console.error('未知参数: ' + a); process.exit(2); }
    else out.roots.push(a);
  }
  if (out.roots.length === 0) out.roots = DEFAULT_ROOTS.slice();
  out.roots = out.roots.map(r => path.resolve(REPO, r));
  return out;
}

// ---------------------------------------------------------------- 采集

function collectFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) collectFiles(p, acc); }
    else if (e.isFile() && /\.(js|mjs|cjs)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const stripComments = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/** 模块的 export 面 */
function exportsOf(file) {
  const code = stripComments(fs.readFileSync(file, 'utf8'));
  const named = new Set();
  let hasDefault = false, hasStarReexport = false, isCJS = false;
  for (const m of code.matchAll(/^\s*export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/gm)) named.add(m[1]);
  for (const m of code.matchAll(/^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) named.add(m[1]);
  for (const m of code.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const t = part.trim(); if (!t) continue;
      if (/^default\s+as\s+/.test(t)) { hasDefault = true; continue; }
      const as = t.split(/\s+as\s+/); named.add((as[1] || as[0]).trim());
    }
  }
  if (/^\s*export\s+default\b/m.test(code)) hasDefault = true;
  if (/^\s*export\s*\*\s*from\b/m.test(code)) hasStarReexport = true;
  if (/\bmodule\.exports\b|\bexports\.[A-Za-z_$]/.test(code)) isCJS = true;
  return { named, hasDefault, hasStarReexport, isCJS };
}

/** 模块的 import 需求 */
function importsOf(file) {
  const code = stripComments(fs.readFileSync(file, 'utf8'));
  const out = [];
  for (const m of code.matchAll(/\bimport\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g)) {
    const clause = m[1].trim();
    const names = [];
    const braced = clause.match(/\{([^}]*)\}/);
    if (braced) for (const part of braced[1].split(',')) {
      const t = part.trim(); if (!t) continue;
      names.push(t.split(/\s+as\s+/)[0].trim());
    }
    // 默认导入：import def from '…' 与 import def, { a } from '…' 都要计入（原型只认 * as）
    const star = /^\*\s+as\s+/.test(clause);
    const defMatch = clause.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/);
    if (star) names.push('*');
    else if (defMatch) names.push('default');
    out.push({ spec: m[2], names });
  }
  for (const m of code.matchAll(/\bexport\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const names = m[1].split(',').map(s => s.trim()).filter(Boolean).map(s => {
      const as = s.split(/\s+as\s+/); return (as[1] || as[0]).trim();
    });
    out.push({ spec: m[2], names, reexport: true });
  }
  return out;
}

// ---------------------------------------------------------------- 扫描

function scan(roots, repoRoot) {
  const files = [...new Set(roots.flatMap(r => collectFiles(r)))];
  const fileSet = new Set(files);
  const cache = new Map();
  const exp = f => { if (!cache.has(f)) cache.set(f, exportsOf(f)); return cache.get(f); };

  let checked = 0;
  const violations = [];
  const external = [];    // 解析到扫描根之外的**真实存在**文件（跨根引用，非缺陷）
  const unresolved = [];  // 既不在扫描集合、磁盘上也不存在（多为测试夹具里的合成 import 字符串）

  for (const f of files) {
    for (const imp of importsOf(f)) {
      if (!imp.spec.startsWith('.')) continue;      // 裸模块标识符（npm 包）不在门禁范围
      const base = path.resolve(path.dirname(f), imp.spec);
      const target = [base, base + '.js', base + '.mjs', base + '.cjs', path.join(base, 'index.js')].find(c => fileSet.has(c));
      if (!target) {
        const onDisk = [base, base + '.js', base + '.mjs', base + '.cjs'].some(c => fs.existsSync(c)) || fs.existsSync(base);
        (onDisk ? external : unresolved).push({ f, spec: imp.spec });
        continue;
      }
      const te = exp(target);
      if (te.isCJS) continue;                       // 边界②
      for (const n of imp.names) {
        checked++;
        if (n === '*') continue;
        if (n === 'default') { if (!te.hasDefault) violations.push({ f, target, n, why: 'module has no default export' }); continue; }
        if (te.named.has(n)) continue;
        if (te.hasStarReexport) continue;           // 边界①
        violations.push({ f, target, n, why: "module does not export '" + n + "'" });
      }
    }
  }
  const rel = p => (repoRoot ? path.relative(repoRoot, p) : p);
  return { modules: files.length, checked, violations, external, unresolved, rel };
}

// ---------------------------------------------------------------- 负向自测

/**
 * 负向自测：在临时目录造 3 类「导入了但对方没导出」的合成坏绑定，
 * 断言门禁**必须**逐条精确报出 —— 检测不到即 exit 1（没有负向自测的门禁等于永远绿灯）。
 */
function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bind-check-selftest-'));
  const cases = [
    { file: 'missing-named.mjs', code: "import { ghostNamed } from './ok.mjs';\nexport const x = ghostNamed;\n", expect: 'ghostNamed', why: "module does not export 'ghostNamed'" },
    { file: 'missing-default.mjs', code: "import def from './ok.mjs';\nexport const y = def;\n", expect: 'default', why: 'module has no default export' },
    { file: 'missing-reexport.mjs', code: "export { ghostReexport } from './ok.mjs';\n", expect: 'ghostReexport', why: "module does not export 'ghostReexport'" },
  ];
  fs.writeFileSync(path.join(dir, 'ok.mjs'), 'export const realExport = 1;\n');
  fs.writeFileSync(path.join(dir, 'clean.mjs'), "import { realExport } from './ok.mjs';\nexport const z = realExport;\n");
  for (const c of cases) fs.writeFileSync(path.join(dir, c.file), c.code);

  const res = scan([dir], dir);
  const found = res.violations.map(v => ({ name: v.n, why: v.why }));
  let failures = [];
  for (const c of cases) {
    if (!found.some(v => v.name === c.expect && v.why === c.why)) failures.push(c.file + ': 未报出 ' + c.why);
  }
  if (found.some(v => v.name === 'realExport')) failures.push('ok.mjs 的合法绑定被误报（假阳性）');

  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  console.log('=== bind-check --self-test（负向自测：合成坏绑定必须被精确报出）===');
  console.log('synthetic modules scanned    :', res.modules, '(5 期望：ok.mjs + clean.mjs + 3 个破损模块)');
  console.log('synthetic violations detected:', res.violations.length, '(3 期望)');
  for (const v of res.violations) console.log('  ✗ ' + path.basename(v.f) + ' -> ' + v.why);
  if (failures.length) {
    console.log('SELF-TEST FAILED:');
    for (const f of failures) console.log('  - ' + f);
    cleanup();
    process.exit(1);
  }
  console.log('SELF-TEST PASSED: 3/3 合成坏绑定被检出，合法绑定零误报（门禁非「永远绿灯」）');
  console.log('（合成破损样本位于临时目录，已删除：' + path.basename(dir) + '）');
  cleanup();
  process.exit(0);
}

// ---------------------------------------------------------------- main

const args = parseArgs(process.argv.slice(2));
if (args.selfTest) selfTest();

for (const r of args.roots) {
  if (!fs.existsSync(r)) { console.error('根目录不存在: ' + r); process.exit(2); }
}

const res = scan(args.roots, REPO);
const relRoots = args.roots.map(r => path.relative(REPO, r) || '.').join(', ');

if (args.json) {
  console.log(JSON.stringify({ roots: args.roots, modules: res.modules, bindings: res.checked, violations: res.violations.map(v => ({ from: res.rel(v.f), to: res.rel(v.target), name: v.n, why: v.why })), unresolved: res.unresolved.map(u => ({ from: res.rel(u.f), spec: u.spec })), external: res.external.map(u => ({ from: res.rel(u.f), spec: u.spec })) }, null, 2));
} else {
  console.log('=== bind-check: ESM 跨模块绑定自检（陷阱 12 的静态补位）===');
  console.log('roots                        :', relRoots);
  console.log('modules scanned              :', res.modules);
  console.log('named import bindings checked:', res.checked);
  // 说明：unresolved / external 均**仅登记不判负** —— 前者多为测试夹具里嵌的合成 import 字符串
  // （fact-extractor.test.js 的 './App.vue' 等），后者是解析到扫描根之外的真实文件（跨根引用）。
  // 本门禁的判负条件只有一条：绑定违规（导入了对方没有的导出）。
  console.log('unresolved relative imports  :', res.unresolved.length, '(仅登记)');
  console.log('external (out-of-root) refs  :', res.external.length, '(仅登记)');
  console.log('BINDING VIOLATIONS           :', res.violations.length);
  for (const v of res.violations.slice(0, MAX_PRINT))
    console.log('  ✗ ' + res.rel(v.f) + '  imports {' + v.n + '} from ' + res.rel(v.target) + '  -> ' + v.why);
  if (res.violations.length > MAX_PRINT) console.log('  ... 其余 ' + (res.violations.length - MAX_PRINT) + ' 条已省略');
  for (const u of res.unresolved.slice(0, MAX_PRINT))
    console.log('  ⚠ unresolved: ' + res.rel(u.f) + " -> '" + u.spec + "'");
  for (const u of res.external.slice(0, MAX_PRINT))
    console.log('  · external: ' + res.rel(u.f) + " -> '" + u.spec + "'");
  if (args.showClean && res.violations.length === 0)
    console.log('  (clean: 每个具名/default 静态 import 都命中真实导出)');
}

process.exit(res.violations.length ? 1 : 0);
