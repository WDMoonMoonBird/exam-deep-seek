#!/usr/bin/env node
/**
 * T4 路由/页面冒烟 + 守卫 + API 边界 + 三态 + 共享组件（Playwright + mock API）
 * 前置：cd client && npm run dev -- --port 5174 --host 127.0.0.1
 * 运行：node tests/mobile-v1/smoke.mjs
 * 只读取页面、mock API、不改仓库源码；截图写入 tests/mobile-v1/artifacts/。
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const require = createRequire(path.join(repoRoot, 'client/package.json'));
const { chromium } = require('playwright');
const BASE = process.env.MOBILE_BASE || 'http://127.0.0.1:5174/exam';
const ART = path.join(__dirname, 'artifacts');
fs.mkdirSync(ART, { recursive: true });

const out = { base: BASE, pages: [], guards: [], states: [], components: {}, apiAudit: {}, console: [], findings: [] };
function addFinding(level, title, detail) { out.findings.push({ level, title, detail }); }

/* ---------------------------------------------------------------- mock 数据 */
const studentUser = { id: 1001, username: '2026001004', realName: '李明', role: 'student', currentSchool: { id: 1, name: 'Deadpan 大学' }, classes: [{ id: 1, className: '计算机 2301 班' }] };
const teacherUser = { id: 2001, username: 'T2026001', realName: '周子轩', role: 'teacher', currentSchool: { id: 1, name: 'Deadpan 大学' }, teacherSchools: [{ id: 1, name: 'Deadpan 大学' }] };
const adminUser = { id: 1, username: 'admin', realName: '王建国', role: 'super_admin' };
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const assignment = {
  id: 1, title: '数据结构实验三：图的最短路径', status: 'active', startTime: iso(now - 86400000), endTime: iso(now + 7 * 3600000),
  maxScore: 100, locked: false, allowResubmit: false, maxAttempts: 1, scorePolicy: 'best', answeredCount: 4,
  _count: { assignmentQuestions: 6 }, teacherName: '周子轩', description: '完成最短路径算法，包含客观题与编程题。',
  assignmentQuestions: [
    { id: 11, title: '第 1 题（单选）', type: 'choice', questionType: 'objective', maxScore: 6, order: 1 },
    { id: 12, title: '第 2 题（多选）', type: 'multi_choice', questionType: 'objective', maxScore: 8, order: 2 },
    { id: 13, title: '第 3 题（编程）', type: 'code', questionType: 'code', maxScore: 30, order: 3 },
  ],
  submissions: [],
};
const detailPayload = {
  assignment: {
    ...assignment,
    assignmentQuestions: [
      { id: 11, question: { id: 11, type: 'objective', title: '第 1 题（单选）', material: '', maxScore: 6, subQuestions: [{ id: 111, type: 'objective', title: '第 1 题（单选）', content: 'HTTP 状态码 404 表示什么？', score: 6, objectiveItems: [{ key: 'A', label: '服务器内部错误' }, { key: 'B', label: '资源不存在' }, { key: 'C', label: '未授权' }, { key: 'D', label: '重定向' }] }] } },
      { id: 13, question: { id: 13, type: 'code', title: '第 3 题（编程）', material: '', maxScore: 30, subQuestions: [] } },
    ],
  },
  submissions: [],
};
const score = { assignmentId: 1, assignmentTitle: 'Java 程序设计期末考试', totalScore: 92, maxScore: 100, publishedAt: iso(now - 86400000 * 3) };
const submission = {
  id: 101, studentId: 1, studentName: '陈嘉懿', studentNo: '2025010101', assignmentId: 1, assignmentTitle: assignment.title,
  aiScore: 92, finalScore: null, status: 'submitted', submittedAt: iso(now - 3600000), questionType: 'code',
  aiComment: '思路清晰，边界条件处理到位。',
  answers: [{ questionId: 11, questionTitle: '第 1 题', questionType: 'objective', answer: 'A', aiScore: 6 }, { questionId: 13, questionTitle: '第 3 题（编程）', questionType: 'code', answer: 'print(1)', aiScore: 86 }],
};
const teacherAssignment = { id: 1, title: assignment.title, status: 'active', endTime: iso(now + 3 * 86400000), maxScore: 100, submissionCount: 38, expectedCount: 45, locked: false, className: '计算机 2301 班', assignmentClasses: [{ classId: 1, className: '计算机 2301 班' }] };
const question = { id: 1, title: '两数之和', type: 'code', questionType: 'code', maxScore: 10, updatedAt: iso(now - 86400000) };

function mockData(method, pathname) {
  const p = pathname.replace(/^\/api/, '');
  if (method === 'GET') {
    if (p === '/student/assignments') return { list: [assignment], total: 1, page: 1, pageSize: 100 };
    if (/^\/student\/assignments\/\d+$/.test(p)) return detailPayload;
    if (p === '/student/scores') return [score];
    if (p === '/student/profile') return { id: 1001, username: '2026001004', realName: '李明', role: 'student', classes: [{ id: 1, className: '计算机 2301 班' }], school: { id: 1, name: 'Deadpan 大学' } };
    if (p === '/teacher/pending-summary') return { pendingReview: 12, aiPending: 2, abnormal: 0 };
    if (p === '/teacher/assignments') return { list: [teacherAssignment], total: 1, page: 1, pageSize: 10 };
    if (/^\/teacher\/assignments\/\d+$/.test(p)) return teacherAssignment;
    if (p === '/teacher/review-summary') return { list: [{ assignmentId: 1, className: '计算机 2301 班', submitted: 38, expected: 45, pendingReview: 12, aiPending: 2 }], total: 1 };
    if (p === '/teacher/submissions') return { list: [submission], total: 1, page: 1, pageSize: 10 };
    if (/^\/teacher\/submissions\/\d+$/.test(p)) return submission;
    if (/^\/teacher\/submissions\/\d+\/project$/.test(p)) return { scores: [{ name: '功能完整', score: 45, max: 50 }], files: [] };
    if (p === '/teacher/questions') return { list: [question], total: 1, page: 1, pageSize: 10 };
    if (/^\/teacher\/questions\/\d+$/.test(p)) return question;
    if (p === '/teacher/classes') return { list: [{ id: 1, className: '计算机 2301 班', studentCount: 45 }], total: 1 };
    if (p === '/teacher/students') return { list: [{ id: 1, realName: '陈嘉懿', username: '2025010101' }, { id: 2, realName: '周予安', username: '2025010104' }], total: 2 };
    if (/^\/teacher\/review-class\/\d+$/.test(p)) return { list: [{ submissionId: 101, studentId: 1, studentName: '陈嘉懿', studentNo: '2025010101', aiScore: 92, finalScore: null, status: 'submitted' }], total: 1 };
    if (p === '/health') return { status: 'ok' };
    return { list: [], total: 0, page: 1, pageSize: 10 };
  }
  if (p === '/teacher/assignments') return { id: 2, title: '新建作业' };
  if (p === '/teacher/submissions/publish') return { published: true };
  return {};
}

const deferredPatterns = [
  [/\/admin(\/|$)/, '/admin/**'],
  [/\/urge(\/|$)/i, 'urge'],
  [/handoff/i, 'handoff'],
  [/notification/i, 'notification'],
  [/scores\/overview/, 'scores/overview'],
  [/batch-review/, 'batch-review'],
  [/batch-publish/, 'batch-publish'],
  [/export-review/, 'export-review'],
  [/aggregate|ranking|percentile/i, '聚合/排名'],
];
const whitelist = [
  /^\/api\/auth\/(login|password)$/,
  /^\/api\/student\/assignments$/,
  /^\/api\/student\/assignments\/\d+$/,
  /^\/api\/student\/assignments\/\d+\/(draft|submit)$/,
  /^\/api\/student\/scores$/,
  /^\/api\/student\/profile$/,
  /^\/api\/teacher\/pending-summary$/,
  /^\/api\/teacher\/assignments$/,
  /^\/api\/teacher\/assignments\/\d+$/,
  /^\/api\/teacher\/assignments\/\d+\/lock$/,
  /^\/api\/teacher\/review-summary$/,
  /^\/api\/teacher\/review-class\/\d+$/,
  /^\/api\/teacher\/submissions$/,
  /^\/api\/teacher\/submissions\/\d+$/,
  /^\/api\/teacher\/submissions\/\d+\/(score|review)$/,
  /^\/api\/teacher\/submissions\/publish$/,
  /^\/api\/teacher\/submissions\/\d+\/project(\/review)?$/,
  /^\/api\/teacher\/questions$/,
  /^\/api\/teacher\/questions\/\d+$/,
  /^\/api\/teacher\/classes$/,
  /^\/api\/teacher\/students$/,
  /^\/api\/health$/,
];

function authFor(role) {
  if (role === 'student') return { token: 'mock-token', user: studentUser };
  if (role === 'teacher') return { token: 'mock-token', user: teacherUser };
  if (role === 'super_admin') return { token: 'mock-token', user: adminUser };
  return null;
}

const FORBIDDEN_TEXT = [
  ['排名', /班级?排名|排名第|排名/], ['均分', /班[级均]+分|均分/], ['最高分', /最高分/], ['百分位', /百分位|超过.{0,4}%?(同学|学生)/],
  ['等级分布', /等级分布/], ['分数构成', /分数构成|得分构成/], ['AI 分项', /AI ?分项|分项得分/], ['催交', /催交/], ['打回', /打回|退回重做/],
  ['题库使用次数', /使用次数|最近使用/], ['免登录接力', /免登录|10 ?分钟有效|已同步到电脑/], ['在线人数', /在线人数|在线用户/],
  ['请求编号', /请求编号|requestId|ERR-\d/],
];

let browser;
async function newContext({ role = null, viewport = { width: 390, height: 844 } } = {}) {
  const ctx = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  if (role) {
    const auth = authFor(role);
    await ctx.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, auth);
  }
  const requests = [];
  await ctx.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    requests.push({ method: req.method(), path: url.pathname + url.search });
    const data = mockData(req.method(), url.pathname);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data }) });
  });
  ctx._requests = requests;
  return ctx;
}
async function openPage(ctx, urlPath, { wait = 700 } = {}) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(BASE + urlPath, { waitUntil: 'domcontentloaded', timeout: 20000 });
  try { await page.waitForSelector('.m-screen', { timeout: 9000 }); } catch { /* 记录到页面结果 */ }
  await page.waitForTimeout(wait);
  return { page, errors };
}
async function inspectPage(page) {
  return page.evaluate(() => {
    const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
    const h1s = [...document.querySelectorAll('h1')].filter(visible);
    const vw = window.innerWidth;
    const offenders = [];
    for (const el of document.querySelectorAll('.m-screen *')) {
      if (el.closest('.codebody,.diffbody,.hscroll,.chips,.tabs,.sheet-body,.mask')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1.5 || r.left < -1.5) { offenders.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 50), left: Math.round(r.left), right: Math.round(r.right) }); if (offenders.length >= 5) break; }
    }
    const text = (document.body.innerText || '').replace(/\s+/g, ' ');
    return {
      mounted: !!document.querySelector('.m-screen'),
      h1Count: h1s.length,
      h1: h1s.map((h) => (h.textContent || '').trim()).slice(0, 3),
      textLen: text.length,
      textSample: text.slice(0, 260),
      overflow: document.documentElement.scrollWidth > vw + 1,
      docScrollW: document.documentElement.scrollWidth,
      vw,
      offenders,
      tabbar: document.querySelectorAll('.m-tabbar,.tabbar').length,
      tabbarItems: document.querySelectorAll('.m-tabbar .tabbar-item, .tabbar .tabbar-item').length,
      skeletons: document.querySelectorAll('.sk,.m-skeleton,[class*="skeleton"]').length,
      isMobileChunk: !!document.querySelector('.m-screen'),
      path: location.pathname,
      title: document.title,
    };
  });
}
function auditRequests(ctx, scope) {
  for (const r of ctx._requests) {
    const pathname = r.path.split('?')[0];
    const deferred = deferredPatterns.find(([re]) => re.test(pathname));
    if (deferred) addFinding('P0', '请求了延期/缺失接口', { page: scope, method: r.method, path: r.path, rule: deferred[1] });
    const apiPath = pathname.startsWith('/api') ? pathname : '/api' + pathname;
    if (!whitelist.some((re) => re.test(apiPath))) addFinding('P1', '请求不在契约白名单内的接口', { page: scope, method: r.method, path: r.path });
  }
}
function scanForbiddenText(text, pageName) {
  for (const [label, re] of FORBIDDEN_TEXT) {
    const m = text.match(re);
    if (!m) continue;
    const context = text.slice(Math.max(0, m.index - 40), m.index + 40);
    // 使用文档页对「催交」的描述属于待更新文案（P2），不是渲染延期数据
    if (pageName === '/m/doc' && label === '催交') continue;
    // 允许的"显式不展示"文案 / 计分口径（取最高分），其余视为渲染违规
    if (label === '请求编号' && /不(展示|显示)/.test(context)) continue;
    if (label === '最高分' && /取最高分/.test(context)) continue;
    addFinding('P1', '页面渲染了 v1 禁用的延期数据文案', { page: pageName, label, match: m[0], context });
  }
}

/* ---------------------------------------------------------------- 路由清单 */
const PUBLIC = ['/m', '/m/login', '/m/doc', '/m/404', '/m/403', '/m/500', '/m/platform/install', '/m/platform/splash', '/m/platform/states'];
const STUDENT = ['/m/student/home', '/m/student/assignments', '/m/student/assignments/1', '/m/student/assignments/1/answer', '/m/student/assignments/1/done', '/m/student/scores', '/m/student/scores/1', '/m/student/profile'];
const TEACHER = ['/m/teacher/home', '/m/teacher/assignments', '/m/teacher/assignments/1', '/m/teacher/review', '/m/teacher/review/101', '/m/teacher/review/101/code', '/m/teacher/review/101/diff', '/m/teacher/batch', '/m/teacher/batch/confirm', '/m/teacher/assign/new', '/m/teacher/questions', '/m/teacher/classes/1', '/m/teacher/profile', '/m/teacher/code/unsupported'];

async function runPage(ctx, urlPath, expectRole, label) {
  const { page, errors } = await openPage(ctx, urlPath);
  const info = await inspectPage(page);
  const rec = { url: urlPath, label, role: expectRole, ...info };
  if (errors.length) { rec.errors = errors; out.console.push({ url: urlPath, errors }); addFinding('P1', '页面控制台错误', { page: urlPath, errors: errors.slice(0, 3) }); }
  if (!info.mounted) addFinding('P0', '页面未挂载 .m-screen', { page: urlPath });
  if (info.h1Count !== 1) addFinding('P1', 'h1 不是唯一可见标题', { page: urlPath, h1Count: info.h1Count, h1: info.h1 });
  if (info.overflow) addFinding('P1', '390×844 出现横向溢出', { page: urlPath, vw: info.vw, docScrollW: info.docScrollW, offenders: info.offenders });
  if (info.textLen < 40) addFinding('P1', '页面接近空白', { page: urlPath, textLen: info.textLen });
  if (expectRole === 'student' || expectRole === 'teacher') {
    if (info.tabbarItems !== 4 && !['/m/student/assignments/1', '/m/student/assignments/1/answer', '/m/student/assignments/1/done', '/m/student/scores/1', '/m/student/profile', '/m/teacher/assignments/1', '/m/teacher/review', '/m/teacher/review/101', '/m/teacher/review/101/code', '/m/teacher/review/101/diff', '/m/teacher/batch', '/m/teacher/batch/confirm', '/m/teacher/assign/new', '/m/teacher/questions', '/m/teacher/classes/1', '/m/teacher/code/unsupported'].includes(urlPath)) {
      // 说明：契约只看 role 是否渲染 TabBar；二级页可无 TabBar，这里仅记录
      rec.tabbarNote = 'tabbarItems=' + info.tabbarItems;
    }
  }
  scanForbiddenText(info.textSample + ' ' + ((await page.evaluate(() => document.body.innerText)) || ''), urlPath);
  out.pages.push(rec);
  fs.appendFileSync('/tmp/smoke-progress.log', urlPath + ' mounted=' + info.mounted + ' h1=' + info.h1Count + ' overflow=' + info.overflow + ' text=' + info.textLen + '\n');
  return { page, info };
}

async function main() {
  browser = await chromium.launch();
  /* 1. 公共页（未登录） */
  const ctxPub = await newContext({});
  for (const p of PUBLIC) await runPage(ctxPub, p, 'public');
  /* 2. 学生页 */
  const ctxStu = await newContext({ role: 'student' });
  for (const p of STUDENT) await runPage(ctxStu, p, 'student');
  /* 学生：通用题详情页不得请求 project 接口（本页无该调用，跨页审计在教师侧） */
  /* 3. 教师页 */
  const ctxTea = await newContext({ role: 'teacher' });
  for (const p of TEACHER) await runPage(ctxTea, p, 'teacher');
  /* 4. API 审计（按上下文） */
  auditRequests(ctxPub, 'public');
  auditRequests(ctxStu, 'student');
  auditRequests(ctxTea, 'teacher');
  out.apiAudit = { total: ctxPub._requests.length + ctxStu._requests.length + ctxTea._requests.length, public: ctxPub._requests.length, student: ctxStu._requests.length, teacher: ctxTea._requests.length, sample: [...ctxStu._requests, ...ctxTea._requests].slice(0, 40) };

  /* 5. 守卫 */
  const guardCases = [
    { name: '未登录受保护页→/m/login?redirect', auth: null, url: '/m/student/home', expect: /\/m\/login\?redirect=/ },
    { name: '未登录教师页→/m/login?redirect', auth: null, url: '/m/teacher/home', expect: /\/m\/login\?redirect=/ },
    { name: '学生访问教师页→/m/403', auth: 'student', url: '/m/teacher/home', expect: /\/m\/403$/ },
    { name: '教师访问学生页→/m/403', auth: 'teacher', url: '/m/student/home', expect: /\/m\/403$/ },
    { name: '超管访问 /m→/m/403?reason=admin', auth: 'super_admin', url: '/m/student/home', expect: /\/m\/403\?reason=admin/ },
    { name: '/m/admin→移动 404', auth: null, url: '/m/admin', expect: /\/m\/admin$/ },
    { name: '/m/admin/monitor→移动 404（未登录）', auth: null, url: '/m/admin/monitor', expect: /\/m\/admin\/monitor$/ },
    { name: '超管访问 /m/admin→/m/403?reason=admin', auth: 'super_admin', url: '/m/admin', expect: /\/m\/403\?reason=admin/ },
    { name: '未知 /m 路径→移动 404（公开）', auth: null, url: '/m/unknown-page', expect: /\/m\/unknown-page$/ },
  ];
  for (const gc of guardCases) {
    const ctx = await newContext({ role: gc.auth });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.goto(BASE + gc.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    const url = page.url();
    const ok = gc.expect.test(url);
    let detail = url;
    if (!ok) addFinding('P1', '守卫行为不符契约', { case: gc.name, expected: String(gc.expect), actual: url });
    if (gc.name.includes('404')) {
      const t = await page.evaluate(() => (document.body.innerText || '') + '|' + document.title);
      if (!/404|不存在|找不到/.test(t)) addFinding('P1', '管理端路径未落到移动 404', { case: gc.name, text: t.slice(0, 120) });
      const mobile = await page.evaluate(() => !!document.querySelector('.m-screen'));
      if (!mobile) addFinding('P1', '管理端路径未渲染移动页面', { case: gc.name });
    }
    out.guards.push({ name: gc.name, auth: gc.auth, url: gc.url, finalUrl: url, pass: ok, errors });
    await ctx.close();
  }

  /* 6. 401 过期：受保护页 API 返回 401 → /m/login?expired=1 */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(({ token, user }) => { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); }, authFor('student'));
    await ctx.route('**/api/student/assignments**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 1002, message: '未登录' }) }));
    const page = await ctx.newPage();
    await page.goto(BASE + '/m/student/assignments', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const url = page.url();
    const ok = /\/m\/login\?expired=1/.test(url);
    if (!ok) addFinding('P1', '401 未跳转 /m/login?expired=1', { actual: url });
    out.guards.push({ name: '401 过期→/m/login?expired=1', finalUrl: url, pass: ok });
    await ctx.close();
  }

  /* 7. 桌面不回归：/ 与 /login 可用且不渲染 .m-screen */
  {
    const ctx = await newContext({ role: null });
    for (const p of ['/', '/login']) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
      await page.goto(BASE + p, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      const r = await page.evaluate(() => ({ url: location.pathname, hasM: !!document.querySelector('.m-screen'), textLen: (document.body.innerText || '').length, title: document.title }));
      const ok = !r.hasM && r.textLen > 30;
      if (!ok || errors.length) addFinding('P1', '桌面入口回归/报错', { path: p, ...r, errors: errors.slice(0, 3) });
      out.guards.push({ name: '桌面入口不回归 ' + p, finalUrl: r.url, pass: ok, hasM: r.hasM, textLen: r.textLen, errors });
      await page.close();
    }
    await ctx.close();
  }

  /* 8. 三态（延迟/失败/空）：学生作业列表 + 教师审核队列 */
  async function stateCase(name, role, url, apiPattern, mode) {
    const ctx = await newContext({ role });
    // 覆盖该 API 的行为
    await ctx.route(apiPattern, async (route) => {
      if (mode === 'delay') { await new Promise((res) => setTimeout(res, 1200)); const u = new URL(route.request().url()); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data: mockData(route.request().method(), u.pathname) }) }); }
      if (mode === 'error') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 500, message: '服务暂时不可用' }) });
      if (mode === 'empty') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data: { list: [], total: 0 } }) });
    });
    const page = await ctx.newPage();
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.m-screen', { timeout: 9000 });
    if (mode === 'delay') {
      await page.waitForTimeout(250);
      const loading = await page.evaluate(() => document.querySelectorAll('.sk,.m-skeleton,[class*="skeleton"]').length);
      await page.waitForTimeout(1600);
      const done = await page.evaluate(() => (document.body.innerText || '').length);
      const rec = { name, mode, loading, textAfter: done, pass: loading > 0 && done > 60 };
      if (!rec.pass) addFinding('P1', '延迟加载未显示骨架/加载态', rec);
      out.states.push(rec);
    } else {
      await page.waitForTimeout(900);
      const r = await page.evaluate(() => ({ text: document.body.innerText || '', mounted: !!document.querySelector('.m-screen'), empty: document.querySelectorAll('.empty,.m-empty,[class*="empty"]').length }));
      const hint = mode === 'error' ? /失败|重试|错误|异常|不可用/ : /暂无|还没有|没有.*(作业|记录|数据|内容)|空/;
      const rec = { name, mode, mounted: r.mounted, emptyEls: r.empty, text: r.text.replace(/\s+/g, ' ').slice(0, 160), pass: r.mounted && hint.test(r.text) };
      if (!rec.pass) addFinding('P1', '失败/空态未给出可读反馈', rec);
      out.states.push(rec);
    }
    await ctx.close();
  }
  await stateCase('学生作业列表-延迟', 'student', '/m/student/assignments', '**/api/student/assignments**', 'delay');
  await stateCase('学生作业列表-失败', 'student', '/m/student/assignments', '**/api/student/assignments**', 'error');
  await stateCase('学生作业列表-空', 'student', '/m/student/assignments', '**/api/student/assignments**', 'empty');
  await stateCase('教师审核队列-延迟', 'teacher', '/m/teacher/review', '**/api/teacher/submissions**', 'delay');
  await stateCase('教师审核队列-失败', 'teacher', '/m/teacher/review', '**/api/teacher/submissions**', 'error');
  await stateCase('教师题库-空', 'teacher', '/m/teacher/questions', '**/api/teacher/questions**', 'empty');

  /* 9. 共享组件：MobileLayout / MSheet / TabBar / 字号 */
  {
    const ctx = await newContext({ role: 'student' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.goto(BASE + '/m/student/assignments/1/answer', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.m-screen', { timeout: 9000 });
    await page.waitForTimeout(900);
    const before = await page.evaluate(() => ({
      tabbar: document.querySelectorAll('.tabbar').length,
      sheetInScreen: !!document.querySelector('.m-screen .m-sheet-root'),
      sheetRoots: document.querySelectorAll('.m-sheet-root').length,
    }));
    // 找答题卡按钮
    const btn = page.locator('button[aria-label*="答题卡"], button:has-text("答题卡")').first();
    let opened = false;
    if (await btn.count()) { await btn.click(); opened = true; }
    await page.waitForTimeout(500);
    const sheet = await page.evaluate(() => {
      const s = document.querySelector('.sheet.open');
      if (!s) return { open: false };
      const close = s.querySelector('.sheet-close');
      const r = close ? close.getBoundingClientRect() : null;
      return { open: true, inScreen: !!s.closest('.m-screen'), closeW: r && Math.round(r.width), closeH: r && Math.round(r.height), role: s.getAttribute('role'), modal: s.getAttribute('aria-modal') };
    });
    if (opened) {
      if (!sheet.open) addFinding('P1', 'MSheet 未能打开', { page: '/m/student/assignments/1/answer' });
      if (sheet.open && (sheet.closeW < 44 || sheet.closeH < 44)) addFinding('P1', 'MSheet 关闭按钮命中区 <44×44', sheet);
      if (sheet.open && !sheet.inScreen) addFinding('P1', 'MSheet 被 teleport 到 .m-screen 外', sheet);
      // Esc 关闭
      await page.keyboard.press('Escape');
      await page.waitForTimeout(350);
      const escClosed = await page.evaluate(() => !document.querySelector('.sheet.open'));
      // 再开 + 遮罩关闭
      await btn.click(); await page.waitForTimeout(350);
      const maskClicked = await page.evaluate(() => { const m = document.querySelector('.mask.open'); if (!m) return false; m.click(); return true; });
      await page.waitForTimeout(350);
      const maskClosed = await page.evaluate(() => !document.querySelector('.sheet.open'));
      out.components.sheet = {
        opened, sheet, escClosed, maskClicked, maskClosed,
        pass: opened && sheet.open && escClosed && maskClosed,
      };
      if (!escClosed) addFinding('P1', 'MSheet Esc 不能关闭', {});
      if (!maskClosed) addFinding('P1', 'MSheet 遮罩点击不能关闭', {});
    } else {
      out.components.sheet = { opened: false, note: '未找到答题卡入口按钮' };
      addFinding('P1', '作答页未找到答题卡入口', {});
    }
    out.components.layout = before;
    // 截图
    await page.screenshot({ path: path.join(ART, 'answer-sheet.png') }).catch(() => {});
    await ctx.close();
  }
  // TabBar role 门控：公共页无 tabbar，学生/教师有 4 项
  {
    const checks = [];
    for (const [role, url] of [[null, '/m/doc'], ['student', '/m/student/home'], ['teacher', '/m/teacher/home']]) {
      const ctx = await newContext({ role });
      const page = await ctx.newPage();
      await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.m-screen', { timeout: 9000 });
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => ({ tabbar: document.querySelectorAll('.tabbar').length, items: document.querySelectorAll('.tabbar .tabbar-item').length }));
      checks.push({ role: role || 'public', url, ...r });
      if (role ? !(r.tabbar === 1 && r.items === 4) : r.tabbar !== 0) addFinding('P1', 'MobileLayout role 门控异常（TabBar）', { role: role || 'public', url, ...r });
      await ctx.close();
    }
    out.components.tabbar = checks;
  }
  // 字号偏好（教师 profile 已实现；学生 profile 是否缺失 = 契约 09 §4 检查）
  {
    const ctx = await newContext({ role: 'teacher' });
    const page = await ctx.newPage();
    await page.goto(BASE + '/m/teacher/profile', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.m-screen', { timeout: 9000 });
    await page.waitForTimeout(800);
    const row = page.locator('button', { hasText: '字号大小' }).first();
    let rec = { rowFound: await row.count() > 0 };
    if (rec.rowFound) {
      await row.click(); await page.waitForTimeout(400);
      const options = await page.locator('.sheet.open button').allInnerTexts();
      rec.options = options.map((t) => t.trim()).filter(Boolean).slice(0, 6);
      const big = page.locator('.sheet.open button', { hasText: /大|较大/ }).first();
      if (await big.count()) {
        await big.click(); await page.waitForTimeout(400);
        rec.localStorage = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => /font/i.test(k)).map((k) => [k, localStorage.getItem(k)])));
        rec.mfs = await page.evaluate(() => getComputedStyle(document.querySelector('.m-screen')).getPropertyValue('--m-fs-body').trim());
      }
      rec.pass = rec.rowFound && rec.options && rec.options.length > 0;
      if (!rec.pass) addFinding('P2', '教师字号偏好未生效', rec);
    } else addFinding('P1', '教师「我的」缺字号设置', rec);
    await ctx.close();
    // 学生 profile 是否提供字号
    const ctx2 = await newContext({ role: 'student' });
    const p2 = await ctx2.newPage();
    await p2.goto(BASE + '/m/student/profile', { waitUntil: 'domcontentloaded' });
    await p2.waitForSelector('.m-screen', { timeout: 9000 });
    await p2.waitForTimeout(600);
    const stuHasFont = await p2.evaluate(() => /字号/.test(document.body.innerText || ''));
    out.components.font = { teacher: rec, studentHasFontSetting: stuHasFont };
    if (!stuHasFont) addFinding('P1', '学生「我的」缺字号偏好（09 §4 列出）', { url: '/m/student/profile' });
    await ctx2.close();
  }

  /* 10. 360 溢出抽查 + 截图 */
  {
    const ctx = await newContext({ role: 'student', viewport: { width: 360, height: 800 } });
    for (const p of ['/m/student/home', '/m/student/assignments']) {
      const page = await ctx.newPage();
      await page.goto(BASE + p, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.m-screen', { timeout: 9000 });
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth + 1, vw: window.innerWidth, sw: document.documentElement.scrollWidth }));
      if (r.overflow) addFinding('P1', '360 档横向溢出', { page: p, ...r });
      await page.screenshot({ path: path.join(ART, p.replace(/\//g, '_') + '-360.png') }).catch(() => {});
      out.pages.push({ url: p, viewport: '360x800', ...r });
      await page.close();
    }
    await ctx.close();
  }

  /* 11. 关键证据截图 */
  {
    const shots = [
      ['student', '/m/student/home', 'student-home.png'],
      ['teacher', '/m/teacher/review', 'teacher-review.png'],
      ['teacher', '/m/teacher/review/101', 'teacher-review-detail.png'],
      ['student', '/m/student/scores', 'student-scores.png'],
    ];
    for (const [role, url, file] of shots) {
      const ctx = await newContext({ role, viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.m-screen', { timeout: 9000 });
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(ART, file), fullPage: false }).catch(() => {});
      await ctx.close();
    }
    // 超管 403 文案截图
    const ctx = await newContext({ role: 'super_admin' });
    const page = await ctx.newPage();
    await page.goto(BASE + '/m', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const url = page.url();
    const text = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300));
    await page.screenshot({ path: path.join(ART, 'admin-403.png') }).catch(() => {});
    if (!/电脑端|管理端/.test(text)) addFinding('P1', '超管 403 未提示使用电脑端', { url, text });
    out.guards.push({ name: '超管 /m 403 文案', finalUrl: url, text, pass: /电脑端|管理端/.test(text) });
    await ctx.close();
  }

  /* 12. console 汇总 + 结果落盘 */
  await browser.close();
  out.summary = {
    pages: out.pages.length,
    consoleErrors: out.console.length,
    guardFailures: out.guards.filter((g) => !g.pass).length,
    stateFailures: out.states.filter((s) => !s.pass).length,
    findings: { P0: out.findings.filter((f) => f.level === 'P0').length, P1: out.findings.filter((f) => f.level === 'P1').length, P2: out.findings.filter((f) => f.level === 'P2').length },
  };
  fs.writeFileSync(path.join(ART, 'smoke.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out.summary, null, 2));
  for (const f of out.findings) console.log(f.level + ' | ' + f.title + ' | ' + JSON.stringify(f.detail).slice(0, 260));
  console.log('ARTIFACT tests/mobile-v1/artifacts/smoke.json');
  process.exit(out.findings.some((f) => f.level === 'P0') ? 1 : 0);
}
main().catch((e) => { console.error('SMOKE_FATAL', e); process.exit(2); });
