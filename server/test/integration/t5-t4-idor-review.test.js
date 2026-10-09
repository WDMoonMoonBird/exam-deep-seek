/**
 * t5 独立复核（qa-api-review）：t4 越权收敛与批量原子性
 *
 * 本文件由复核者独立编写，夹具与期望值全部自建（qa2_ 前缀，独立学校 29981/29982），
 * 不引用 t4 测试的任何断言：
 *   S1. R17 反例：教师 A 对「同校不可见班 / 跨校班」的提交做 详情 / 提示词 / 改分 / 审核 / 重评 / 发布
 *       → 全部拒绝，且拒绝响应体字段级不含题目/答案/评分/学生内容；DB 断言零写入；
 *   S2. R17 批量原子性：可见 + 不可见 id 混批 → 整批拒绝、回执列出被拒 id、可见那条 DB 未变化；
 *   S3. R17 回归：A 对自己可见提交的 详情 / 改分 / 审核 / 发布（单条 + 批次）正常生效；
 *   S4. R16 反例：review-summary 传同校不可见 classId → 空集；可见 classId → 返回该班行；
 *   S5. R14 一致性：published 且 finalScore=null / aiScore=55 → 学生列表 == /student/scores；
 *       （t6 修复：学生详情同步跟随 R14，详情 finalScore 亦为 55）
 *   S6. R10 口径：作业挂可见+不可见班 → pendingReviewCount == 可见范围复核值（Σ review-summary 行）；
 *       expectedCount 仍为全部关联班级去重数；
 *   S7. R5 边界：?schoolId=abc / 0 / 1.5 → review-summary 空集、pending-summary 全 0（一致 fail-closed）；
 *   S8/S9. t6 修复：review-class/:classId、export-review、review-questions 三个 classId 型入口
 *       已收敛到教师可见范围（不可见/跨校 → 403/1003 零内容；review-questions 不再全局返回）。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 'qa2_';
const CODE1 = '29981';
const CODE2 = '29982';
const ANS_SECRET = PREFIX + '学生答案-绝密';
const REF_SECRET = PREFIX + '参考答案-绝密';
const AIFB_SECRET = PREFIX + 'AI评语-绝密';
const TFB_SECRET = PREFIX + '教师批语';

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
const req = (token, method, url, body) => {
  let r = request()[method](url).set('Authorization', 'Bearer ' + token);
  if (body !== undefined) r = r.send(body);
  return r;
};
const GET = (t, u) => req(t, 'get', u);
const PUT = (t, u, b) => req(t, 'put', u, b);
const POST = (t, u, b) => req(t, 'post', u, b);

function collectKeys(value, out = new Set()) {
  if (Array.isArray(value)) { for (const v of value) collectKeys(v, out); return out; }
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.add(k); collectKeys(v, out); }
  return out;
}
/** 拒绝响应必须是「无内容」的：字段级 + 文本级双重断言 */
function expectNoContent(res, label) {
  const keys = collectKeys(res.body);
  for (const k of ['referenceAnswer', 'scoringCriteria', 'objectiveItems', 'subQuestions', 'allSubmissions', 'answer', 'question', 'student', 'aiScore', 'aiFeedback', 'finalScore', 'teacherFeedback', 'submittedAt', 'score']) {
    expect({ label, key: k, present: keys.has(k) }).toEqual({ label, key: k, present: false });
  }
  const text = JSON.stringify(res.body);
  for (const secret of [ANS_SECRET, REF_SECRET, AIFB_SECRET, TFB_SECRET]) {
    expect({ label, leak: text.includes(secret) }).toEqual({ label, leak: false });
  }
  expect(res.body.data).toBeNull();
}
async function snapshot(subId) {
  return prisma.submission.findUnique({
    where: { id: subId },
    select: { status: true, finalScore: true, teacherFeedback: true, aiScore: true, aiFeedback: true, reviewedAt: true },
  });
}

let tokenA, tokenP, tokenB, tokenStu;

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

  // 题目：参考答案即内容泄露探针
  const mkQ = (teacherId, suffix, maxScore) => prisma.question.create({
    data: {
      teacherId, title: PREFIX + suffix, maxScore, difficulty: 'easy',
      subQuestions: { create: [{ sortOrder: 1, title: PREFIX + suffix + '-s1', content: '<p>x</p>', referenceAnswer: REF_SECRET, language: 'python', score: maxScore }] },
    },
  });
  const qA = await mkQ(tA.id, '题A', 100);
  const qA2 = await mkQ(tA.id, '题A2', 40);
  const qP = await mkQ(tP.id, '题P', 100);
  const qP2 = await mkQ(tP.id, '题P2', 40);
  const qB = await mkQ(tB.id, '题B', 100);
  const qS = await mkQ(tA.id, '题S', 100);

  const mkAsg = (teacherId, suffix, classIds, questionIds, mode = 'exam') => prisma.assignment.create({
    data: {
      teacherId, title: PREFIX + suffix, mode,
      startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01'),
      assignmentClasses: { create: classIds.map(classId => ({ classId })) },
      assignmentQuestions: { create: questionIds.map((questionId, i) => ({ questionId, sortOrder: i + 1 })) },
    },
  });
  const mkSub = (assignmentId, studentId, questionId, data) => prisma.submission.create({
    data: {
      assignmentId, studentId, questionId, answer: data.answer ?? ANS_SECRET,
      status: data.status, aiScore: data.aiScore ?? null, aiFeedback: data.aiFeedback ?? null,
      finalScore: data.finalScore ?? null, teacherFeedback: data.teacherFeedback ?? null,
      submittedAt: data.submittedAt ?? new Date('2026-05-01T01:00:00Z'),
    },
  });

  // A 自己的作业（可见）：subA1 走 详情→改分→审核→发布 回归；subA2 走混批原子性
  const asgA = await mkAsg(tA.id, '作业A', [clsA.id], [qA.id, qA2.id]);
  const subA1 = await mkSub(asgA.id, stuA1.id, qA.id, { status: 'ai_graded', aiScore: 60, aiFeedback: AIFB_SECRET });
  const subA2 = await mkSub(asgA.id, stuA2.id, qA.id, { status: 'reviewed', finalScore: 50, teacherFeedback: TFB_SECRET });

  // R10：同时挂可见班 clsA 与不可见班 clsP，两侧各有 1 条待审核
  const asgMix = await mkAsg(tA.id, '作业Mix', [clsA.id, clsP.id], [qA.id]);
  const subMixA = await mkSub(asgMix.id, stuA1.id, qA.id, { status: 'ai_graded', aiScore: 33, aiFeedback: AIFB_SECRET });
  const subMixP = await mkSub(asgMix.id, stuP1.id, qA.id, { status: 'ai_graded', aiScore: 33, aiFeedback: AIFB_SECRET });

  // 批量端点回归专用
  const asgBatch = await mkAsg(tA.id, '作业Batch', [clsA.id], [qA.id]);
  const subBatch = await mkSub(asgBatch.id, stuA2.id, qA.id, { status: 'ai_graded', aiScore: 70, aiFeedback: AIFB_SECRET });

  // R14：学生侧 published 但未定案分
  const asgStu = await mkAsg(tA.id, '作业Stu', [clsA.id], [qS.id]);
  const subStu = await mkSub(asgStu.id, stuA1.id, qS.id, { status: 'published', finalScore: null, aiScore: 55, aiFeedback: AIFB_SECRET, teacherFeedback: null });

  // 不可见目标（同校 clsP / 跨校 clsB）
  const asgP = await mkAsg(tP.id, '作业P', [clsP.id], [qP.id, qP2.id]);
  const subP1 = await mkSub(asgP.id, stuP1.id, qP.id, { status: 'ai_graded', aiScore: 41, aiFeedback: AIFB_SECRET });
  const subP2 = await mkSub(asgP.id, stuP1.id, qP2.id, { status: 'reviewed', finalScore: 60, teacherFeedback: TFB_SECRET });

  const asgB = await mkAsg(tB.id, '作业B', [clsB.id], [qB.id]);
  const subB1 = await mkSub(asgB.id, stuB1.id, qB.id, { status: 'reviewed', finalScore: 90, teacherFeedback: TFB_SECRET });

  Object.assign(id, {
    s1: s1.id, s2: s2.id, clsA: clsA.id, clsP: clsP.id, clsB: clsB.id,
    tA: tA.id, tP: tP.id, tB: tB.id,
    stuA1: stuA1.id, stuA2: stuA2.id, stuP1: stuP1.id, stuB1: stuB1.id,
    qA: qA.id, qP: qP.id, qB: qB.id,
    asgA: asgA.id, asgMix: asgMix.id, asgBatch: asgBatch.id, asgStu: asgStu.id, asgP: asgP.id, asgB: asgB.id,
    subA1: subA1.id, subA2: subA2.id, subMixA: subMixA.id, subMixP: subMixP.id,
    subBatch: subBatch.id, subStu: subStu.id, subP1: subP1.id, subP2: subP2.id, subB1: subB1.id,
  });
}

describe('t5 独立复核 · t4 越权收敛与批量原子性', () => {
  beforeAll(async () => {
    await purge();
    await seed();
    tokenA = await login(PREFIX + 'teacher_a');
    tokenP = await login(PREFIX + 'teacher_p');
    tokenB = await login(PREFIX + 'teacher_b');
    tokenStu = await login(PREFIX + 'stu_a1@' + CODE1);
    // 前置健康检查：不可见教师自己能看到自己的提交（证明夹具有效，非「全员 403」的假绿）
    const own = await GET(tokenP, '/api/teacher/submissions/' + id.subP1);
    expect(own.status).toBe(200);
    expect(own.body.data.id).toBe(id.subP1);
  }, 60000);

  afterAll(async () => { await purge(); }, 60000);

  // ================= S1. 越权反例（同校不可见班 + 跨校班） =================

  it('S1a: 详情——同校不可见班 / 跨校班 提交 → 403 且零内容泄露', async () => {
    for (const [label, subId] of [['同校不可见班', id.subP1], ['跨校班', id.subB1]]) {
      const before = await snapshot(subId);
      const res = await GET(tokenA, '/api/teacher/submissions/' + subId);
      expect({ label, status: res.status }).toEqual({ label, status: 403 });
      expect(res.body.code).toBe(1003);
      expectNoContent(res, label);
      expect(await snapshot(subId)).toEqual(before);       // 读不产生写入（对称断言）
    }
  });

  it('S1b: 提示词——含学生答案/参考答案的入口同样 403 且零内容', async () => {
    const before = await snapshot(id.subP1);
    const res = await GET(tokenA, '/api/teacher/submissions/' + id.subP1 + '/prompt');
    expect(res.status).toBe(403);
    expectNoContent(res, 'prompt');
    expect(await snapshot(id.subP1)).toEqual(before);
  });

  it('S1c: 改分/审核/重评——拒绝且 DB 零写入（finalScore/status/评语/aiScore 全不变）', async () => {
    const before = await snapshot(id.subP1);
    const r1 = await PUT(tokenA, '/api/teacher/submissions/' + id.subP1 + '/score', { finalScore: 999 });
    expect(r1.status).toBe(403);
    expectNoContent(r1, 'updateScore');

    const r2 = await PUT(tokenA, '/api/teacher/submissions/' + id.subP1 + '/review', { finalScore: 888, teacherFeedback: TFB_SECRET });
    expect(r2.status).toBe(403);
    expectNoContent(r2, 'review');

    const r3 = await POST(tokenA, '/api/teacher/submissions/' + id.subP1 + '/regrade', {});
    expect(r3.status).toBe(403);
    expectNoContent(r3, 'regrade');

    expect(await snapshot(id.subP1)).toEqual(before);
  });

  it('S1d: 发布——单条不可见 id → 403 且 DB 未发布', async () => {
    const before = await snapshot(id.subP2);
    const res = await PUT(tokenA, '/api/teacher/submissions/publish', { submissionIds: [id.subP2] });
    expect(res.status).toBe(403);
    expect(res.body.data?.rejectedIds).toEqual([id.subP2]);
    expect(await snapshot(id.subP2)).toEqual(before);
    expect(before.status).toBe('reviewed');
  });

  it('S1e: 语义边界——id 非法 → 400、不存在 → 404，且都不含内容（与 403 可区分）', async () => {
    const bad = await GET(tokenA, '/api/teacher/submissions/abc');
    expect(bad.status).toBe(400);
    expectNoContent(bad, 'invalid-id');
    const missing = await GET(tokenA, '/api/teacher/submissions/2147480000');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe(1004);
    expectNoContent(missing, 'missing');
  });

  // ================= S2. 批量原子性 =================

  it('S2a: 发布——可见 + 不可见混批 → 整批拒绝、回执被拒 id、可见那条 DB 完全未变', async () => {
    const beforeVisible = await snapshot(id.subA2);   // 可见且 status=reviewed（若被部分执行会变成 published）
    const beforeHidden = await snapshot(id.subP2);
    expect(beforeVisible.status).toBe('reviewed');
    const res = await PUT(tokenA, '/api/teacher/submissions/publish', { submissionIds: [id.subA2, id.subP2] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
    expect(res.body.data.rejectedIds).toEqual([id.subP2]);   // 只列不可见的
    expect(await snapshot(id.subA2)).toEqual(beforeVisible); // 原子性：可见那条也未生效
    expect(await snapshot(id.subP2)).toEqual(beforeHidden);
  });

  it('S2b: 发布——混入不存在的 id 同样整批拒绝（fail-closed）且可见条未变', async () => {
    const beforeVisible = await snapshot(id.subA2);
    const ghost = 2147480000;
    const res = await PUT(tokenA, '/api/teacher/submissions/publish', { submissionIds: [id.subA2, ghost] });
    expect(res.status).toBe(403);
    expect(res.body.data.rejectedIds).toEqual([ghost]);
    expect(await snapshot(id.subA2)).toEqual(beforeVisible);
    expect(beforeVisible.status).toBe('reviewed');
  });

  it('S2c: 批量审核/发布——不可见班级 → 403 且零写入；非法 schoolId → 400', async () => {
    const beforeP = await snapshot(id.subP1);
    const bad1 = await POST(tokenA, '/api/teacher/submissions/batch-review', { schoolId: id.s1, classId: id.clsP, assignmentId: id.asgP });
    expect(bad1.status).toBe(403);
    expect(await snapshot(id.subP1)).toEqual(beforeP);
    const bad2 = await POST(tokenA, '/api/teacher/submissions/batch-publish', { schoolId: id.s1, classId: id.clsB, assignmentId: id.asgB });
    expect(bad2.status).toBe(403);
    const bad3 = await POST(tokenA, '/api/teacher/submissions/batch-review', { schoolId: 'abc', classId: id.clsA, assignmentId: id.asgBatch });
    expect(bad3.status).toBe(400);
    const bad4 = await POST(tokenA, '/api/teacher/submissions/batch-publish', { classId: id.clsA, assignmentId: id.asgBatch });
    expect(bad4.status).toBe(400);
    expect(await snapshot(id.subBatch)).toMatchObject({ status: 'ai_graded', finalScore: null });
    expect(await snapshot(id.subP2)).toMatchObject({ status: 'reviewed', finalScore: 60 });
  });

  // ================= S3. 回归（教师自己的可见提交正常） =================

  it('S3a: 单条链路 详情 → 改分 → 审核 → 发布 全部正常且 DB 生效', async () => {
    const detail = await GET(tokenA, '/api/teacher/submissions/' + id.subA1);
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(id.subA1);
    expect(collectKeys(detail.body).has('allSubmissions')).toBe(true);   // 可见时确实返回完整内容

    const score = await PUT(tokenA, '/api/teacher/submissions/' + id.subA1 + '/score', { finalScore: 77 });
    expect(score.status).toBe(200);
    expect(await snapshot(id.subA1)).toMatchObject({ finalScore: 77, status: 'reviewed' });

    const review = await PUT(tokenA, '/api/teacher/submissions/' + id.subA1 + '/review', { finalScore: 88, teacherFeedback: TFB_SECRET });
    expect(review.status).toBe(200);
    expect(await snapshot(id.subA1)).toMatchObject({ finalScore: 88, status: 'reviewed', teacherFeedback: TFB_SECRET });

    const publish = await PUT(tokenA, '/api/teacher/submissions/publish', { submissionIds: [id.subA1] });
    expect(publish.status).toBe(200);
    expect((await snapshot(id.subA1)).status).toBe('published');
  });

  it('S3b: 单条发布（全部可见）——S2 中被整批拒绝的可见条单独提交成功', async () => {
    const res = await PUT(tokenA, '/api/teacher/submissions/publish', { submissionIds: [id.subA2] });
    expect(res.status).toBe(200);
    expect((await snapshot(id.subA2)).status).toBe('published');
  });

  it('S3c: 批量审核 → 批量发布（可见班级）正常生效', async () => {
    const br = await POST(tokenA, '/api/teacher/submissions/batch-review', { schoolId: id.s1, classId: id.clsA, assignmentId: id.asgBatch });
    expect(br.status).toBe(200);
    expect(await snapshot(id.subBatch)).toMatchObject({ status: 'reviewed', finalScore: 70 });

    const bp = await POST(tokenA, '/api/teacher/submissions/batch-publish', { schoolId: id.s1, classId: id.clsA, assignmentId: id.asgBatch });
    expect(bp.status).toBe(200);
    expect((await snapshot(id.subBatch)).status).toBe('published');
  });

  // ================= S4. R16 =================

  it('S4: review-summary 的 classId 与可见集合求交（同校不可见 → 空集；可见 → 该班行）', async () => {
    const hidden = await GET(tokenA, '/api/teacher/review-summary?schoolId=' + id.s1 + '&classId=' + id.clsP);
    expect(hidden.body.code).toBe(0);
    expect(hidden.body.data).toEqual([]);
    const otherSchool = await GET(tokenA, '/api/teacher/review-summary?schoolId=' + id.s1 + '&classId=' + id.clsB);
    expect(otherSchool.body.data).toEqual([]);
    const visible = await GET(tokenA, '/api/teacher/review-summary?schoolId=' + id.s1 + '&classId=' + id.clsA);
    expect(visible.body.code).toBe(0);
    expect(visible.body.data.length).toBeGreaterThan(0);
    expect(visible.body.data.every(r => r.classId === id.clsA)).toBe(true);
    const all = await GET(tokenA, '/api/teacher/review-summary?schoolId=' + id.s1);
    expect(all.body.data.every(r => r.classId === id.clsA)).toBe(true);
    expect(all.body.data.some(r => r.classId === id.clsP)).toBe(false);
  });

  // ================= S5. R14 =================

  it('S5: published 且 finalScore=null（aiScore=55）→ 学生列表 == /student/scores（不再 null）', async () => {
    const list = await GET(tokenStu, '/api/student/assignments?pageSize=100');
    const item = list.body.data.list.find(a => a.id === id.asgStu);
    expect(item).toBeDefined();
    const scores = await GET(tokenStu, '/api/student/scores');
    const sc = scores.body.data.find(s => s.assignmentId === id.asgStu);
    expect(sc).toBeDefined();
    expect(item.finalScore).toBe(55);
    expect(sc.totalScore).toBe(55);
    expect(item.finalScore).toBe(sc.totalScore);          // 口径一致（R14 要求）
    // 学生侧白名单红线不受影响
    const text = JSON.stringify(list.body);
    expect(text.includes('aiScore')).toBe(false);
    expect(text.includes('aiFeedback')).toBe(false);
    expect(text.includes(AIFB_SECRET)).toBe(false);

    // t6 已跟随 R14：详情端点与列表/成绩页同口径（published 且 finalScore=null → aiScore=55）
    const detail = await GET(tokenStu, '/api/student/assignments/' + id.asgStu);
    const row = detail.body.data.submissions.find(s => s.id === id.subStu);
    expect(row.finalScore).toBe(55);
    expect(collectKeys(detail.body).has('aiScore')).toBe(false);
  });

  // ================= S6. R10 =================

  it('S6: 作业挂可见+不可见班 → pendingReviewCount 只算可见班；expectedCount 仍为全部关联班', async () => {
    const list = await GET(tokenA, '/api/teacher/assignments?pageSize=100');
    const mixed = list.body.data.list.find(a => a.id === id.asgMix);
    expect(mixed).toBeDefined();
    // 可见班 clsA 有 1 条 ai_graded（stuA1）；不可见班 clsP 的同类行不得计入
    const rows = (await GET(tokenA, '/api/teacher/review-summary?schoolId=' + id.s1)).body.data;
    const visibleRecompute = rows.filter(r => r.assignmentId === id.asgMix).reduce((s, r) => s + r.reviewPending, 0);
    expect(visibleRecompute).toBe(1);
    expect(mixed.pendingReviewCount).toBe(visibleRecompute);
    expect(mixed.pendingReviewCount).toBe(1);              // 旧行为（含不可见班）会得到 2
    // expectedCount = clsA(2 人) ∪ clsP(1 人) = 3
    expect(mixed.expectedCount).toBe(3);
    // 明细之和 == 侧栏徽标（同一可见口径）
    const sum = list.body.data.list.reduce((s, a) => s + a.pendingReviewCount, 0);
    const ps = (await GET(tokenA, '/api/teacher/pending-summary')).body.data;
    expect(sum).toBe(ps.pendingReview);
    const psS1 = (await GET(tokenA, '/api/teacher/pending-summary?schoolId=' + id.s1)).body.data;
    expect(psS1.pendingReview).toBe(rows.reduce((s, r) => s + r.reviewPending, 0));
  });

  // ================= S7. R5 =================

  it('S7: 非法 schoolId（abc / 0 / 1.5）两入口一致 fail-closed', async () => {
    for (const bad of ['abc', '0', '1.5', '-1']) {
      const rs = await GET(tokenA, '/api/teacher/review-summary?schoolId=' + bad);
      expect({ bad, code: rs.status }).toEqual({ bad, code: 200 });
      expect({ bad, data: rs.body.data }).toEqual({ bad, data: [] });
      const ps = await GET(tokenA, '/api/teacher/pending-summary?schoolId=' + bad);
      expect(ps.body.data).toMatchObject({ pendingReview: 0, aiPending: 0, abnormal: 0 });
    }
    // 对照：合法 schoolId 非零（证明上面的全 0 不是「本来就没有数据」）
    const ok = await GET(tokenA, '/api/teacher/pending-summary?schoolId=' + id.s1);
    expect(ok.body.data.pendingReview).toBeGreaterThan(0);
  });

  // ================= S8. 残留观察（记录事实，非 t5 验收项） =================

  it('S9（t6 修复）: 三个 classId 型读入口已收敛——不全局返回 / 不可见 classId 403 / 导出 403 零内容', async () => {
    // 1) 可审题目：不带 classId 时只返回可见范围内的题目（跨校教师 B 的题目不得出现）
    const q1 = await GET(tokenA, '/api/teacher/review-questions');
    expect(q1.status).toBe(200);
    expect(q1.body.code).toBe(0);
    expect(q1.body.data.some(q => q.title === PREFIX + '题B')).toBe(false);
    // 2) 可审题目：传不可见班 classId → 403 fail-closed（t6 选定语义：403，非空集）
    const q2 = await GET(tokenA, '/api/teacher/review-questions?classId=' + id.clsP);
    expect(q2.status).toBe(403);
    expect(q2.body.code).toBe(1003);
    expect(q2.body.data).toBeNull();
    // 3) 导出审核数据：不可见班 → 403，响应体不含任何姓名/学号/答案/分数
    const ex = await GET(tokenA, '/api/teacher/export-review?classId=' + id.clsP + '&assignmentId=' + id.asgP);
    expect(ex.status).toBe(403);
    expect(ex.body.code).toBe(1003);
    expect(ex.body.data).toBeNull();
    expect(JSON.stringify(ex.body)).not.toContain(PREFIX + 'stu_p1');
    expect(JSON.stringify(ex.body)).not.toContain(ANS_SECRET);
  });

  it('S8（t6 修复）: review-class 已收敛——不可见班级 403 零内容；可见班级正常返回', async () => {
    const res = await GET(tokenA, '/api/teacher/review-class/' + id.clsP + '?assignmentId=' + id.asgP);
    // t6：不可见班 clsP 一律 403，响应体不含任何姓名/学号/分数
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
    expect(res.body.data).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain(PREFIX + 'stu_p1');
    expect(collectKeys(res.body).has('list')).toBe(false);

    // 对照（回归）：A 自己的班级仍正常返回花名册
    const own = await GET(tokenA, '/api/teacher/review-class/' + id.clsA + '?assignmentId=' + id.asgA);
    expect(own.status).toBe(200);
    expect(own.body.code).toBe(0);
    expect(own.body.data.list.length).toBeGreaterThan(0);
    expect(own.body.data.list.some(r => r.studentNo)).toBe(true);
  });
});
