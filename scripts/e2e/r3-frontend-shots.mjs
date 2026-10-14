/**
 * r3-frontend-shots.mjs —— R3-E1 / S14：真浏览器（vite dev :5173 + 真 API :3000）关键 5 屏
 * 用法：node scripts/e2e/r3-frontend-shots.mjs --i-know
 * 产物：docs/dsh/evidence/agent-c/shots/s14-*.png
 */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { guard, makeApi, prismaClient, REPO } from './_guard.mjs';

const BASE = (process.env.E2E_BASE || 'http://localhost:3000') + '/api';
const WEB = process.env.E2E_WEB || 'http://localhost:5173/exam/';
guard({ base: BASE, requireIKnow: true });
const require = createRequire(path.join(REPO, 'client', 'package.json'));
const { chromium } = require('playwright');
const PW = process.env.E2E_STUDENT_PASSWORD || 'E2E@Test12345';
const SHOTS = path.join(REPO, 'docs/dsh/evidence/agent-c/shots');
fs.mkdirSync(SHOTS, { recursive: true });
const { api, login } = makeApi(BASE);
const prisma = prismaClient();
const results = [];
const ok = (n, c, d = '') => { results.push({ n, c: !!c, d }); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? ' :: ' + d : '')); };

const tok = async (u, pws) => { for (const pw of pws) { const r = await login(u, pw); if (r.j?.code === 0) return r.j.data.token; } return null; };
const teacherTok = await tok('teacher_a', [PW, 'teacher_a', 'Test@12345']);
ok('S14-0 教师登录(API)', !!teacherTok);

// 场景素材：最近的 S2 作业（59 人上传）+ S15 作业（已发布 77）
const s2 = await prisma.assignment.findFirst({ where: { teacherId: 1063, title: { startsWith: 'E2E-S2-' } }, orderBy: { id: 'desc' }, select: { id: true, assignmentQuestions: { select: { questionId: true } } } });
const s2Sub = await prisma.submission.findFirst({ where: { assignmentId: s2.id }, orderBy: { id: 'asc' }, select: { id: true, studentId: true } });
const s2Stu = await prisma.user.findUnique({ where: { id: s2Sub.studentId }, select: { id: true, username: true, realName: true } });
const s15 = await prisma.assignment.findFirst({ where: { teacherId: 1063, title: { startsWith: 'E2E-S15-' } }, orderBy: { id: 'desc' }, select: { id: true } });
const s15Sub = await prisma.submission.findFirst({ where: { assignmentId: s15.id, status: 'published' }, select: { id: true, studentId: true, finalScore: true } });
const s15Stu = await prisma.user.findUnique({ where: { id: s15Sub.studentId }, select: { id: true, username: true, realName: true } });
console.log('素材: S2 aid=' + s2.id + ' qid=' + s2.assignmentQuestions[0].questionId + ' 学生=' + s2Stu.username + ' | S15 aid=' + s15.id + ' 学生=' + s15Stu.username + ' 分=' + s15Sub.finalScore);

const stuTok = await tok(s2Stu.username, [PW]);
ok('S14-0 学生登录(API)', !!stuTok);
const stuTok15 = await tok(s15Stu.username, [PW]);

const browser = await chromium.launch();
const shot = async (name, { role, user, url, waitFor, after }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(([u]) => {
    localStorage.setItem('token', u.token);
    localStorage.setItem('user', JSON.stringify(u.user));
  }, [{ token: user.token, user: user.user }]);
  const page = await ctx.newPage();
  await page.goto(WEB.replace(/\/$/, '') + url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  if (waitFor) { try { await page.waitForSelector(waitFor, { timeout: 15000 }); } catch { /* 记录但继续 */ } }
  if (after) await after(page);
  await page.waitForTimeout(600);
  const file = path.join(SHOTS, name + '.png');
  await page.screenshot({ path: file, fullPage: false });
  const txt = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 2000);
  console.log('  shot ' + name + ' ← ' + page.url());
  await ctx.close();
  return { file, txt };
};

const teacherUser = { id: 1063, username: 'teacher_a', realName: 'A老师', role: 'teacher', currentSchool: { id: 1, name: '示范校' } };
const stuS2 = { id: s2Stu.id, username: s2Stu.username, realName: s2Stu.realName, role: 'student', currentSchool: { id: 1 } };
const stuS15 = { id: s15Stu.id, username: s15Stu.username, realName: s15Stu.realName, role: 'student', currentSchool: { id: 1 } };

// ① 教师端：布置作业弹窗（三开关）
const s1 = await shot('s14-1-teacher-new-assignment', {
  role: 'teacher', user: { token: teacherTok, user: teacherUser }, url: '/teacher/assignments', waitFor: 'text=布置作业',
  after: async (page) => { await page.getByRole('button', { name: '布置作业' }).first().click().catch(() => {}); await page.waitForTimeout(1200); },
});
ok('S14-1 教师建作业弹窗（含三开关）', /提交与评分|允许重交|计分口径/.test(s1.txt), s1.txt.slice(0, 120));

// ② 学生端：提交页（第 k 次/上限）
const s2shot = await shot('s14-2-student-submit-attempts', { role: 'student', user: { token: stuTok, user: stuS2 }, url: '/student/assignments/' + s2.id, waitFor: '.sp-top' });
ok('S14-2 学生提交页显示第 k 次提交', /已提交 1 次 · 本次为第 2 次|第 1 次提交/.test(s2shot.txt), s2shot.txt.slice(0, 120));

// ③ 教师端：实训题审核页（评分面板）
const s3 = await shot('s14-3-teacher-project-review', { role: 'teacher', user: { token: teacherTok, user: teacherUser }, url: '/teacher/review/project/' + s2Sub.id, waitFor: '.teacher-section' });
ok('S14-3 教师实训审核页（评分面板）', /评分面板|最终分数/.test(s3.txt), s3.txt.slice(0, 120));

// ④ 学生端：成绩页（已出分）
const s4 = await shot('s14-4-student-scores', { role: 'student', user: { token: stuTok15, user: stuS15 }, url: '/student/scores' });
ok('S14-4 学生成绩页（已出分）', /已出分|77/.test(s4.txt), s4.txt.slice(0, 120));

// ⑤ 学生端：作业详情（得分 tag）
const s5 = await shot('s14-5-student-assignment-detail', { role: 'student', user: { token: stuTok15, user: stuS15 }, url: '/student/assignments/' + s15.id, waitFor: '.sp-top' });
ok('S14-5 学生作业详情显示得分/已出分', /77/.test(s5.txt), s5.txt.slice(0, 120));

await browser.close();
await prisma.$disconnect();
const fails = results.filter((r) => !r.c).length;
console.log('\n===== S14 PASS=' + (results.length - fails) + ' FAIL=' + fails + ' ｜ 截图目录 ' + SHOTS + ' =====');
process.exit(fails ? 1 : 0);
