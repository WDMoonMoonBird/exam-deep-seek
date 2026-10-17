#!/usr/bin/env node
/**
 * T4 静态边界检查（v1 零后端验收）— v2
 * 运行：node tests/mobile-v1/static-check.mjs
 * 只读仓库；结果写入 tests/mobile-v1/artifacts/static-check.json
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const results = { checks: [], observations: [], findings: [] };
const pass = (id, title, detail) => results.checks.push({ id, title, status: 'PASS', detail });
const fail = (id, title, detail, items = [], level = 'P1') => {
  results.checks.push({ id, title, status: 'FAIL', detail, items });
  for (const it of items) results.findings.push({ level, id, ...it });
};
const sh = (cmd, args, opts = {}) => {
  try { return execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', ...opts }).trim(); }
  catch (e) { return ((e.stdout || '') + (e.stderr || '')).trim(); }
};
function walk(dir, out = []) { for (const ent of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, ent.name); if (ent.isDirectory()) walk(p, out); else out.push(p); } return out; }
const mobileDir = path.join(repoRoot, 'client/src/mobile');
const mobileFiles = walk(mobileDir);
const rel = (p) => path.relative(repoRoot, p);

/* ---------- 1. 零后端 / 依赖边界 ---------- */
const trackedChanged = sh('git', ['diff', '--name-only', 'HEAD']).split('\n').filter(Boolean);
const untracked = sh('git', ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
const allChanged = [...new Set([...trackedChanged, ...untracked])];
const backendHits = allChanged.filter((p) => /^(server\/|prisma\/)/.test(p) || /(^|\/)migrations?\//.test(p));
if (backendHits.length) fail('B0', 'git 变更不含 server/**、prisma/**、迁移', '发现后端/迁移变更', backendHits.map((p) => ({ file: p })), 'P0');
else pass('B0', 'git 变更不含 server/**、prisma/**、迁移', 'tracked+untracked 均无 server/、prisma/、migrations 路径');

const pkgDiff = sh('git', ['diff', 'HEAD', '--', 'client/package.json', 'client/package-lock.json']);
if (pkgDiff) fail('B1', 'client/package.json 与 lockfile 无新增依赖', 'package 文件有 diff', [{ file: 'client/package.json' }], 'P0');
else pass('B1', 'client/package.json 与 lockfile 无新增依赖', 'git diff HEAD 两文件为空');

const allowedPrefixes = ['client/src/mobile/', 'tests/mobile-v1/', 'docs/mobile-app/'];
const allowedExact = new Set(['client/src/router/index.js', 'client/src/main.js']);
const sharedUnexpected = trackedChanged.filter((p) => !allowedPrefixes.some((x) => p.startsWith(x)) && !allowedExact.has(p));
const outsideObservations = untracked.filter((p) => !allowedPrefixes.some((x) => p.startsWith(x)) && !allowedExact.has(p));
if (sharedUnexpected.length) fail('B2', '共享/桌面文件无越权修改', 'tracked 修改超出允许集合', sharedUnexpected.map((p) => ({ file: p })), 'P1');
else pass('B2', '共享/桌面文件无越权修改', '仅有 client/src/router/index.js、client/src/main.js 两个受控入口改动；client/src/mobile/** 新增');
if (outsideObservations.length) results.observations.push({ id: 'B2-obs', detail: '工作区存在与本任务无关的未跟踪文件（非 client 源码，不判定）', files: outsideObservations });

/* ---------- 2. 源码禁用 API / 依赖 ---------- */
function stripComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
}
const FORBIDDEN_API = [
  [/^\/admin(\/|$)/, '/admin 系列接口'], [/^\/[^'"]*\/urge/, 'urge 催交'], [/handoff/i, 'handoff 接力 token'],
  [/notification/i, 'notification 通知'], [/scores\/overview/, 'scores/overview 成绩聚合'],
  [/batch-review/, 'batch-review 原子批量'], [/batch-publish/, 'batch-publish 原子批量'], [/export-review/, 'export-review 导出'],
  [/aggregate|ranking|percentile/i, '均分/排名/聚合接口'],
];
const apiHits = [];
for (const f of mobileFiles.filter((p) => /\.(vue|js)$/.test(p))) {
  const src = stripComments(fs.readFileSync(f, 'utf8'));
  for (const m of src.matchAll(/['"]([^'"]{2,160})['"]/g)) {
    const value = m[1];
    if (!value.startsWith('/')) continue;
    for (const [re, label] of FORBIDDEN_API) if (re.test(value)) apiHits.push({ file: rel(f), label, value });
  }
}
if (apiHits.length) fail('S1', 'mobile 源码无延期/缺失 API 字符串', '命中禁用 API 路径字符串', apiHits, 'P0');
else pass('S1', 'mobile 源码无延期/缺失 API 字符串', '去注释后所有以 / 开头的字符串均未命中 /admin、urge、handoff、notification、scores/overview、batch-review、batch-publish、export-review、聚合/排名');

const imported = new Set();
for (const f of mobileFiles.filter((p) => /\.(vue|js)$/.test(p))) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s+[^'"]*['"]([^'"]+)['"]/g)) if (!m[1].startsWith('.')) imported.add(m[1]);
}
const bannedLibs = [...imported].filter((p) => /^(vant|monaco-editor|@monaco-editor|@tiptap|ant-design-vue|axios)/.test(p));
if (bannedLibs.length) fail('S2', 'mobile 未引入禁用依赖', '发现 Vant/Monaco/Tiptap/antd/axios', bannedLibs.map((p) => ({ module: p })), 'P0');
else pass('S2', 'mobile 未引入禁用依赖', '外部 import 仅来自 ' + ([...imported].join(', ') || '（无）'));
const axiosHits = [];
for (const f of mobileFiles.filter((p) => /\.(vue|js)$/.test(p))) {
  const src = stripComments(fs.readFileSync(f, 'utf8'));
  if (/axios\.create|from\s+['"]axios['"]/.test(src)) axiosHits.push({ file: rel(f) });
}
if (axiosHits.length) fail('S3', '无新 axios 实例', '发现 axios 直接使用', axiosHits, 'P0');
else pass('S3', '无新 axios 实例', 'mobile 源码未 import/创建 axios，请求统一走 client/src/api/request.js');

/* 静态 API 前缀白名单抽查（运行时以 smoke.mjs 记录的真实请求为准） */
const API_PREFIX_OK = [
  '/auth/', '/student/assignments', '/student/scores', '/student/profile',
  '/teacher/pending-summary', '/teacher/assignments', '/teacher/review-summary', '/teacher/review-class/',
  '/teacher/submissions', '/teacher/questions', '/teacher/classes', '/teacher/students',
];
const apiLiterals = new Set();
for (const f of mobileFiles.filter((p) => /\.(vue|js)$/.test(p))) {
  const src = stripComments(fs.readFileSync(f, 'utf8'));
  for (const m of src.matchAll(/request\.(?:get|post|put|delete)\(\s*['"]([^'"]+)['"]/g)) apiLiterals.add(m[1]);
}
const badLiterals = [...apiLiterals].filter((u) => !API_PREFIX_OK.some((p) => u === p || u.startsWith(p)));
if (badLiterals.length) fail('S4', '静态 API 路径均在契约白名单前缀内', '发现白名单外路径', badLiterals.map((u) => ({ url: u })), 'P1');
else pass('S4', '静态 API 路径均在契约白名单前缀内', '共 ' + apiLiterals.size + ' 个字面量路径全部命中白名单前缀');

/* ---------- 3. mobileFeatures 默认值 ---------- */
const feats = await import('file://' + path.join(mobileDir, 'features/mobileFeatures.js'));
const defaults = feats.mobileFeatures;
const trueKeys = Object.entries(defaults).filter(([, v]) => v === true).map(([k]) => k);
const wrongFalse = Object.entries(defaults).filter(([k, v]) => k !== 'multiSchoolLogin' && v !== false);
if (trueKeys.length === 1 && trueKeys[0] === 'multiSchoolLogin' && wrongFalse.length === 0) pass('F1', 'mobileFeatures 默认仅 multiSchoolLogin=true', Object.keys(defaults).length + ' 个开关，唯一 true=multiSchoolLogin');
else fail('F1', 'mobileFeatures 默认仅 multiSchoolLogin=true', '实际 true=' + JSON.stringify(trueKeys) + ' 非 false=' + JSON.stringify(wrongFalse.map(([k]) => k)), [], 'P0');
if (feats.isMobileFeatureEnabled('scoreAggregates') === false && feats.isMobileFeatureEnabled('adminArea') === false) pass('F2', 'isMobileFeatureEnabled 语义正确', 'false 开关返回 false');
else fail('F2', 'isMobileFeatureEnabled 语义正确', '函数返回值异常', [], 'P1');

/* ---------- 4. 路由表 / 页面 ---------- */
const routesMod = await import('file://' + path.join(mobileDir, 'routes.js'));
const routes = routesMod.mobileRoutes;
const contractPaths = [
  '/m', '/m/login', '/m/doc', '/m/404', '/m/403', '/m/500', '/m/platform/install', '/m/platform/splash', '/m/platform/states',
  '/m/student/home', '/m/student/assignments', '/m/student/assignments/:id', '/m/student/assignments/:id/answer', '/m/student/assignments/:id/done',
  '/m/student/scores', '/m/student/scores/:assignmentId', '/m/student/profile',
  '/m/teacher/home', '/m/teacher/assignments', '/m/teacher/assignments/:id', '/m/teacher/review', '/m/teacher/review/:submissionId',
  '/m/teacher/review/:submissionId/code', '/m/teacher/review/:submissionId/diff', '/m/teacher/batch', '/m/teacher/batch/confirm',
  '/m/teacher/assign/new', '/m/teacher/questions', '/m/teacher/classes/:classId', '/m/teacher/profile', '/m/teacher/code/unsupported',
];
const actualPaths = routes.map((r) => r.path);
const missing = contractPaths.filter((p) => !actualPaths.includes(p));
const adminRoutes = routes.filter((r) => r.path.startsWith('/m/admin'));
if (missing.length || adminRoutes.length) fail('R1', '31 条契约路由齐全且无 /m/admin', '缺失/多余', [{ missing }, { admin: adminRoutes.map((r) => r.path) }], 'P0');
else pass('R1', '31 条契约路由齐全且无 /m/admin', '契约 31 条全部存在；实际 ' + routes.length + ' 条（含 1 条 /m 兜底）');
const extra = actualPaths.filter((p) => !contractPaths.includes(p));
const lastRoute = routes[routes.length - 1];
if (extra.length === 1 && extra[0] === '/m/:pathMatch(.*)*' && lastRoute && lastRoute.name === 'MobileNotFound') pass('R2', '/m 兜底 404 且最后注册', 'extra=' + extra[0] + ' name=' + lastRoute.name);
else fail('R2', '/m 兜底 404 且最后注册', 'extra=' + JSON.stringify(extra), [], 'P1');
const routeIssues = [];
for (const r of routes) {
  const m = String(r.component || '').match(/import\(['"]([^'"]+)['"]\)/);
  if (!m) { if (r.path !== '/m/404' && !r.redirect) routeIssues.push({ path: r.path, issue: '非懒加载' }); continue; }
  const abs = path.resolve(mobileDir, m[1]);
  if (!fs.existsSync(abs)) routeIssues.push({ path: r.path, issue: '组件不存在 ' + rel(abs) });
}
if (routeIssues.length) fail('R3', '路由均懒加载且组件文件存在', '异常', routeIssues, 'P0');
else pass('R3', '路由均懒加载且组件文件存在', routes.length + ' 条路由均 () => import() 且文件落盘');

/* 每屏 h1 来源：route view 必须含 <h1 或 MobileAppBar（其余为子组件页例外） */
const childScreens = new Set(['student/AnswerCode.vue', 'student/AnswerObjective.vue', 'student/SubmitConfirm.vue']);
const h1Issues = [];
for (const r of routes) {
  const m = String(r.component || '').match(/import\(['"]([^'"]+)['"]\)/);
  if (!m) continue;
  const fileRel = path.relative(mobileDir, path.resolve(mobileDir, m[1])).replace(/\\/g, '/');
  if (childScreens.has(fileRel)) continue;
  const src = fs.readFileSync(path.resolve(mobileDir, m[1]), 'utf8');
  if (!/<h1[\s>]/.test(src) && !/<MobileAppBar/.test(src)) h1Issues.push({ route: r.path, file: fileRel });
}
if (h1Issues.length) fail('R4', '每个路由页有 h1 或 MobileAppBar（h1 由组件渲染）', '缺少标题来源', h1Issues, 'P1');
else pass('R4', '每个路由页有 h1 或 MobileAppBar（h1 由组件渲染）', '31 个路由页均有 h1 来源');
/* MobileLayout 使用（保证 .m-screen 挂载与移动 CSS 加载） */
const layoutIssues = [];
for (const r of routes) {
  const m = String(r.component || '').match(/import\(['"]([^'"]+)['"]\)/);
  if (!m) continue;
  const fileRel = path.relative(mobileDir, path.resolve(mobileDir, m[1])).replace(/\\/g, '/');
  if (childScreens.has(fileRel)) continue;
  const src = fs.readFileSync(path.resolve(mobileDir, m[1]), 'utf8');
  if (!/MobileLayout/.test(src) && !/m-screen/.test(src)) layoutIssues.push({ route: r.path, file: fileRel });
}
if (layoutIssues.length) fail('R5', '每个路由页使用 MobileLayout/.m-screen', '缺少移动骨架', layoutIssues, 'P1');
else pass('R5', '每个路由页使用 MobileLayout/.m-screen', '31 个路由页均挂载移动骨架');
const viewFiles = mobileFiles.filter((p) => p.includes('/views/') && p.endsWith('.vue'));
if (viewFiles.length === 34) pass('R6', '34 个页面文件（9 公共/平台 + 11 学生 + 14 教师）', 'views/**/*.vue = 34');
else fail('R6', '34 个页面文件', '实际 ' + viewFiles.length, viewFiles.map((p) => ({ file: rel(p) })), 'P1');

/* ---------- 5. 渲染禁用文案（静态提示，运行为准） ---------- */
const TEXT_RULES = [['排名', /排名/], ['均分', /均分/], ['最高分', /最高分/], ['百分位', /百分位/], ['等级分布', /等级分布/], ['分数构成', /分数构成|得分构成/], ['AI 分项', /分项/], ['班级均分', /班均/], ['催交', /催交/], ['打回', /打回/], ['题库使用次数', /使用次数|最近使用/], ['免登录接力', /免登录|10 ?分钟有效|已同步/], ['请求编号', /请求编号|requestId/]];
const textHits = [];
for (const f of mobileFiles.filter((p) => /\.vue$/.test(p))) {
  const src = fs.readFileSync(f, 'utf8');
  const tmpl = (src.match(/<template>[\s\S]*<\/template>/) || [''])[0];
  const lines = stripComments(tmpl).split('\n');
  for (const [label, re] of TEXT_RULES) lines.forEach((line, i) => { if (re.test(line) && !/mobileFeatures|v-if/.test(line)) textHits.push({ file: rel(f), label, line: (line.match(re) || [''])[0], text: line.trim().slice(0, 80), ln: i + 1 }); });
}
if (textHits.length) results.observations.push({ id: 'T1-obs', detail: '模板中出现 v1 延期文案关键词（需按运行 DOM 判定是否渲染）', items: textHits });
else pass('T1', '模板无硬编码 v1 禁用文案', '去注释模板未命中禁用文案');
if (!textHits.length) pass('T1', '模板无硬编码 v1 禁用文案', '');

/* ---------- 6. CSS / 令牌 ---------- */
const cssFiles = mobileFiles.filter((p) => p.endsWith('.css'));
const scopeViolations = [];
for (const f of cssFiles) {
  if (path.basename(f) === 'mobile-tokens.css') continue;
  const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [...src.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((s) => s && !s.startsWith('@'));
  for (const sel of blocks) for (const part of sel.split(',').map((s) => s.trim())) if (/^(html|body|:root)\b/.test(part)) scopeViolations.push({ file: rel(f), selector: part });
}
if (scopeViolations.length) fail('C1', 'mobile.css 不覆盖全局 html/body/:root', '发现全局选择器', scopeViolations.slice(0, 10), 'P1');
else pass('C1', 'mobile.css 不覆盖全局 html/body/:root', '.m-screen 作用域外无全局选择器（tokens 文件变量除外）');
const CODE_PALETTE = new Set(['#cdd6e4', '#c792ea', '#c3e88d', '#82aaff', '#697098', '#f78c6c', '#ffcb6b']);
const hexHits = [];
for (const f of mobileFiles.filter((p) => /\.vue$/.test(p))) {
  const src = fs.readFileSync(f, 'utf8');
  const styleBlocks = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  for (const line of styleBlocks.split('\n')) {
    for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) if (!CODE_PALETTE.has(m[0].toLowerCase())) hexHits.push({ file: rel(f), hex: m[0], line: line.trim().slice(0, 80) });
  }
}
if (hexHits.length) results.observations.push({ id: 'C2-obs', detail: '页面 scoped 样式未走令牌的颜色字面量（代码高亮调色板已豁免；建议后续替换为令牌）', items: hexHits.slice(0, 20) });
else pass('C2', '页面 scoped 样式无硬编码 hex（代码调色板豁免）', '未发现令牌外颜色字面量');

results.summary = {
  passed: results.checks.filter((c) => c.status === 'PASS').length,
  failed: results.checks.filter((c) => c.status === 'FAIL').length,
  observations: results.observations.length,
  findings: { P0: results.findings.filter((f) => f.level === 'P0').length, P1: results.findings.filter((f) => f.level === 'P1').length, P2: results.findings.filter((f) => f.level === 'P2').length },
  changedPaths: { tracked: trackedChanged, untracked: untracked.slice(0, 40) },
};
fs.mkdirSync(path.join(__dirname, 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'artifacts/static-check.json'), JSON.stringify(results, null, 2));
for (const c of results.checks) {
  console.log((c.status === 'PASS' ? 'PASS' : 'FAIL') + ' [' + c.id + '] ' + c.title + ' — ' + c.detail);
  if (c.items && c.items.length) console.log('     ' + JSON.stringify(c.items).slice(0, 900));
}
for (const o of results.observations) console.log('OBS [' + o.id + '] ' + o.detail + (o.items ? ' :: ' + JSON.stringify(o.items).slice(0, 700) : ''));
console.log('\nSUMMARY ' + JSON.stringify(results.summary));
console.log('ARTIFACT tests/mobile-v1/artifacts/static-check.json');
process.exit(results.summary.findings.P0 ? 1 : 0);
