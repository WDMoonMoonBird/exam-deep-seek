#!/usr/bin/env node
/**
 * 自测（R2-B63）：静态展示豁免 + I/O 反滥用守卫 —— 三态可执行 + 变异必红
 *
 * 用法：node scripts/gates/static-exempt.test.mjs
 * 退出码：0 = 全部断言通过；1 = 有断言失败（含"应当红却没红"）
 *
 * 覆盖（对应施工单 B63 第 4 条）：
 *   ① 正常态（真实仓库 + 真实白名单）⇒ 守卫 0 违规；GodFile 判据集合只剩真数据文件；static_over800 单列且不计判据
 *   ② 反例 A：把**真数据页**（ProjectReviewNew / Assignments / Submit）声明为静态 ⇒ 必红（含**经 composable 间接取数**的 Submit，
 *      它自己 grep request = 0 —— 只看直接 import 的守卫会放行，故本自测同时证明"间接检测是必需的"）
 *   ③ 反例 B：白名单内文件被注入 I/O（axios / @/api / 相对 API 层 / 数据 composable / socketConfig / child_process / fetch 调用）
 *      ⇒ 逐类必红；并证明 dir/** 子树覆盖"未来新增 section"
 *   ④ 变异对照：static_over800 若被并入判据集合 / 守卫退化为"只看直接 import" ⇒ 本自测必红
 *   ⑤ 基线：未用 --save-baseline 掩盖（跑 --save-baseline 后仓库文件逐字节不变）、各基线不升
 *
 * 生产零写入：本自测**只**在 os.tmpdir() 下建临时目录（含 fake root 的 client/src 副本），结束即删；
 * 不在 client/**、server/** 或 scripts/** 写任何文件（注入类反例都在副本上做）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import {
  DEFAULT_WHITELIST_REL, analyzeStaticExemption, collectSourceFiles, createIoAnalyzer, directIoRefs,
  extractImports, importView,
} from './static-exempt.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const GATE = path.join(ROOT, 'scripts/gates/arch-metrics.mjs');
const WHITELIST_FILE = path.join(ROOT, DEFAULT_WHITELIST_REL);

let pass = 0, fail = 0;
function check(ok, name, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? ' —— ' + detail : '')); }
}
const section = (t) => console.log('\n' + t);
const sha = (f) => cp.execSync('shasum -a 256 "' + f + '"').toString().split(' ')[0];
const allRepoFiles = () => [...collectSourceFiles(path.join(ROOT, 'client/src')), ...collectSourceFiles(path.join(ROOT, 'server/src'))];

function runGate(extraArgs = []) {
  const r = cp.spawnSync(process.execPath, [GATE, '--json', ...extraArgs], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* 保留 null，由断言暴露 */ }
  return { rc: r.status, json, stderr: (r.stderr || '').slice(-400) };
}
function tempWhitelist(name, entries) {
  const p = path.join(TMP, name);
  fs.writeFileSync(p, JSON.stringify({ note: '自测临时白名单（不落仓，仅 --static-whitelist 注入）', entries }, null, 2));
  return p;
}
const baseEntries = () => JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf8')).entries;
const row = (json, metric) => (json && json.rows || []).find((r) => r.metric === metric) || {};

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'b63-selftest-'));
try {
  const entries = baseEntries();

  // ───────────────────────── ① 正常态 ─────────────────────────
  section('① 正常态：真实仓库 + 真实白名单');
  const statics = analyzeStaticExemption({ root: ROOT, whitelistFile: WHITELIST_FILE, files: allRepoFiles() });
  check(entries.every((e) => typeof e.reason === 'string' && e.reason.trim()), '白名单每条都有 path + 一行理由', JSON.stringify(entries.map((e) => e.path)));
  check(statics.entries.every((e) => e.matched > 0), '白名单 4 条全部命中文件（无 stale）', JSON.stringify(statics.entries.map((e) => [e.path, e.matched])));
  check(statics.violations.length === 0, '守卫 0 违规（豁免文件确实无 I/O）', JSON.stringify(statics.violations));
  check(statics.exempt.includes('client/src/views/Doc.vue') && statics.exempt.includes('client/src/views/Landing.vue')
    && statics.exempt.includes('client/src/views/DocDemoPreview.vue'), 'Doc.vue / Landing.vue / DocDemoPreview.vue 获豁免');
  const relOf = (f) => path.relative(ROOT, f).split(path.sep).join('/');
  const linesOf = (rel) => (fs.readFileSync(path.join(ROOT, rel), 'utf8').match(/\n/g) || []).length;
  const manualAll = allRepoFiles().map(relOf).filter((f) => f.startsWith('client/src/components/manual/'));
  check(manualAll.length >= 19 && manualAll.every((f) => statics.exempt.includes(f)),
    'manual/** 子树逐文件核查（' + manualAll.length + ' 个文件全数命中，新增 section 自动纳入）',
    '未豁免：' + JSON.stringify(manualAll.filter((f) => !statics.exempt.includes(f))));
  check(!statics.exempt.some((f) => /client\/src\/views\/(teacher|student|admin)\//.test(f)),
    '豁免名单内没有任何 views/teacher|student|admin 数据页', JSON.stringify(statics.exempt));

  const g0 = runGate();
  check(!!g0.json && g0.json.static_guard && g0.json.static_guard.status === 'PASS', '门禁 staticGuardIo = PASS', 'rc=' + g0.rc + ' ' + g0.stderr);
  const staticList = g0.json.static_over800 || [];
  const staticPaths = staticList.map((l) => l.replace(/ \(\d+\)$/, ''));
  const exempted = g0.json.staticExemption.exemptedFiles || [];
  check(exempted.every((f) => staticPaths.includes(f) === (linesOf(f) > 800)),
    'static_over800 = 豁免文件里 >800 行的那些（单列、报告可见、不计判据）', JSON.stringify(staticList));
  check(staticPaths.length >= 1 && exempted.includes('client/src/views/Doc.vue') && exempted.includes('client/src/views/Landing.vue'),
    '被豁免的大文件确实以 static_over800 记录（Doc.vue / Landing.vue）', JSON.stringify({ static_over800: staticList, exempted }));
  const judged = g0.json.godfile_over800 || [];
  const judgedPaths = judged.map((l) => l.replace(/ \(\d+\)$/, ''));
  check(judgedPaths.every((f) => !exempted.includes(f)), '★GodFile 判据集合已剔除全部豁免文件，只剩真数据/后端文件', JSON.stringify(judged));
  const census = allRepoFiles().map(relOf).filter((f) => linesOf(f) > 800).sort();
  check(JSON.stringify(census) === JSON.stringify([...judgedPaths, ...staticPaths].sort()),
    '判据集合 ∪ static_over800 = 全仓 >800 普查（豁免只改归属，总量不减少）', 'census=' + JSON.stringify(census));
  check(row(g0.json, 'godfileOver800').actual === judged.length, 'godfileOver800 判据按"剔除豁免后的集合"计数（变异② 若把 static_over800 并入判据 ⇒ 此断言变红）');
  check((g0.json.godfile_over800 || []).every((l) => !(g0.json.static_over800 || []).some((s) => s === l)), '判据集合与 static_over800 无交集');

  section('⑤ 基线未被刷新掩盖');
  const b = { gd: row(g0.json, 'godfileOver800'), un: row(g0.json, 'unmigrated'), lv: row(g0.json, 'layerViolations'), sg: row(g0.json, 'staticGuardIo') };
  check(b.gd.baseline <= 1 && b.un.baseline <= 42 && b.lv.baseline <= 0 && b.sg.baseline === 0,
    '各基线只降不升（godfileOver800 ≤1 / unmigrated ≤42 / layerViolations ≤0 / staticGuardIo = 0）',
    JSON.stringify(b));
  const before = { gate: sha(GATE), wl: sha(WHITELIST_FILE) };
  const gSave = runGate(['--save-baseline']);
  const after = { gate: sha(GATE), wl: sha(WHITELIST_FILE) };
  check(JSON.stringify(before) === JSON.stringify(after) && (gSave.json ? JSON.stringify(gSave.json.rows) === JSON.stringify(g0.json.rows) : false),
    '门禁不支持 --save-baseline（跑了也不落盘、判据不变，无掩盖入口）', JSON.stringify(after));

  // ───────────────────────── ② 反例 A：真数据页伪装静态 ─────────────────────────
  section('② 反例 A：真数据页声明为静态 ⇒ 必红');
  const dataPages = [
    { file: 'client/src/views/teacher/ProjectReviewNew.vue', why: '直接 import API 层（../../api/projects.js）' },
    { file: 'client/src/views/teacher/Assignments.vue', why: '无 import 命中但本文件内 request.get(...) 调用' },
    { file: 'client/src/views/student/Submit.vue', why: '自身 request 出现 0 次，取数在 composable 里（间接）' },
  ];
  const submitSrc = fs.readFileSync(path.join(ROOT, 'client/src/views/student/Submit.vue'), 'utf8');
  console.log('      （Submit.vue 自身 request 出现次数 = ' + (submitSrc.match(/\brequest\b/g) || []).length + '，取数在 composable 里）');
  const probe = createIoAnalyzer(ROOT);
  const indirectOnly = allRepoFiles().map(relOf)
    .filter((f) => /^client\/src\/views\//.test(f))
    .filter((f) => directIoRefs(path.join(ROOT, f), ROOT).length === 0 && probe.ioChain(path.join(ROOT, f)).tainted);
  check(indirectOnly.length >= 1,
    '★变异对照：存在真数据页"直接判定干净、闭包命中" ⇒ 只看直接 import 的退化守卫会放行它们（本次：' + JSON.stringify(indirectOnly) + '）');

  for (const dp of dataPages) {
    const wl = tempWhitelist(path.basename(dp.file) + '.wl.json', [...entries, { path: dp.file, reason: '变异对照：把真数据页声明为静态（应当被守卫识破）' }]);
    const g = runGate(['--static-whitelist=' + wl]);
    const v = (g.json && g.json.static_guard && g.json.static_guard.violations) || [];
    const hit = v.find((x) => x.file === dp.file);
    check(g.rc === 1 && !!g.json && g.json.static_guard.status === 'FAIL' && !!hit, dp.file + ' ⇒ 门禁 FAIL + 报「声明为静态，却含 I/O」', 'rc=' + g.rc + ' ' + JSON.stringify(v.map((x) => x.reason)));
    if (hit) console.log('      证据链：' + hit.detail);
    const stillJudged = (g.json.godfile_over800 || []).some((l) => l.startsWith(dp.file));
    const expectedJudged = linesOf(dp.file) > 800;   // 随拆分演进自适应：该文件当前是否 >800
    check(!!hit && !(g.json.staticExemption.exemptedFiles || []).includes(dp.file) && stillJudged === expectedJudged,
      dp.file + ' ⇒ 违规文件**不获豁免**（>800 者仍在判据集合）',
      'exempt=' + JSON.stringify(g.json.staticExemption.exemptedFiles) + ' judged=' + JSON.stringify(g.json.godfile_over800));
  }
  {
    const g = runGate(['--static-whitelist=' + tempWhitelist('submit.wl.json', [...entries, { path: 'client/src/views/student/Submit.vue', reason: '间接取数反例' }])]);
    const detail = ((g.json.static_guard.violations[0] || {}).detail) || '';
    check(/useSubmitPage\.js/.test(detail) && /api\/request\.js/.test(detail), '间接取数证据链可复核（Submit.vue ⇒ useSubmitPage.js ⇒ … ⇒ api/request.js）', detail);
  }

  // ───────────────────────── ③ 反例 B：白名单内注入 I/O ─────────────────────────
  section('③ 反例 B：白名单内注入 I/O ⇒ 逐类必红（在 tmp 的 client/src 副本上做，不动仓库）');
  const fakeRoot = path.join(TMP, 'fake-root');
  fs.mkdirSync(fakeRoot, { recursive: true });
  fs.cpSync(path.join(ROOT, 'client/src'), path.join(fakeRoot, 'client/src'), { recursive: true });
  const docRel = 'client/src/views/Doc.vue';
  const docPath = path.join(fakeRoot, docRel);
  const docSrc = fs.readFileSync(docPath, 'utf8');
  const fakeWl = tempWhitelist('fake-doc.wl.json', [{ path: docRel, reason: '自测：静态页（副本）' }]);
  const analyzeFake = () => analyzeStaticExemption({ root: fakeRoot, whitelistFile: fakeWl, files: collectSourceFiles(path.join(fakeRoot, 'client/src')) });

  const control = analyzeFake();
  check(control.violations.length === 0 && control.exempt.includes(docRel), '对照：副本上的 Doc.vue 未注入时干净（守卫不误报）', JSON.stringify(control.violations));

  const injections = [
    { line: 'import axios from ' + "'" + 'axios' + "'" + ';', expect: /axios/ },
    { line: 'import request from ' + "'" + '@/api/request.js' + "'" + ';', expect: /API 层|@\/api/ },
    { line: 'import request from ' + "'" + '../api/request.js' + "'" + ';', expect: /API 层/ },
    { line: 'import { useChecker } from ' + "'" + '../composables/project/useChecker.js' + "'" + ';', expect: /API 层|request 调用|axios/, via: 'useChecker.js' },
    { line: 'import { createTeacherSocket } from ' + "'" + '../../composables/socketConfig.js' + "'" + ';', expect: /实时通道/ },
    { line: 'import cp from ' + "'" + 'node:child_process' + "'" + ';', expect: /child_process/ },
    { line: 'const r = await fetch(' + "'" + '/api/x' + "'" + ');', expect: /fetch/ },
  ];
  for (const inj of injections) {
    fs.writeFileSync(docPath, docSrc.replace(/<script([^>]*)>/, (m) => m + '\n' + inj.line));
    const res = analyzeFake();
    const v = res.violations[0];
    check(res.violations.length === 1 && !!v && inj.expect.test(v.reason), '注入「' + inj.line.slice(0, 52) + '」⇒ FAIL', JSON.stringify(res.violations.map((x) => x.reason)));
    check(!!v && !res.exempt.includes(docRel), '注入后该文件不获豁免（仍计入判据集合）');
    if (v && inj.via) check(new RegExp(inj.via.replace('.', '\\.')).test(v.detail), '间接链经 ' + inj.via + ' 可复核', v.detail);
  }
  fs.writeFileSync(docPath, docSrc);

  // dir/** 子树：未来新增 section 自动纳入 + 仍受守卫约束
  const futureOk = path.join(fakeRoot, 'client/src/components/manual/sections/FutureSection.vue');
  const futureBad = path.join(fakeRoot, 'client/src/components/manual/sections/FutureSection2.vue');
  const futureWl = tempWhitelist('fake-manual.wl.json', [{ path: 'client/src/components/manual/**', reason: '自测：手册子树（含未来新增 section）' }]);
  fs.writeFileSync(futureOk, '<template><div>static</div></template>\n<script setup>\nimport { computed } from ' + "'vue'" + ';\nconst x = computed(() => 1);\n</' + 'script>\n');
  fs.writeFileSync(futureBad, '<template><div>data</div></template>\n<script setup>\nimport request from ' + "'" + '@/api/request.js' + "'" + ';\n</' + 'script>\n');
  const mres = analyzeStaticExemption({ root: fakeRoot, whitelistFile: futureWl, files: collectSourceFiles(path.join(fakeRoot, 'client/src')) });
  check(mres.entries[0].matchedFiles.includes('client/src/components/manual/sections/FutureSection.vue'), 'manual/** 子树自动纳入"未来新增 section"', String(mres.entries[0].matched));
  check(mres.exempt.includes('client/src/components/manual/sections/FutureSection.vue'), '新增的静态 section ⇒ 豁免');
  check(mres.violations.length === 1 && mres.violations[0].file.endsWith('FutureSection2.vue'), '新增的含 I/O section ⇒ FAIL（子树同样受守卫约束）', JSON.stringify(mres.violations.map((x) => x.file)));
  // ───────────────────────── ⑥ 白名单配置契约（"口头豁免"过不了门禁） ─────────────────────────
  section('⑥ 白名单配置契约：路径 + 一行理由缺一不可，stale 条目不产生豁免');
  const noReason = path.join(TMP, 'no-reason.wl.json');
  fs.writeFileSync(noReason, JSON.stringify({ entries: [{ path: 'client/src/views/Doc.vue' }] }, null, 2));
  const gNoReason = runGate(['--static-whitelist=' + noReason]);
  check(gNoReason.rc === 2 && /缺少一行理由/.test(gNoReason.stderr), '条目缺 reason（只有路径、没有理由）⇒ 退出码 2', 'rc=' + gNoReason.rc + ' ' + gNoReason.stderr);
  const emptyWl = path.join(TMP, 'empty.wl.json');
  fs.writeFileSync(emptyWl, JSON.stringify({ entries: [] }, null, 2));
  const gEmpty = runGate(['--static-whitelist=' + emptyWl]);
  check(gEmpty.rc === 2, '白名单 entries 为空 ⇒ 退出码 2（不允许"空名单=全豁免"或静默失效）', 'rc=' + gEmpty.rc);
  const staleWl = tempWhitelist('stale.wl.json', [{ path: 'client/src/views/DoesNotExist.vue', reason: 'stale 对照：路径写错' }]);
  const gStale = runGate(['--static-whitelist=' + staleWl]);
  const se = (gStale.json && gStale.json.staticExemption) || {};
  check(JSON.stringify(se.staleEntries) === JSON.stringify(['client/src/views/DoesNotExist.vue']) && (se.exemptedFiles || []).length === 0,
    '未命中任何文件的条目只记 stale、**不产生豁免**（路径写错不会静默放行）',
    'stale=' + JSON.stringify(se.staleEntries) + ' exempt=' + JSON.stringify(se.exemptedFiles));
  // ───────────────────────── ⑦ B70-F1：import 抽取完整性（隔条跳过回归） ─────────────────────────
  section('⑦ B70-F1：连续单行 import 抽取完整 + I/O 任意位置必红（PageA/PageB/PageC 回归）');
  const fixtureDir = path.join(fakeRoot, 'client/src/views/teacher');
  fs.mkdirSync(fixtureDir, { recursive: true });
  const sfc = (imports) => '<template><div/></template>' + '\n<script setup>\n' + imports.join('\n') + '\n</' + 'script>\n';
  const writeFixture = (rel, imports) => { fs.writeFileSync(path.join(fakeRoot, rel), sfc(imports)); return rel; };

  // ① 抽取完整性：4 条连续单行 import ⇒ 恰好 4 条（含 I/O 在第 2 条；旧实现只抽到 vue / ./helper.js）
  const four = [
    "import { ref } from 'vue';",
    "import request from '../../api/request.js';",
    "import { computed } from 'vue';",
    "import { helper } from './helper.js';",
  ];
  const fourRel = writeFixture('client/src/views/teacher/FourImports.vue', four);
  const fourAbs = path.join(fakeRoot, fourRel);
  const gotSpecs = extractImports(importView(fs.readFileSync(fourAbs, 'utf8'), fourAbs));
  check(gotSpecs.length === 4 && JSON.stringify(gotSpecs.map((x) => x.spec)) === JSON.stringify(['vue', '../../api/request.js', 'vue', './helper.js'])
    && gotSpecs[1].line === 4, '4 条连续单行 import ⇒ 抽到 4 条（说明符 + 行号正确；I/O 在第 2 条、行号=4）', JSON.stringify(gotSpecs));
  // 多行 import（本行无 from）+ 后续单行 import 不能被吞
  const mixed = ['<script setup>', 'import {', '  ref,', '} from ' + "'vue'" + ';', "import request from '../../api/request.js';", '</' + 'script>'].join('\n');
  const mixedOut = extractImports(importView(mixed, '/tmp/Mixed.vue'));
  check(mixedOut.length === 2 && mixedOut[0].spec === 'vue' && mixedOut[1].spec === '../../api/request.js', '多行 import 之后的单行 import 仍被抽取', JSON.stringify(mixedOut));

  // ② 镜像夹具：I/O 在第 2/4 条、PageB（经 composable 间接）、PageC（自身第 2 条 import、无调用形式）
  fs.mkdirSync(path.join(fakeRoot, 'client/src/composables/pageApi'), { recursive: true });
  fs.writeFileSync(path.join(fakeRoot, 'client/src/composables/pageApi/usePageApi.js'),
    "import request from '../../api/request.js';" + '\n' + 'export function usePageApi() { return request; }' + '\n');
  const pageFixtures = {
    'PageA.vue': ["import request from '../../api/request.js';"],
    'PageB.vue': ["import { ref } from 'vue';", "import { usePageApi } from '../../composables/pageApi/usePageApi.js';"],
    'PageC.vue': ["import { ref } from 'vue';", "import request from '../../api/request.js';"],
    'IoFourth.vue': ["import { ref } from 'vue';", "import { computed } from 'vue';", "import { watch } from 'vue';", "import request from '../../api/request.js';"],
  };
  Object.entries(pageFixtures).forEach(([n, imports]) => writeFixture('client/src/views/teacher/' + n, imports));
  const pageWl = tempWhitelist('b70-fixtures.wl.json', Object.keys(pageFixtures).map((n) => ({ path: 'client/src/views/teacher/' + n, reason: 'B70-F1 夹具：均应判红' })));
  const pageRes = analyzeStaticExemption({ root: fakeRoot, whitelistFile: pageWl, files: collectSourceFiles(path.join(fakeRoot, 'client/src')) });
  for (const n of Object.keys(pageFixtures)) {
    const rel = 'client/src/views/teacher/' + n;
    const hit = pageRes.violations.find((x) => x.file === rel);
    check(!!hit && !pageRes.exempt.includes(rel), n + '（I/O import 位置/' + '(间接)' + '）⇒ FAIL 且不获豁免',
      'violations=' + JSON.stringify(pageRes.violations.map((x) => x.file)) + ' exempt=' + JSON.stringify(pageRes.exempt.filter((f) => f.includes('views/teacher/'))));
  }

  // ───────────────────────── ⑧ B70-F2：符号链接执行仍正常运行 ─────────────────────────
  section('⑧ B70-F2：经符号链接路径执行门禁必须真正运行（不得 fail-open 静默 exit 0）');
  const linkRoot = path.join(TMP, 'gate-link');
  fs.symlinkSync(ROOT, linkRoot, 'dir');
  const linkRun = cp.spawnSync(process.execPath, [path.join(linkRoot, 'scripts/gates/arch-metrics.mjs'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  let linkJson = null;
  try { linkJson = JSON.parse(linkRun.stdout); } catch { /* 由断言暴露 */ }
  check(!!linkJson && linkJson.gate === 'arch-metrics' && Array.isArray(linkJson.rows) && linkJson.rows.length >= 3,
    '经符号链接执行：stdout 为完整 JSON（gate/rows 齐备，非 0 字节）', 'bytes=' + String(linkRun.stdout || '').length);
  check((linkRun.status === 0 || linkRun.status === 1) && !!linkJson && linkRun.status === (linkJson.verdict === 'PASS' ? 0 : 1),
    '经符号链接执行：退出码与 verdict 一致（0=PASS / 1=FAIL，语义不变）', 'rc=' + linkRun.status + ' verdict=' + (linkJson && linkJson.verdict));
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
  const residue = fs.existsSync(TMP);
  console.log('\n残留检查：临时目录 ' + (residue ? '仍存在（异常）' : '已删除') + '；仓库内未写入任何文件（注入类反例均在 tmp 副本上）');
}

console.log('\n自测结论：' + (fail === 0 ? 'PASS' : 'FAIL') + '（通过 ' + pass + ' / 失败 ' + fail + '）');
process.exit(fail === 0 ? 0 : 1);
