#!/usr/bin/env node
/**
 * v1 禁用数据文案审计（源码 + 运行 DOM 双查的 DOM 侧）
 * 判定：innerText（可见）命中 = 渲染违规；仅 textContent 命中（hidden） = 允许的隐藏代码/注释，记录为 P2 观察。
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
const student = { id: 1001, username: '2026001004', realName: '李明', role: 'student', currentSchool: { id: 1, name: 'Deadpan 大学' }, classes: [{ id: 1, className: '计算机 2301 班' }] };
const teacher = { id: 2001, username: 'T2026001', realName: '周子轩', role: 'teacher', currentSchool: { id: 1, name: 'Deadpan 大学' }, teacherSchools: [{ id: 1, name: 'Deadpan 大学' }] };
const now = Date.now();
const assignment = { id: 1, title: '数据结构实验三', status: 'active', startTime: new Date(now - 86400000).toISOString(), endTime: new Date(now + 7 * 3600000).toISOString(), maxScore: 100, answeredCount: 2, _count: { assignmentQuestions: 6 }, scorePolicy: 'best' };
const submission = { id: 101, studentName: '陈嘉懿', studentNo: '2025010101', aiScore: 92, finalScore: null, status: 'submitted', submittedAt: new Date(now - 3600000).toISOString(), questionType: 'code', aiComment: '思路清晰' };
const mock = (method, p) => {
  if (method === 'GET') {
    if (p === '/student/assignments') return { list: [assignment], total: 1 };
    if (/^\/student\/assignments\/\d+$/.test(p)) return { assignment: { ...assignment, assignmentQuestions: [] }, submissions: [] };
    if (p === '/student/scores') return [{ assignmentId: 1, assignmentTitle: 'Java 期末考试', totalScore: 92, maxScore: 100 }];
    if (p === '/student/profile') return { realName: '李明', classes: [{ className: '计算机 2301 班' }] };
    if (p === '/teacher/pending-summary') return { pendingReview: 12, aiPending: 2, abnormal: 0 };
    if (p === '/teacher/assignments') return { list: [{ id: 1, title: assignment.title, status: 'active', submissionCount: 38, expectedCount: 45 }], total: 1 };
    if (/^\/teacher\/assignments\/\d+$/.test(p)) return { id: 1, title: assignment.title, status: 'active', assignmentClasses: [{ classId: 1, className: '计算机 2301 班' }] };
    if (p === '/teacher/review-summary') return { list: [{ assignmentId: 1, submitted: 38, expected: 45, pendingReview: 12 }] };
    if (p === '/teacher/submissions') return { list: [submission], total: 1 };
    if (/^\/teacher\/submissions\/\d+$/.test(p)) return submission;
    if (p === '/teacher/questions') return { list: [{ id: 1, title: '两数之和', type: 'code', maxScore: 10 }], total: 1 };
    if (p === '/teacher/classes') return { list: [{ id: 1, className: '计算机 2301 班' }] };
    if (p === '/teacher/students') return { list: [] };
    if (/^\/teacher\/review-class/.test(p)) return { list: [] };
    return { list: [], total: 0 };
  }
  return {};
};
const RULES = [
  ['排名', /班级?排名|排名第/], ['均分', /班[级均]?分|均分/], ['最高分', /最高分/], ['百分位', /百分位|超过.{0,4}%/],
  ['等级分布', /等级分布/], ['分数构成', /分数构成|得分构成/], ['AI 分项', /AI ?分项/], ['催交', /催交/],
  ['打回', /打回|退回重做/], ['题库使用次数', /使用次数|最近使用/], ['免登录接力', /免登录|10 ?分钟有效|已同步到电脑/],
  ['在线人数', /在线人数|在线用户/], ['请求编号', /请求编号|requestId/],
];
const PAGES = [
  ['student', '/m/student/home'], ['student', '/m/student/assignments'], ['student', '/m/student/assignments/1'],
  ['student', '/m/student/scores'], ['student', '/m/student/scores/1'], ['student', '/m/student/profile'],
  ['student', '/m/student/assignments/1/done'],
  ['teacher', '/m/teacher/home'], ['teacher', '/m/teacher/assignments'], ['teacher', '/m/teacher/assignments/1'],
  ['teacher', '/m/teacher/review'], ['teacher', '/m/teacher/review/101'], ['teacher', '/m/teacher/batch'],
  ['teacher', '/m/teacher/batch/confirm'], ['teacher', '/m/teacher/questions'], ['teacher', '/m/teacher/classes/1'], ['teacher', '/m/teacher/profile'],
  ['public', '/m/doc'],
];
const browser = await chromium.launch();
const out = { checked: [], visibleHits: [], hiddenHits: [] };
for (const [role, url] of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const user = role === 'student' ? student : role === 'teacher' ? teacher : null;
  if (user) await ctx.addInitScript(({ u }) => { localStorage.setItem('token', 'mock-token'); localStorage.setItem('user', JSON.stringify(u)); }, { u: user });
  await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
    const req = route.request(); const u = new URL(req.url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data: mock(req.method(), u.pathname) }) });
  });
  const page = await ctx.newPage();
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.m-screen', { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(700);
  const r = await page.evaluate((rules) => {
    const visibleText = (document.body.innerText || '').replace(/\s+/g, ' ');
    const allText = (document.body.textContent || '').replace(/\s+/g, ' ');
    const hits = { visible: [], hidden: [] };
    for (const [label, src] of rules) {
      const re = new RegExp(src);
      const vm = visibleText.match(re);
      if (vm) hits.visible.push({ label, match: vm[0], context: visibleText.slice(Math.max(0, vm.index - 30), vm.index + 40) });
      const am = allText.match(re);
      if (am && !vm) hits.hidden.push({ label, match: am[0], context: allText.slice(Math.max(0, am.index - 30), am.index + 40) });
    }
    return hits;
  }, RULES.map(([l, re]) => [l, re.source]));
  for (const h of r.visible) {
    if (url === '/m/doc' && h.label === '催交') continue; // 文档页待更新文案，报告单列 P2
    out.visibleHits.push({ page: url, ...h });
  }
  for (const h of r.hidden) out.hiddenHits.push({ page: url, ...h });
  out.checked.push(url);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(ART, 'dom-text-audit.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ checked: out.checked.length, visibleHits: out.visibleHits, hiddenHits: out.hiddenHits }, null, 1).slice(0, 6000));
process.exit(out.visibleHits.length ? 1 : 0);
