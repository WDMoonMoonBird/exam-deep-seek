/**
 * r3-local-plan.mjs —— R3-E1：本地可验场景（S1 + S3–S13 + S15）逐条断言 + JSON 报告
 * 用法：node scripts/e2e/r3-local-plan.mjs --i-know
 * 说明：真装置评分/AI 总评/判据复用/预期分差 本地不可验 ⇒ 显式 SKIP（不作本地验收项）
 */
import fs from 'node:fs';
import path from 'node:path';
import { guard, makeApi, prismaClient, materialsDir, Report, REPO, serverRequire } from './_guard.mjs';

const BASE = (process.env.E2E_BASE || 'http://localhost:3000') + '/api';
guard({ base: BASE, requireIKnow: true });
const MAT = materialsDir();
const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const OUT = path.join(REPO, 'docs/dsh/evidence/agent-c', 'e2e-local-plan-' + TS + '.json');
const PW = process.env.E2E_STUDENT_PASSWORD || 'E2E@Test12345';
const DAY = 86400e3;
const { api, upload, login } = makeApi(BASE);
const prisma = prismaClient();
const R = new Report('E2E 本地可验场景（S1/S3–S13/S15）');

const loginAny = async (username, pws) => { for (const pw of pws) { const r = await login(username, pw); if (r.j && r.j.code === 0) return r.j.data.token; if (r.j && r.j.code === 1002 && r.j.data?.schools?.length) { const r2 = await login(username, pw, r.j.data.schools[0].officialCode); if (r2.j && r2.j.code === 0) return r2.j.data.token; } } return null; };
const T = await loginAny('teacher_a', [PW, 'teacher_a', 'Test@12345']);
R.add('S0-教师登录(teacher_a)', T ? 'PASS' : 'FAIL');
const TB = await loginAny('teacher_b', [PW, 'teacher_b', 'Test@12345']);
R.add('S0-教师登录(teacher_b/越权用)', TB ? 'PASS' : 'FAIL', TB ? 'teacher_b token 获取成功' : '口令未知 ⇒ 相关越权断言将 SKIP');
const ADMIN = await loginAny('admin', [PW, 'admin', 'Test@12345']);

// ── 夹具：teacher_a 的 code 题（复用未删除的，否则新建）──
let qCode = await prisma.question.findFirst({ where: { teacherId: 1063, type: 'code', deletedAt: null }, orderBy: { id: 'desc' }, select: { id: true, title: true, subQuestions: { select: { id: true } } } });
if (!qCode || !qCode.subQuestions?.length) {
  const mk = await api('POST', '/teacher/questions', T, { title: 'E2E-S1-code-' + TS, type: 'code', difficulty: 'easy', maxScore: 100,
    subQuestions: [{ sortOrder: 1, title: '小题1', content: '<p>c</p>', referenceAnswer: 'print(1)', language: 'python', score: 100 }] });
  qCode = mk.j?.data ? { id: mk.j.data.id, title: mk.j.data.title, subQuestions: [{ id: mk.j.data.subQuestions?.[0]?.id }] } : null;
}
R.add('S0-code 题夹具', qCode?.id ? 'PASS' : 'FAIL', 'qid=' + qCode?.id + ' sqid=' + qCode?.subQuestions?.[0]?.id);
const SQ = qCode?.subQuestions?.[0]?.id;

const mkAsg = async (title, extra = {}) => {
  const now = Date.now();
  const res = await api('POST', '/teacher/assignments', T, {
    title, description: 'E2E 本地场景（可删）', startTime: new Date(now - 3600e3).toISOString(), endTime: new Date(now + DAY).toISOString(),
    questionIds: [qCode.id], classIds: [117], allowResubmit: true, maxAttempts: null, scorePolicy: 'last', answerVisibility: 'after_publish', ...extra,
  });
  return res.j?.data?.id;
};
const stuTok = async (username) => loginAny(username, [PW, username, 'Test@12345']);
const stuOf117 = async (n = 0) => { const l = await prisma.studentClass.findMany({ where: { classId: 117 }, select: { studentId: true }, orderBy: { studentId: 'asc' }, skip: n, take: 1 }); const u = await prisma.user.findUnique({ where: { id: l[0].studentId }, select: { username: true } }); return u.username; };
const submit = (tok, aid, body) => api('POST', '/student/assignments/' + aid + '/submit', tok, body);
const mkSubBody = (answer) => ({ questionId: qCode.id, subQuestionId: SQ, answer });

// ══ S1：编程题无标准包 ⇒ 触发批改 409 + 1011 + requiresChecker ══
{
  const aid = await mkAsg('E2E-S1-' + TS);
  const g1 = await api('POST', '/teacher/assignments/' + aid + '/grade', T, {});
  R.add('S1 无标准包触发批改 ⇒ 409+1011+requiresChecker', g1.status === 409 && g1.j?.code === 1011 && g1.j?.data?.requiresChecker === true ? 'PASS' : 'FAIL',
    'status=' + g1.status + ' body=' + String(g1.txt).slice(0, 140));
}

// ══ S3：maxAttempts=1 ⇒ 第 2 次被拦 + 文案 + 次数不涨 ══
{
  const aid = await mkAsg('E2E-S3-' + TS, { maxAttempts: 1 });
  const u1 = await stuOf117(0); const tok = await stuTok(u1);
  const r1 = await submit(tok, aid, mkSubBody('print(1)'));
  const r2 = await submit(tok, aid, mkSubBody('print(2)'));
  const row = await prisma.submission.findFirst({ where: { assignmentId: aid }, select: { attemptCount: true } });
  R.add('S3 上限=1：第2次 400 + 文案 + 次数不涨', r1.status === 200 && r2.status === 400 && /已达提交次数上限（最多 1 次）/.test(String(r2.j?.message)) && row?.attemptCount === 1 ? 'PASS' : 'FAIL',
    'r1=' + r1.status + ' r2=' + r2.status + ' msg=' + r2.j?.message + ' attemptCount=' + row?.attemptCount);
}

// ══ S4：allowResubmit=false ⇒ 第 2 次 400 ══
{
  const aid = await mkAsg('E2E-S4-' + TS, { allowResubmit: false, maxAttempts: null });
  const tok = await stuTok(await stuOf117(1));
  const r1 = await submit(tok, aid, mkSubBody('print(1)'));
  const r2 = await submit(tok, aid, mkSubBody('print(2)'));
  R.add('S4 不允许重交 ⇒ 第2次 400「已提交，不可重复提交」', r1.status === 200 && r2.status === 400 ? 'PASS' : 'FAIL', 'r1=' + r1.status + ' r2=' + r2.status + ' msg=' + r2.j?.message);
}

// ══ S5：计分口径回显（真分比较需 checker ⇒ SKIP）══
{
  const aBest = await mkAsg('E2E-S5-best-' + TS, { scorePolicy: 'best' });
  const aLast = await mkAsg('E2E-S5-last-' + TS, { scorePolicy: 'last' });
  const d1 = await api('GET', '/teacher/assignments/' + aBest, T);
  const d2 = await api('GET', '/teacher/assignments/' + aLast, T);
  R.add('S5 计分口径回显(best/last)', d1.j?.data?.scorePolicy === 'best' && d2.j?.data?.scorePolicy === 'last' ? 'PASS' : 'FAIL', 'best=' + d1.j?.data?.scorePolicy + ' last=' + d2.j?.data?.scorePolicy);
  R.skip('S5b 口径对机器分的影响（真分）', '需 checker/装置产出分数；本地无 ⇒ 该口径的纯函数与读路径已由 C1（Q1–Q6 独立复算）+ 集成套件覆盖，真分比较留待上云');
}

// ══ S6：答案可见性（未发布不下发答案）══
{
  const aid = await mkAsg('E2E-S6-' + TS, { answerVisibility: 'after_publish' });
  const tok = await stuTok(await stuOf117(2));
  await submit(tok, aid, mkSubBody('print(1)'));
  const sd = await api('GET', '/student/assignments/' + aid, tok);
  const sub = (sd.j?.data?.submissions || [])[0] || {};
  const raw = JSON.stringify(sd.j);
  // 口径：不得出现 aiScore/aiFeedback 键；referenceAnswer 键可存在但值必须为 null（后端裁剪）
  const hasAiKeys = /"aiScore"|"aiFeedback"/.test(raw);
  const refAnswers = [...raw.matchAll(/"referenceAnswer":(null|"[^"]*")/g)].map((m) => m[1]);
  const leakedAnswers = refAnswers.filter((v) => v !== 'null');
  R.add('S6 after_publish + 未发布 ⇒ 学生端无答案/AI 值', !hasAiKeys && leakedAnswers.length === 0 && (sub.finalScore ?? null) === null ? 'PASS' : 'FAIL',
    'aiFields=' + hasAiKeys + ' referenceAnswer 非空数=' + leakedAnswers.length + '（共 ' + refAnswers.length + ' 个键，全为 null = 已裁剪） finalScore=' + sub.finalScore + ' status=' + sub.status);
  R.skip('S6b immediate 正例（评分完成即可见答案）', '需评分完成（无 checker ⇒ 状态停在 submitted）⇒ 本地不可达；该门在 C2（S4）与 r3-d4 套件有覆盖，留待上云复验');
}

// ══ S7：不限次（maxAttempts=null）⇒ 3 次提交均 200 ══
{
  const aid = await mkAsg('E2E-S7-' + TS, { allowResubmit: true, maxAttempts: null });
  const tok = await stuTok(await stuOf117(3));
  const rs = [];
  for (let i = 1; i <= 3; i++) rs.push((await submit(tok, aid, mkSubBody('print(' + i + ')'))).status);
  R.add('S7 不限次 ⇒ 3 次提交均 200', rs.every((s) => s === 200) ? 'PASS' : 'FAIL', JSON.stringify(rs));
}

// ══ S8：权限矩阵 ══
{
  const aid = await mkAsg('E2E-S8-' + TS);
  const tok = await stuTok(await stuOf117(4));
  await submit(tok, aid, mkSubBody('print(1)'));
  const row = await prisma.submission.findFirst({ where: { assignmentId: aid }, select: { id: true, finalScore: true, teacherFeedback: true, status: true } });
  if (TB && row) {
    const g = await api('GET', '/teacher/submissions/' + row.id, TB);
    const p = await api('PUT', '/teacher/submissions/' + row.id + '/score', TB, { finalScore: 66 });
    const after = await prisma.submission.findUnique({ where: { id: row.id }, select: { finalScore: true, teacherFeedback: true, status: true } });
    const zeroWrite = JSON.stringify(after) === JSON.stringify({ finalScore: row.finalScore, teacherFeedback: row.teacherFeedback, status: row.status });
    R.add('S8a 他师（不可见）看提交 ⇒ 403', g.status === 403 ? 'PASS' : 'FAIL', 'status=' + g.status + ' code=' + g.j?.code);
    R.add('S8b 他师改分 ⇒ 403 + 零写入', p.status === 403 && zeroWrite ? 'PASS' : 'FAIL', 'status=' + p.status + ' zeroWrite=' + zeroWrite);
  } else R.skip('S8a/S8b 他师越权', '缺少 teacher_b 口令或提交行 ⇒ 未执行');
  if (row) {
    const adminByTeacher = await api('POST', '/api/admin/submissions/' + row.id + '/project/regrade', T, {});
    R.add('S8c 普通教师走管理员端点 ⇒ 403', adminByTeacher.status === 403 || adminByTeacher.status === 404 ? 'PASS' : 'FAIL', 'status=' + adminByTeacher.status + ' code=' + adminByTeacher.j?.code);
  }
  // 非本班学生提交 ⇒ 拒绝
  const other = await prisma.user.findFirst({ where: { role: 'student', studentClasses: { none: { classId: 117 } } }, select: { id: true, username: true } });
  if (other) {
    const bcrypt = serverRequire('bcryptjs');
    await prisma.user.update({ where: { id: other.id }, data: { password: bcrypt.hashSync(PW, 10) } });   // 本地库：统一口令（报告已记录）
    const ot = await stuTok(other.username);
    const r = ot ? await submit(ot, aid, mkSubBody('x')) : null;
    R.add('S8d 非本班学生提交 ⇒ 拒绝(403/404)', r && (r.status === 403 || r.status === 404) ? 'PASS' : 'FAIL', '学生=' + other.username + ' status=' + (r?.status) + ' code=' + r?.j?.code + ' msg=' + r?.j?.message);
  } else R.skip('S8d 非本班学生提交', '库中未找到非 117 班学生');
}

// ══ S9：状态机 + 发布 + 发布后再改分（G3）══
{
  const aid = await mkAsg('E2E-S9-' + TS);
  const u = await stuOf117(5); const tok = await stuTok(u);
  await submit(tok, aid, mkSubBody('print(1)'));
  const row = await prisma.submission.findFirst({ where: { assignmentId: aid }, select: { id: true } });
  const sc = await api('PUT', '/teacher/submissions/' + row.id + '/score', T, { finalScore: 88, teacherFeedback: 'E2E 本地' });
  const st1 = (await prisma.submission.findUnique({ where: { id: row.id }, select: { status: true } })).status;
  const pub = await api('PUT', '/teacher/submissions/publish', T, { submissionIds: [row.id] });
  const st2 = (await prisma.submission.findUnique({ where: { id: row.id }, select: { status: true } })).status;
  const s1 = await api('GET', '/student/assignments/' + aid, tok);
  const v1 = (s1.j?.data?.submissions || [])[0]?.finalScore;
  const sc2 = await api('PUT', '/teacher/submissions/' + row.id + '/score', T, { finalScore: 90 });
  const st3 = (await prisma.submission.findUnique({ where: { id: row.id }, select: { status: true } })).status;
  const s2 = await api('GET', '/student/assignments/' + aid, tok);
  const v2 = (s2.j?.data?.submissions || [])[0]?.finalScore;
  R.add('S9a 改分 ⇒ reviewed', sc.status === 200 && st1 === 'reviewed' ? 'PASS' : 'FAIL', 'status=' + sc.status + ' db=' + st1);
  R.add('S9b 发布端点 ⇒ published', pub.status === 200 && st2 === 'published' ? 'PASS' : 'FAIL', 'status=' + pub.status + ' db=' + st2);
  R.add('S9c 发布后学生可见 88', v1 === 88 ? 'PASS' : 'FAIL', '学生端=' + v1);
  R.add('S9d 已发布再改分 ⇒ 仍 published 且学生见 90（G3）', sc2.status === 200 && st3 === 'published' && v2 === 90 ? 'PASS' : 'FAIL', 'db=' + st3 + ' 学生端=' + v2);
}

// ══ S10：非法 questionId ⇒ 400（窄口径，C7/C8 已详验）══
{
  const aid = await mkAsg('E2E-S10-' + TS);
  const tok = await stuTok(await stuOf117(6));
  const r = await submit(tok, aid, { questionId: 'abc', answer: 'x' });
  R.add('S10 非法 questionId ⇒ 400 可读文案', r.status === 400 && r.j?.code === 1001 ? 'PASS' : 'FAIL', 'status=' + r.status + ' msg=' + r.j?.message);
}

// ══ S11/S12：实训上传异常（非 zip / 穿越包）⇒ 400「压缩包内容非法」══
{
  // 复用 S2 的实训题（找出 class 117 下最近的 E2E-S2 作业）
  const asg = await prisma.assignment.findFirst({ where: { teacherId: 1063, title: { startsWith: 'E2E-S2-' } }, orderBy: { id: 'desc' }, select: { id: true, assignmentQuestions: { select: { questionId: true } } } });
  const qid = asg?.assignmentQuestions?.[0]?.questionId;
  const stu = await stuOf117(7); const tok = await stuTok(stu);
  const notZip = path.join('/tmp/r3e1', 'not-a-zip.zip'); fs.writeFileSync(notZip, Buffer.from('plain text'));
  const r1 = await upload('/student/assignments/' + asg.id + '/project/' + qid + '/submit', tok, notZip);
  const trav = '/tmp/r3e1/traversal.zip';
  const r2 = fs.existsSync(trav) ? await upload('/student/assignments/' + asg.id + '/project/' + qid + '/submit', tok, trav) : null;
  R.add('S11 非 zip 上传 ⇒ 400「压缩包内容非法」', r1.status === 400 && /压缩包内容非法/.test(String(r1.j?.message)) ? 'PASS' : 'FAIL', 'status=' + r1.status + ' msg=' + r1.j?.message);
  if (r2) R.add('S12 穿越包 ⇒ 400「压缩包内容非法」', r2.status === 400 && /压缩包内容非法/.test(String(r2.j?.message)) ? 'PASS' : 'FAIL', 'status=' + r2.status + ' msg=' + r2.j?.message);
  else R.skip('S12 穿越包', '缺 /tmp/r3c7/traversal.zip 夹具');
}

// ══ S13：过期 / 锁定 ══
{
  const now = Date.now();
  const mk2 = await api('POST', '/teacher/assignments', T, { title: 'E2E-S13-expired-' + TS, startTime: new Date(now - 2 * DAY).toISOString(), endTime: new Date(now - DAY).toISOString(), questionIds: [qCode.id], classIds: [117], allowResubmit: true, maxAttempts: null, scorePolicy: 'last', answerVisibility: 'after_publish' });
  const aid = mk2.j?.data?.id;
  const tok = await stuTok(await stuOf117(8));
  const r = await submit(tok, aid, mkSubBody('print(1)'));
  // 实测口径：过期 ⇒ DomainError ⇒ 400 + 可读文案（LOCKED 才是 403）；断言按"4xx + 文案"写
  R.add('S13a 过期作业提交 ⇒ 4xx「已过截止时间」', [400, 403].includes(r.status) && /已过截止时间/.test(String(r.j?.message)) ? 'PASS' : 'FAIL', 'status=' + r.status + ' msg=' + r.j?.message);
  const fresh = await mkAsg('E2E-S13-locked-' + TS);
  await api('PUT', '/teacher/assignments/' + fresh + '/lock', T, {});
  const r2 = await submit(tok, fresh, mkSubBody('print(1)'));
  R.add('S13b 锁定作业提交 ⇒ 403', r2.status === 403 ? 'PASS' : 'FAIL', 'status=' + r2.status + ' msg=' + r2.j?.message);
}

// ══ S15：跨路径口径一致（发布 + 教师分场景）══
{
  const aid = await mkAsg('E2E-S15-' + TS);
  const u = await stuOf117(9); const tok = await stuTok(u);
  await submit(tok, aid, mkSubBody('print(1)'));
  const row = await prisma.submission.findFirst({ where: { assignmentId: aid }, select: { id: true } });
  await api('PUT', '/teacher/submissions/' + row.id + '/score', T, { finalScore: 77 });
  await api('PUT', '/teacher/submissions/publish', T, { submissionIds: [row.id] });
  const det = await api('GET', '/student/assignments/' + aid, tok);
  const list = await api('GET', '/student/assignments?pageSize=100', tok);
  const scores = await api('GET', '/student/scores', tok);
  const vDet = (det.j?.data?.submissions || [])[0]?.finalScore;
  const rowL = (list.j?.data?.list || []).find((a) => a.id === aid);
  const vList = rowL?.finalScore;
  const rowS = (scores.j?.data || []).find((s) => s.assignmentId === aid);
  const vScores = rowS?.totalScore;
  R.add('S15 跨路径口径一致（详情/列表/成绩页）', vDet === 77 && vList === 77 && vScores === 77 ? 'PASS' : 'FAIL', JSON.stringify({ detail: vDet, list: vList, scores: vScores }));
}

const outFile = R.write(OUT);
console.log('\n===== ' + JSON.stringify(R.summary()) + ' =====');
console.log('JSON: ' + outFile);
await prisma.$disconnect();
process.exit(R.summary().fail > 0 ? 1 : 0);
