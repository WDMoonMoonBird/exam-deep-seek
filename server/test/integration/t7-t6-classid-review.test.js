/**
 * t7 独立复核（qa-api-review）：t6 的 classId / questionId 越权收敛与导出面
 *
 * 夹具与期望值全部自建（qa3_ 前缀，独立学校 29971/29972），不引用 t6 测试的任何断言；
 * 覆盖：export-review / review-class 的跨校 + 同校不可见反例与可见正例、review-questions 的
 * 「结果集合 == 手算可见题目集合」（非空断言不算通过）、三个提示词预览端点的 owner/归属校验、
 * 学生详情 finalScore 口径（published + finalScore=null + aiScore）。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 'qa3_';
const CODE1 = '29971';
const CODE2 = '29972';
const ANS_SECRET = PREFIX + '学生答案-绝密';
const REF_SECRET = PREFIX + '参考答案-绝密';
const AIFB_SECRET = PREFIX + 'AI评语-绝密';

const id = {};

async function purge() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const userIds = users.map(u => u.id);
  const schools = await prisma.school.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const schoolIds = schools.map(s => s.id);
  const classes = await prisma.class.findMany({ where: { OR: [{ name: { startsWith: PREFIX } }, { schoolId: { in: schoolIds } }] }, select: { id: true } });
  const classIds = classes.map(c => c.id);
  const teams = await prisma.team.findMany({ where: { OR: [{ name: { startsWith: PREFIX } }, { schoolId: { in: schoolIds } }, { createdBy: { in: userIds } }] }, select: { id: true } });
  const teamIds = teams.map(t => t.id);
  const questions = await prisma.question.findMany({ where: { OR: [{ title: { startsWith: PREFIX } }, { teacherId: { in: userIds } }] }, select: { id: true } });
  const questionIds = questions.map(q => q.id);
  const assignments = await prisma.assignment.findMany({ where: { OR: [{ title: { startsWith: PREFIX } }, { teacherId: { in: userIds } }] }, select: { id: true } });
  const assignmentIds = assignments.map(a => a.id);

  await prisma.submission.deleteMany({ where: { OR: [{ studentId: { in: userIds } }, { assignmentId: { in: assignmentIds } }, { questionId: { in: questionIds } }] } });
  await prisma.assignmentClass.deleteMany({ where: { OR: [{ assignmentId: { in: assignmentIds } }, { classId: { in: classIds } }] } });
  await prisma.assignmentQuestion.deleteMany({ where: { OR: [{ assignmentId: { in: assignmentIds } }, { questionId: { in: questionIds } }] } });
  await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
  await prisma.subQuestion.deleteMany({ where: { questionId: { in: questionIds } } });
  await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
  await prisma.teacherClass.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { classId: { in: classIds } }] } });
  await prisma.teacherSchool.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.studentClass.deleteMany({ where: { OR: [{ studentId: { in: userIds } }, { classId: { in: classIds } }] } });
  await prisma.teamClass.deleteMany({ where: { OR: [{ teamId: { in: teamIds } }, { classId: { in: classIds } }] } });
  await prisma.teamTeacher.deleteMany({ where: { OR: [{ teamId: { in: teamIds } }, { teacherId: { in: userIds } }] } });
  await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
}

const mkUser = (username, realName, role) => prisma.user.create({
  data: { username, password: bcrypt.hashSync(username, 10), realName, role },
});
async function login(username) {
  const res = await request().post('/api/auth/login').send({ username, password: username });
  if (res.body.code !== 0) throw new Error('登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}
const get = (token, url) => request().get(url).set('Authorization', 'Bearer ' + token);

function collectKeys(value, out = new Set()) {
  if (Array.isArray(value)) { for (const v of value) collectKeys(v, out); return out; }
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.add(k); collectKeys(v, out); }
  return out;
}
/** 越权拒绝必须是「无内容」的：状态码 + 字段级 + 文本级三重断言 */
function expectRejected(res, { status = 403, code = 1003, secrets = [], labels = [], keys = [] } = {}) {
  expect(res.status).toBe(status);
  expect(res.body.code).toBe(code);
  expect(res.body.data).toBeNull();
  const present = collectKeys(res.body);
  for (const k of keys) expect({ k, present: present.has(k) }).toEqual({ k, present: false });
  const text = JSON.stringify(res.body);
  for (const s of secrets) expect({ s, leak: text.includes(s) }).toEqual({ s, leak: false });
  for (const l of labels) expect({ l, leak: text.includes(l) }).toEqual({ l, leak: false });
}

let tokenA, tokenP, tokenStu;

async function seed() {
  const s1 = await prisma.school.create({ data: { name: PREFIX + 'school1', officialCode: CODE1 } });
  const s2 = await prisma.school.create({ data: { name: PREFIX + 'school2', officialCode: CODE2 } });
  const clsA = await prisma.class.create({ data: { name: PREFIX + 'class_a', schoolId: s1.id } });
  const clsP = await prisma.class.create({ data: { name: PREFIX + 'class_p', schoolId: s1.id } });   // 同校不可见
  const clsB = await prisma.class.create({ data: { name: PREFIX + 'class_b', schoolId: s2.id } });   // 跨校不可见

  const tA = await mkUser(PREFIX + 'teacher_a', '复核教师A', 'teacher');
  const tP = await mkUser(PREFIX + 'teacher_p', '复核教师P', 'teacher');
  const tB = await mkUser(PREFIX + 'teacher_b', '复核教师B', 'teacher');
  await prisma.teacherSchool.createMany({ data: [{ teacherId: tA.id, schoolId: s1.id }, { teacherId: tP.id, schoolId: s1.id }, { teacherId: tB.id, schoolId: s2.id }] });
  await prisma.teacherClass.createMany({ data: [{ teacherId: tA.id, classId: clsA.id }, { teacherId: tP.id, classId: clsP.id }, { teacherId: tB.id, classId: clsB.id }] });

  const stuA1 = await mkUser(PREFIX + 'stu_a1@' + CODE1, '复核生A1', 'student');
  const stuA2 = await mkUser(PREFIX + 'stu_a2@' + CODE1, '复核生A2', 'student');
  const stuP1 = await mkUser(PREFIX + 'stu_p1@' + CODE1, '复核生P1', 'student');
  const stuB1 = await mkUser(PREFIX + 'stu_b1@' + CODE2, '复核生B1', 'student');
  await prisma.studentClass.createMany({ data: [
    { studentId: stuA1.id, classId: clsA.id }, { studentId: stuA2.id, classId: clsA.id },
    { studentId: stuP1.id, classId: clsP.id }, { studentId: stuB1.id, classId: clsB.id },
  ] });

  const mkQ = (teacherId, suffix, maxScore, type = 'code') => prisma.question.create({
    data: {
      teacherId, title: PREFIX + suffix, maxScore, difficulty: 'easy', type,
      subQuestions: { create: [{ sortOrder: 1, title: PREFIX + suffix + '-s1', content: '<p>' + PREFIX + suffix + '-content</p>', referenceAnswer: REF_SECRET, language: 'python', score: maxScore }] },
    },
    include: { subQuestions: true },
  });
  const qA = await mkQ(tA.id, '题A', 100);
  const qA2 = await mkQ(tA.id, '题A2', 40);
  const qP = await mkQ(tP.id, '题P', 100);
  const qB = await mkQ(tB.id, '题B', 100);
  const qS = await mkQ(tA.id, '题S', 100);
  const qProjA = await mkQ(tA.id, '实训题A', 100, 'project');
  const qProjP = await mkQ(tP.id, '实训题P', 100, 'project');

  const mkAsg = (teacherId, suffix, classIds, questionIds) => prisma.assignment.create({
    data: {
      teacherId, title: PREFIX + suffix, mode: 'exam',
      startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01'),
      assignmentClasses: { create: classIds.map(classId => ({ classId })) },
      assignmentQuestions: { create: questionIds.map((questionId, i) => ({ questionId, sortOrder: i + 1 })) },
    },
  });
  const mkSub = (assignmentId, studentId, questionId, data) => prisma.submission.create({
    data: {
      assignmentId, studentId, questionId, subQuestionId: data.subQuestionId ?? null, answer: data.answer ?? ANS_SECRET,
      status: data.status, aiScore: data.aiScore ?? null, aiFeedback: data.aiFeedback ?? null,
      finalScore: data.finalScore ?? null, teacherFeedback: data.teacherFeedback ?? null,
      submittedAt: new Date('2026-06-01T01:00:00Z'),
    },
  });

  // A 的可见班级 clsA：asgA（qA 已发布 80 分 / qA2 未提交）、asgStu（published + finalScore=null + aiScore=55）
  const asgA = await mkAsg(tA.id, '作业A', [clsA.id], [qA.id, qA2.id]);
  const subA1 = await mkSub(asgA.id, stuA1.id, qA.id, { subQuestionId: qA.subQuestions[0].id, status: 'published', finalScore: 80, aiScore: 70, aiFeedback: AIFB_SECRET });
  const subA2 = await mkSub(asgA.id, stuA2.id, qA.id, { subQuestionId: qA.subQuestions[0].id, status: 'ai_graded', aiScore: 30, aiFeedback: AIFB_SECRET });
  const asgStu = await mkAsg(tA.id, '作业Stu', [clsA.id], [qS.id]);
  const subStu = await mkSub(asgStu.id, stuA1.id, qS.id, { subQuestionId: qS.subQuestions[0].id, status: 'published', finalScore: null, aiScore: 55, aiFeedback: AIFB_SECRET });

  // P 的可见班级 clsP（A 不可见）：代码题 + 实训题
  const asgP = await mkAsg(tP.id, '作业P', [clsP.id], [qP.id]);
  const subP1 = await mkSub(asgP.id, stuP1.id, qP.id, { subQuestionId: qP.subQuestions[0].id, status: 'ai_graded', aiScore: 41, aiFeedback: AIFB_SECRET });
  const asgProjP = await mkAsg(tP.id, '实训作业P', [clsP.id], [qProjP.id]);
  const subProjP = await mkSub(asgProjP.id, stuP1.id, qProjP.id, {
    subQuestionId: qProjP.subQuestions[0].id,
    status: 'ai_graded', aiScore: 0,
    answer: JSON.stringify({ kind: 'project', currentVersion: 0, history: [] }),
  });

  // B 的可见班级 clsB（跨校，A 不可见）
  const asgB = await mkAsg(tB.id, '作业B', [clsB.id], [qB.id]);
  const subB1 = await mkSub(asgB.id, stuB1.id, qB.id, { subQuestionId: qB.subQuestions[0].id, status: 'ai_graded', aiScore: 88, aiFeedback: AIFB_SECRET });

  Object.assign(id, {
    s1: s1.id, s2: s2.id, clsA: clsA.id, clsP: clsP.id, clsB: clsB.id,
    tA: tA.id, tP: tP.id, tB: tB.id,
    stuA1: stuA1.id, stuA2: stuA2.id, stuP1: stuP1.id, stuB1: stuB1.id,
    uA1: PREFIX + 'stu_a1@' + CODE1, uA2: PREFIX + 'stu_a2@' + CODE1, uP1: PREFIX + 'stu_p1@' + CODE1, uB1: PREFIX + 'stu_b1@' + CODE2,
    qA: qA.id, qA2: qA2.id, qP: qP.id, qB: qB.id, qS: qS.id, qProjA: qProjA.id, qProjP: qProjP.id,
    asgA: asgA.id, asgStu: asgStu.id, asgP: asgP.id, asgProjP: asgProjP.id, asgB: asgB.id,
    subA1: subA1.id, subA2: subA2.id, subStu: subStu.id, subP1: subP1.id, subProjP: subProjP.id, subB1: subB1.id,
  });
}

describe('t7 独立复核 · t6 classId/questionId 越权收敛与导出面', () => {
  beforeAll(async () => {
    await purge();
    await seed();
    tokenA = await login(PREFIX + 'teacher_a');
    tokenP = await login(PREFIX + 'teacher_p');
    tokenStu = await login(PREFIX + 'stu_a1@' + CODE1);
    // 夹具双向健康检查：P 能看到自己的导出/花名册/实训提示词（排除「全员 403」假绿）
    const ex = await get(tokenP, '/api/teacher/export-review?classId=' + id.clsP + '&assignmentId=' + id.asgP);
    expect(ex.status).toBe(200);
    const rc = await get(tokenP, '/api/teacher/review-class/' + id.clsP + '?assignmentId=' + id.asgP);
    expect(rc.status).toBe(200);
    const pr = await get(tokenP, '/api/teacher/submissions/' + id.subProjP + '/project/prompt');
    expect(pr.status).toBe(200);
  }, 60000);

  afterAll(async () => { await purge(); }, 60000);

  // ================= T1. export-review =================

  it('T1a: 导出审核数据——同校不可见 / 跨校 classId → 403 且不含姓名/学号/答案/分数', async () => {
    const hidden = await get(tokenA, '/api/teacher/export-review?classId=' + id.clsP + '&assignmentId=' + id.asgP);
    expectRejected(hidden, { secrets: [ANS_SECRET, REF_SECRET, '复核生P1'], labels: [id.uP1], keys: ['rows', 'headerCells'] });
    const cross = await get(tokenA, '/api/teacher/export-review?classId=' + id.clsB + '&assignmentId=' + id.asgB);
    expectRejected(cross, { secrets: ['复核生B1'], labels: [id.uB1], keys: ['rows', 'headerCells'] });
  });

  it('T1b: 导出审核数据——schoolId 收窄把可见班级也挡在外面（schoolId=他校 + 自己的 classId）→ 403', async () => {
    const res = await get(tokenA, '/api/teacher/export-review?classId=' + id.clsA + '&assignmentId=' + id.asgA + '&schoolId=' + id.s2);
    expectRejected(res, { keys: ['rows'] });
  });

  it('T1c: 导出审核数据——assignmentId 非法 → 400（不是 500，也不是放行）', async () => {
    const res = await get(tokenA, '/api/teacher/export-review?classId=' + id.clsA + '&assignmentId=abc');
    expectRejected(res, { status: 400, code: 1001, keys: ['rows'] });
  });

  it('T1d: 导出审核数据——可见班级正常导出且内容与 DB 精确一致', async () => {
    const res = await get(tokenA, '/api/teacher/export-review?classId=' + id.clsA + '&assignmentId=' + id.asgA);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    const rows = res.body.data.rows;
    expect(rows.map(r => r.studentNo)).toEqual([id.uA1, id.uA2]);      // 按 username 升序，恰为本班 2 人
    const byNo = new Map(rows.map(r => [r.studentNo, r]));
    expect(byNo.get(id.uA1).totalScore).toBe(80);                       // published finalScore=80（qA2 未提交不计）
    expect(byNo.get(id.uA2).totalScore).toBe(30);                       // ai_graded aiScore=30
    expect(byNo.get(id.uA1).cellScores[0].score).toBe(80);
    expect(byNo.get(id.uA2).cellScores[0].score).toBe(30);
    expect(JSON.stringify(res.body)).not.toContain(id.uP1);             // 不可见班级学生绝不出现
    expect(JSON.stringify(res.body)).not.toContain(id.uB1);
  });

  // ================= T2. review-class =================

  it('T2: 花名册——同校不可见 / 跨校 → 403 零内容；可见班正常且分数正确', async () => {
    const hidden = await get(tokenA, '/api/teacher/review-class/' + id.clsP + '?assignmentId=' + id.asgP);
    expectRejected(hidden, { secrets: ['复核生P1'], labels: [id.uP1], keys: ['list', 'total'] });
    const cross = await get(tokenA, '/api/teacher/review-class/' + id.clsB + '?assignmentId=' + id.asgB);
    expectRejected(cross, { labels: [id.uB1], keys: ['list'] });
    const narrowed = await get(tokenA, '/api/teacher/review-class/' + id.clsA + '?assignmentId=' + id.asgA + '&schoolId=' + id.s2);
    expectRejected(narrowed, { keys: ['list'] });

    const own = await get(tokenA, '/api/teacher/review-class/' + id.clsA + '?assignmentId=' + id.asgA);
    expect(own.status).toBe(200);
    expect(own.body.code).toBe(0);
    const rows = own.body.data.list;
    expect(rows.map(r => r.studentNo)).toEqual([id.uA1, id.uA2]);
    const byNo = new Map(rows.map(r => [r.studentNo, r]));
    expect(byNo.get(id.uA1)).toMatchObject({ status: 'published', finalScore: 80, submitted: true });
    expect(byNo.get(id.uA2)).toMatchObject({ status: 'ai_graded', finalScore: null, submitted: true });
  });

  // ================= T3. review-questions =================

  it('T3: 可审题目——不传 classId 时必须 == 可见范围手算集合（不得全局）', async () => {
    // 手算：A 的可见班级只有 clsA；clsA 两名学生的非 draft 提交涉及 qA(asgA) 与 qS(asgStu)
    const res = await get(tokenA, '/api/teacher/review-questions');
    expect(res.status).toBe(200);
    const got = res.body.data.map(q => q.id).sort((a, b) => a - b);
    expect(got).toEqual([id.qA, id.qS].sort((a, b) => a - b));
    // 不可见/跨校题目一律不出现
    for (const other of [id.qP, id.qB, id.qA2]) expect(got).not.toContain(other);
    // 独立复算（数据库侧）交叉验证
    const visibleStudentIds = (await prisma.studentClass.findMany({ where: { classId: id.clsA }, select: { studentId: true } })).map(r => r.studentId);
    const recomputed = (await prisma.submission.findMany({
      where: { studentId: { in: visibleStudentIds }, status: { not: 'draft' } },
      select: { questionId: true }, distinct: ['questionId'],
    })).map(r => r.questionId).sort((a, b) => a - b);
    expect(got).toEqual(recomputed);
  });

  it('T3b: 可审题目——不可见 classId → 403；可见 classId → 该班题目集合', async () => {
    const hidden = await get(tokenA, '/api/teacher/review-questions?classId=' + id.clsP);
    expectRejected(hidden);
    expect(hidden.body.data).toBeNull();
    const cross = await get(tokenA, '/api/teacher/review-questions?classId=' + id.clsB);
    expectRejected(cross);
    const visible = await get(tokenA, '/api/teacher/review-questions?classId=' + id.clsA);
    expect(visible.status).toBe(200);
    expect(visible.body.data.map(q => q.id).sort((a, b) => a - b)).toEqual([id.qA, id.qS].sort((a, b) => a - b));
  });

  // ================= T4. 提示词预览 =================

  it('T4a: /questions/:id/prompt-preview——他人题目 403 零内容；自己题目 200 且含参考答案', async () => {
    const other = await get(tokenA, '/api/teacher/questions/' + id.qP + '/prompt-preview');
    expectRejected(other, { secrets: [REF_SECRET], labels: [PREFIX + '题P'], keys: ['subs', 'type'] });
    const mine = await get(tokenA, '/api/teacher/questions/' + id.qA + '/prompt-preview');
    expect(mine.status).toBe(200);
    expect(mine.body.code).toBe(0);
    expect(JSON.stringify(mine.body)).toContain(REF_SECRET);   // 正例：自己的参考答案确实会下发 → 上面的 403 非空转
  });

  it('T4b: /questions/:id/project-prompt-preview——他人实训题 403；自己的 200', async () => {
    const other = await get(tokenA, '/api/teacher/questions/' + id.qProjP + '/project-prompt-preview');
    expectRejected(other, { secrets: [REF_SECRET, '复核生'], keys: ['user', 'system', 'mode'] });
    const mine = await get(tokenA, '/api/teacher/questions/' + id.qProjA + '/project-prompt-preview');
    expect(mine.status).toBe(200);
    expect(mine.body.data.mode).toBe('open');
  });

  it('T4c: /submissions/:id/project/prompt——他人实训提交 403 零内容；本人 200', async () => {
    const other = await get(tokenA, '/api/teacher/submissions/' + id.subProjP + '/project/prompt');
    expectRejected(other, { keys: ['user', 'system', 'mode'] });
    const own = await get(tokenP, '/api/teacher/submissions/' + id.subProjP + '/project/prompt');
    expect(own.status).toBe(200);
    expect(own.body.data.mode).toBe('open');
    expect(own.body.data.user).toContain('【学生尚未提交有效版本】');
  });

  it('T4d: 回归——/submissions/:id/prompt 仍按归属校验（他人 403；本人 200）', async () => {
    const other = await get(tokenA, '/api/teacher/submissions/' + id.subP1 + '/prompt');
    expectRejected(other, { secrets: [ANS_SECRET, REF_SECRET], keys: ['user', 'system'] });
    const own = await get(tokenP, '/api/teacher/submissions/' + id.subP1 + '/prompt');
    expect(own.status).toBe(200);
  });

  // ================= T5. 学生详情口径 =================

  it('T5: published 且 finalScore=null（aiScore=55）→ 详情 == 列表 == 成绩页，且无 aiScore/aiFeedback 字段名', async () => {
    const list = await get(tokenStu, '/api/student/assignments?pageSize=100');
    const item = list.body.data.list.find(a => a.id === id.asgStu);
    expect(item.finalScore).toBe(55);
    const scores = await get(tokenStu, '/api/student/scores');
    const sc = scores.body.data.find(s => s.assignmentId === id.asgStu);
    expect(sc.totalScore).toBe(55);

    const detail = await get(tokenStu, '/api/student/assignments/' + id.asgStu);
    const row = detail.body.data.submissions.find(s => s.id === id.subStu);
    expect(row).toBeDefined();
    expect(row.finalScore).toBe(55);                       // t6 修复点：详情不再为 null
    const keys = collectKeys(detail.body);
    expect(keys.has('aiScore')).toBe(false);
    expect(keys.has('aiFeedback')).toBe(false);
    const text = JSON.stringify(detail.body);
    expect(text.includes(AIFB_SECRET)).toBe(false);
    expect(text.includes('aiScore')).toBe(false);
  });
});
