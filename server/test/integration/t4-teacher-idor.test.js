/**
 * t4 · 教师端提交详情/改分/审核/发布 越权收敛（IDOR）与口径修复测试
 *
 * 覆盖 t4 验收面：
 *   R17（Critical）详情端点：教师 A 读教师 B 班级提交 → 被拒且响应体不含任何题目/答案内容；本人可见提交正常返回
 *   R17 写端点：改分/审核/重评/提示词/实训题 跨教师 → 403 且 DB 的 finalScore/status 未变化
 *   R17 发布：submissionIds 混入不可见 id → 整批拒绝（列出被拒 id）且可见那条也未生效（原子性，DB 断言）
 *   R17 批量：batch-review / batch-publish 传不可见班级 → 403 且不产生任何写入；可见班级正常生效
 *   R16：review-summary 的 classId 与可见集合求交，同校不可见 classId → 空集
 *   R14：学生列表 finalScore 与 /student/scores 口径一致（published + finalScore=null → aiScore）
 *   R10：作业列表 pendingReviewCount 按教师可见班级统计；expectedCount 仍为全部关联班级去重
 *   R5：非法 schoolId（?schoolId=abc）两入口一致 fail-closed
 *
 * 夹具自建自清（t4_ 前缀，独立学校 29921/29922），不依赖 setup seed。
 * 说明：文件内先声明只读口径用例、后声明写入用例；写入用例各自使用专用提交行，互不干扰。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 't4_';
const CODE_A = '29921'; // 学校 A（教师 A 的可见域）
const CODE_B = '29922'; // 学校 B（跨校不可见）
const SECRET_ANSWER_B = PREFIX + 'ANSWER_B_绝密';
const SECRET_REF_B = PREFIX + 'REF_B_绝密';
const SECRET_AI_B = PREFIX + 'AI_B_绝密';

let schoolA, schoolB, classA, classHidden, classB;
let tA, tB, tC;
let sa, sb, sc;
let qa, qb, qc, qaProj;
let asgA, asgB, asgCh, asgMixed, asgAProj, asgBatchReview, asgBatchPublish, asgStudent;
let tokenA, tokenSa;
const sub = {};   // 关键提交 id
let projSubId;

/** 按前缀幂等清理本套件夹具（含上次崩溃残留） */
async function purge() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const userIds = users.map(u => u.id);
  const schools = await prisma.school.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const schoolIds = schools.map(s => s.id);
  const classes = await prisma.class.findMany({
    where: { OR: [{ name: { startsWith: PREFIX } }, { schoolId: { in: schoolIds } }] },
    select: { id: true },
  });
  const classIds = classes.map(c => c.id);
  const teams = await prisma.team.findMany({
    where: { OR: [{ name: { startsWith: PREFIX } }, { schoolId: { in: schoolIds } }, { createdBy: { in: userIds } }] },
    select: { id: true },
  });
  const teamIds = teams.map(t => t.id);
  const questions = await prisma.question.findMany({
    where: { OR: [{ title: { startsWith: PREFIX } }, { teacherId: { in: userIds } }] },
    select: { id: true },
  });
  const questionIds = questions.map(q => q.id);
  const assignments = await prisma.assignment.findMany({
    where: { OR: [{ title: { startsWith: PREFIX } }, { teacherId: { in: userIds } }] },
    select: { id: true },
  });
  const assignmentIds = assignments.map(a => a.id);

  await prisma.submission.deleteMany({
    where: { OR: [{ studentId: { in: userIds } }, { assignmentId: { in: assignmentIds } }, { questionId: { in: questionIds } }] },
  });
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

async function seed() {
  await purge();

  schoolA = await prisma.school.create({ data: { name: PREFIX + 'school_a', officialCode: CODE_A } });
  schoolB = await prisma.school.create({ data: { name: PREFIX + 'school_b', officialCode: CODE_B } });
  classA = await prisma.class.create({ data: { name: PREFIX + 'class_a', schoolId: schoolA.id } });
  classHidden = await prisma.class.create({ data: { name: PREFIX + 'class_a_hidden', schoolId: schoolA.id } }); // 同校不可见
  classB = await prisma.class.create({ data: { name: PREFIX + 'class_b', schoolId: schoolB.id } });

  tA = await mkUser(PREFIX + 'teacher_a', 't4教师A', 'teacher');   // S1 + 仅 class_a
  tB = await mkUser(PREFIX + 'teacher_b', 't4教师B', 'teacher');   // S2 + class_b
  tC = await mkUser(PREFIX + 'teacher_c', 't4教师C', 'teacher');   // S1 + class_a_hidden（同校隐藏）
  await prisma.teacherSchool.createMany({ data: [
    { teacherId: tA.id, schoolId: schoolA.id },
    { teacherId: tB.id, schoolId: schoolB.id },
    { teacherId: tC.id, schoolId: schoolA.id },
  ] });
  await prisma.teacherClass.createMany({ data: [
    { teacherId: tA.id, classId: classA.id },
    { teacherId: tB.id, classId: classB.id },
    { teacherId: tC.id, classId: classHidden.id },
  ] });

  sa = await mkUser(PREFIX + 'stu_a', 't4生A', 'student');
  sb = await mkUser(PREFIX + 'stu_b', 't4生B', 'student');
  sc = await mkUser(PREFIX + 'stu_c', 't4生C', 'student');
  await prisma.studentClass.createMany({ data: [
    { studentId: sa.id, classId: classA.id },
    { studentId: sb.id, classId: classB.id },
    { studentId: sc.id, classId: classHidden.id },
  ] });

  const mkQ = (teacherId, title, opts = {}) => prisma.question.create({
    data: {
      teacherId, title, maxScore: 100, difficulty: 'easy', type: opts.type || 'code',
      material: opts.material ?? '', scoringRubric: opts.scoringRubric ?? null,
      subQuestions: opts.type === 'project' ? undefined : {
        create: [
          { sortOrder: 1, title: title + '-小1', content: '<p>1</p>', referenceAnswer: opts.ref || (PREFIX + 'REF_A'), language: 'python', score: 50, scoringCriteria: PREFIX + 'CRIT' },
          { sortOrder: 2, title: title + '-小2', content: '<p>2</p>', referenceAnswer: opts.ref || (PREFIX + 'REF_A'), language: 'python', score: 50, scoringCriteria: PREFIX + 'CRIT' },
        ],
      },
    },
    include: { subQuestions: { orderBy: { sortOrder: 'asc' } } },
  });
  qa = await mkQ(tA.id, PREFIX + '题A');
  qb = await mkQ(tB.id, PREFIX + '题B', { ref: SECRET_REF_B });
  qc = await mkQ(tC.id, PREFIX + '题C');
  qaProj = await mkQ(tA.id, PREFIX + '题A-proj', { type: 'project' });

  const mkAsg = (teacherId, title, classIds, questionIds) => prisma.assignment.create({
    data: {
      teacherId, title, mode: 'exam',
      startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01'),
      assignmentClasses: { create: classIds.map(classId => ({ classId })) },
      assignmentQuestions: { create: questionIds.map((questionId, i) => ({ questionId, sortOrder: i + 1 })) },
    },
  });
  asgA = await mkAsg(tA.id, PREFIX + '作业A', [classA.id], [qa.id]);
  asgB = await mkAsg(tB.id, PREFIX + '作业B', [classB.id], [qb.id]);
  asgCh = await mkAsg(tC.id, PREFIX + '作业C隐藏', [classHidden.id], [qc.id]);
  asgMixed = await mkAsg(tA.id, PREFIX + '作业A-可见+隐藏', [classA.id, classHidden.id], [qa.id]);
  asgAProj = await mkAsg(tA.id, PREFIX + '作业A-proj-仅B班', [classB.id], [qaProj.id]);
  asgBatchReview = await mkAsg(tA.id, PREFIX + '作业A-批量审核', [classA.id], [qa.id]);
  asgBatchPublish = await mkAsg(tA.id, PREFIX + '作业A-批量发布', [classA.id], [qa.id]);
  asgStudent = await mkAsg(tA.id, PREFIX + '作业A-学生端口径', [classA.id], [qa.id]);

  const mkSub = (assignmentId, studentId, questionId, subQuestionId, data) => prisma.submission.create({
    data: {
      assignmentId, studentId, questionId, subQuestionId: subQuestionId || null,
      answer: data.answer ?? '', status: data.status, aiScore: data.aiScore ?? null, aiFeedback: data.aiFeedback ?? null,
      finalScore: data.finalScore ?? null, teacherFeedback: data.teacherFeedback ?? null,
      attemptCount: data.attemptCount ?? 1, bestScore: data.bestScore ?? null, submittedAt: data.submittedAt ?? new Date('2026-02-01T10:00:00Z'),
    },
  });
  const [sqa1, sqa2] = qa.subQuestions.map(s => s.id);
  const [sqb1, sqb2] = qb.subQuestions.map(s => s.id);
  const [sqc1] = qc.subQuestions.map(s => s.id);

  // ===== 教师 A 可见（classA / 生 sa）=====
  sub.A_ai = (await mkSub(asgA.id, sa.id, qa.id, sqa1, { status: 'ai_graded', aiScore: 50, aiFeedback: PREFIX + 'AI_A', answer: 'ANSWER_A1' })).id;
  sub.A_ai_pos = (await mkSub(asgA.id, sa.id, qa.id, sqa2, { status: 'ai_graded', aiScore: 50, aiFeedback: PREFIX + 'AI_A2', answer: 'ANSWER_A2' })).id;
  sub.A_rev_pos = (await mkSub(asgA.id, sa.id, qa.id, null, { status: 'reviewed', finalScore: 60, teacherFeedback: 'TF_A' })).id;
  sub.BR_ai = (await mkSub(asgBatchReview.id, sa.id, qa.id, sqa1, { status: 'ai_graded', aiScore: 40, aiFeedback: 'BR_AI' })).id;
  sub.BP_rev = (await mkSub(asgBatchPublish.id, sa.id, qa.id, sqa1, { status: 'reviewed', finalScore: 55, teacherFeedback: 'BP_TF' })).id;
  // 学生端口径（R14）：published + finalScore=null（aiScore 有值）+ published 有值
  await mkSub(asgStudent.id, sa.id, qa.id, sqa1, { status: 'published', finalScore: null, aiScore: 55, bestScore: 55 });
  await mkSub(asgStudent.id, sa.id, qa.id, sqa2, { status: 'published', finalScore: 30, aiScore: 25, bestScore: 30 });

  // ===== 教师 A 不可见（classB / 生 sb）=====
  sub.B_ai = (await mkSub(asgB.id, sb.id, qb.id, sqb1, { status: 'ai_graded', aiScore: 80, aiFeedback: SECRET_AI_B, answer: SECRET_ANSWER_B })).id;
  sub.B_rev = (await mkSub(asgB.id, sb.id, qb.id, sqb2, { status: 'reviewed', finalScore: 88, teacherFeedback: 'TF_B' })).id;

  // ===== 同校不可见班级（classHidden / 生 sc）=====
  await mkSub(asgCh.id, sc.id, qc.id, sqc1, { status: 'ai_graded', aiScore: 70, aiFeedback: 'AI_C' });
  await mkSub(asgMixed.id, sc.id, qa.id, sqa1, { status: 'ai_graded', aiScore: 65, aiFeedback: 'AI_MIXED' });

  // 实训题提交：作业归教师 A，但学生 sb 在 A 不可见的 classB
  projSubId = (await mkSub(asgAProj.id, sb.id, qaProj.id, null, {
    status: 'submitted',
    answer: JSON.stringify({ kind: 'project', currentVersion: 0, history: [], grading: { state: 'pending', version: 0, startedAt: null, finishedAt: null, error: null } }),
  })).id;
}

const get = (token, url) => request().get(url).set('Authorization', 'Bearer ' + token);
const put = (token, url, body) => request().put(url).send(body).set('Authorization', 'Bearer ' + token);
const post = (token, url, body) => request().post(url).send(body).set('Authorization', 'Bearer ' + token);

async function login(username) {
  const res = await request().post('/api/auth/login').send({ username, password: username });
  if (res.body.code !== 0) throw new Error('登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

/** 递归收集响应体字段名（字段级断言，而非值断言） */
function collectKeys(value, out = new Set()) {
  if (Array.isArray(value)) { for (const v of value) collectKeys(v, out); return out; }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.add(k); collectKeys(v, out); }
  }
  return out;
}

const DB = (id) => prisma.submission.findUnique({ where: { id } });

describe('t4 · 教师端越权收敛与口径修复', () => {
  beforeAll(async () => {
    await seed();
    tokenA = await login(PREFIX + 'teacher_a');
    tokenSa = await login(PREFIX + 'stu_a');
  }, 60000);

  afterAll(async () => { await purge(); }, 60000);

  // ================= R17：详情端点（Critical） =================

  it('R17-1: 详情——读跨校班级提交 → 403，且响应体不含任何题目/答案/评分内容', async () => {
    const res = await get(tokenA, '/api/teacher/submissions/' + sub.B_ai);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
    expect(res.body.data).toBeNull();
    const keys = collectKeys(res.body);
    for (const k of ['referenceAnswer', 'scoringCriteria', 'objectiveItems', 'subQuestions', 'answer', 'allSubmissions', 'question', 'student', 'aiScore', 'aiFeedback']) {
      expect(keys.has(k)).toBe(false);
    }
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(SECRET_ANSWER_B);
    expect(text).not.toContain(SECRET_REF_B);
    expect(text).not.toContain(SECRET_AI_B);
  });

  it('R17-2: 详情——本人可见提交正常返回（含 allSubmissions / 题目）', async () => {
    const res = await get(tokenA, '/api/teacher/submissions/' + sub.A_ai);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.id).toBe(sub.A_ai);
    expect(Array.isArray(res.body.data.allSubmissions)).toBe(true);
    expect(res.body.data.question).toBeDefined();
  });

  it('R17-3: 语义——提交不存在 → 404 且响应体不含内容（不可见为 403，两者都不泄漏内容）', async () => {
    const res = await get(tokenA, '/api/teacher/submissions/999999999');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1004);
    expect(collectKeys(res.body).has('question')).toBe(false);
  });

  it('R17-4: 提示词——跨教师 403，且不含学生答案/参考答案', async () => {
    const res = await get(tokenA, '/api/teacher/submissions/' + sub.B_ai + '/prompt');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
    const keys = collectKeys(res.body);
    expect(keys.has('system')).toBe(false);
    expect(keys.has('user')).toBe(false);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(SECRET_ANSWER_B);
    expect(text).not.toContain(SECRET_REF_B);
  });

  // ================= R17：单条写端点（跨教师 → 403 且 DB 不变） =================

  it('R17-5: 改分——跨教师 403，DB finalScore/status 均未变化', async () => {
    const before = await DB(sub.B_ai);
    const res = await put(tokenA, '/api/teacher/submissions/' + sub.B_ai + '/score', { finalScore: 5 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
    const after = await DB(sub.B_ai);
    expect(after.finalScore).toBe(before.finalScore);
    expect(after.status).toBe(before.status);
    expect(after.finalScore).toBeNull();
    expect(after.status).toBe('ai_graded');
  });

  it('R17-6: 审核——跨教师 403，DB finalScore/status/teacherFeedback 均未变化', async () => {
    const before = await DB(sub.B_ai);
    const res = await put(tokenA, '/api/teacher/submissions/' + sub.B_ai + '/review', { finalScore: 6, teacherFeedback: 'HACK' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
    const after = await DB(sub.B_ai);
    expect(after.status).toBe(before.status);
    expect(after.finalScore).toBe(before.finalScore);
    expect(after.teacherFeedback).toBe(before.teacherFeedback);
    expect(after.teacherFeedback).toBeNull();
  });

  it('R17-7: 重评——跨教师 403，DB aiScore/status 均未变化', async () => {
    const before = await DB(sub.B_ai);
    const res = await post(tokenA, '/api/teacher/submissions/' + sub.B_ai + '/regrade', {});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
    const after = await DB(sub.B_ai);
    expect(after.aiScore).toBe(before.aiScore);
    expect(after.status).toBe(before.status);
    expect(after.aiScore).toBe(80);
  });

  it('R17-8: 实训题详情/审核——作业归属教师但学生不在可见班级 → 403 且 DB 未变化', async () => {
    const before = await DB(projSubId);
    const detail = await get(tokenA, '/api/teacher/submissions/' + projSubId + '/project');
    expect(detail.status).toBe(403);
    expect(detail.body.code).toBe(1003);

    const review = await put(tokenA, '/api/teacher/submissions/' + projSubId + '/project/review', { finalScore: 10, teacherFeedback: 'HACK' });
    expect(review.status).toBe(403);
    expect(review.body.code).toBe(1003);
    const after = await DB(projSubId);
    expect(after.status).toBe(before.status);
    expect(after.finalScore).toBe(before.finalScore);
    expect(after.status).toBe('submitted');
    expect(after.finalScore).toBeNull();
  });

  it('R17-9: 改分/审核——本人可见提交正常生效（回归）', async () => {
    const r1 = await put(tokenA, '/api/teacher/submissions/' + sub.A_ai_pos + '/score', { finalScore: 66 });
    expect(r1.status).toBe(200);
    expect(r1.body.code).toBe(0);
    expect((await DB(sub.A_ai_pos)).finalScore).toBe(66);

    // 审核用另一条专用提交（sub.A_ai），避免与改分用例相互影响
    const r2 = await put(tokenA, '/api/teacher/submissions/' + sub.A_ai + '/review', { finalScore: 61, teacherFeedback: 'TF_OK' });
    expect(r2.status).toBe(200);
    expect(r2.body.code).toBe(0);
    const after = await DB(sub.A_ai);
    expect(after.status).toBe('reviewed');
    expect(after.finalScore).toBe(61);
    expect(after.teacherFeedback).toBe('TF_OK');
  });

  // ================= R17：发布（批量 id）原子性 =================

  it('R17-10: 发布——可见+不可见混批 → 整批拒绝（列出被拒 id），可见那条也未生效', async () => {
    const before = await DB(sub.A_rev_pos);
    expect(before.status).toBe('reviewed');

    const res = await put(tokenA, '/api/teacher/submissions/publish', { submissionIds: [sub.A_rev_pos, sub.B_rev] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
    expect(Array.isArray(res.body.data.rejectedIds)).toBe(true);
    expect(res.body.data.rejectedIds).toContain(sub.B_rev);
    expect(res.body.data.rejectedIds).not.toContain(sub.A_rev_pos);

    // 原子性：已可见的那条不得生效
    expect((await DB(sub.A_rev_pos)).status).toBe('reviewed');
    expect((await DB(sub.B_rev)).status).toBe('reviewed');
  });

  it('R17-11: 发布——全不可见 → 403；全可见 → 成功且 DB 更新（回归）', async () => {
    const bad = await put(tokenA, '/api/teacher/submissions/publish', { submissionIds: [sub.B_rev] });
    expect(bad.status).toBe(403);
    expect(bad.body.data.rejectedIds).toContain(sub.B_rev);

    const ok = await put(tokenA, '/api/teacher/submissions/publish', { submissionIds: [sub.A_rev_pos] });
    expect(ok.status).toBe(200);
    expect(ok.body.code).toBe(0);
    expect((await DB(sub.A_rev_pos)).status).toBe('published');
  });

  // ================= R17：班级维度批量端点 =================

  it('R17-12: 批量审核/发布——不可见班级 → 403 且不产生任何写入；非法 schoolId → 400', async () => {
    const br = await post(tokenA, '/api/teacher/submissions/batch-review', { schoolId: schoolB.id, classId: classB.id, assignmentId: asgB.id });
    expect(br.status).toBe(403);
    expect(br.body.code).toBe(1003);

    const bp = await post(tokenA, '/api/teacher/submissions/batch-publish', { schoolId: schoolB.id, classId: classB.id, assignmentId: asgB.id });
    expect(bp.status).toBe(403);
    expect(bp.body.code).toBe(1003);

    // DB 断言：B 班提交的 status 未被批量审核/发布改动
    expect((await DB(sub.B_ai)).status).toBe('ai_graded');
    expect((await DB(sub.B_rev)).status).toBe('reviewed');

    // 同校但不可见班级（classHidden）同样整批拒绝
    const brH = await post(tokenA, '/api/teacher/submissions/batch-review', { schoolId: schoolA.id, classId: classHidden.id, assignmentId: asgCh.id });
    expect(brH.status).toBe(403);

    // 非法 schoolId → 400（fail-closed，不落到不限学校分支）
    const bad = await post(tokenA, '/api/teacher/submissions/batch-publish', { schoolId: 'abc', classId: classA.id, assignmentId: asgBatchPublish.id });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe(1001);
    expect((await DB(sub.BP_rev)).status).toBe('reviewed'); // 未误伤
  });

  it('R17-13: 批量审核/发布——可见班级正常生效（回归）', async () => {
    const br = await post(tokenA, '/api/teacher/submissions/batch-review', { schoolId: schoolA.id, classId: classA.id, assignmentId: asgBatchReview.id });
    expect(br.status).toBe(200);
    expect(br.body.code).toBe(0);
    const reviewed = await DB(sub.BR_ai);
    expect(reviewed.status).toBe('reviewed');
    expect(reviewed.finalScore).toBe(40);   // = aiScore（既有语义）

    const bp = await post(tokenA, '/api/teacher/submissions/batch-publish', { schoolId: schoolA.id, classId: classA.id, assignmentId: asgBatchPublish.id });
    expect(bp.status).toBe(200);
    expect(bp.body.code).toBe(0);
    expect((await DB(sub.BP_rev)).status).toBe('published');
  });

  // ================= R16 / R5：汇总口径 =================

  it('R16: review-summary 的 classId 与可见集合求交——同校不可见班级 → 空集，可见班级 → 正常返回', async () => {
    // 反例前提：同校隐藏班确有提交（否则该反例没有说服力）
    expect(await prisma.submission.count({ where: { assignmentId: asgCh.id } })).toBeGreaterThan(0);

    const hidden = await get(tokenA, '/api/teacher/review-summary?schoolId=' + schoolA.id + '&classId=' + classHidden.id);
    expect(hidden.status).toBe(200);
    expect(hidden.body.code).toBe(0);
    expect(hidden.body.data).toEqual([]);

    const visible = await get(tokenA, '/api/teacher/review-summary?schoolId=' + schoolA.id + '&classId=' + classA.id);
    expect(visible.body.code).toBe(0);
    expect(visible.body.data.length).toBeGreaterThan(0);
    expect(visible.body.data.every(r => r.classId === classA.id)).toBe(true);
    // 对照：不传 classId 时也不含同校不可见班级
    const all = await get(tokenA, '/api/teacher/review-summary?schoolId=' + schoolA.id);
    expect(all.body.data.some(r => r.classId === classHidden.id)).toBe(false);
  });

  it('R5: 非法 schoolId（abc）两入口一致 fail-closed', async () => {
    const ps = await get(tokenA, '/api/teacher/pending-summary?schoolId=abc');
    expect(ps.status).toBe(200);
    expect(ps.body.code).toBe(0);
    expect(ps.body.data).toMatchObject({ pendingReview: 0, aiPending: 0, abnormal: 0 });

    const rs = await get(tokenA, '/api/teacher/review-summary?schoolId=abc');
    expect(rs.status).toBe(200);
    expect(rs.body.code).toBe(0);
    expect(rs.body.data).toEqual([]);
  });

  // ================= R10 / R14：口径一致性 =================

  it('R10: 作业列表 pendingReviewCount 按可见班级统计，expectedCount 仍为全部关联班级', async () => {
    const list = (await get(tokenA, '/api/teacher/assignments?pageSize=100')).body.data.list;
    const mixed = list.find(a => a.id === asgMixed.id);
    expect(mixed).toBeDefined();
    // asgMixed 挂在 classA（可见，花名册仅 sa，无提交）+ classHidden（不可见，sc 有 ai_graded）
    expect(mixed.pendingReviewCount).toBe(0);   // 不可见班级的待审核不得计入
    expect(mixed.expectedCount).toBe(2);        // 全部关联班级去重 = {sa} ∪ {sc} = 2
    // 明细之和 == 侧栏徽标（同一可见班级口径）
    const sum = list.reduce((s, a) => s + a.pendingReviewCount, 0);
    const ps = (await get(tokenA, '/api/teacher/pending-summary')).body.data;
    expect(sum).toBe(ps.pendingReview);
  });

  it('R14: 学生列表 finalScore 与 /student/scores 口径一致（published 且 finalScore=null → aiScore）', async () => {
    const list = (await get(tokenSa, '/api/student/assignments?pageSize=100')).body.data.list;
    const row = list.find(a => a.id === asgStudent.id);
    expect(row).toBeDefined();
    expect(row.finalScore).toBe(85);            // (null ?? 55) + (30 ?? 25)
    const scores = (await get(tokenSa, '/api/student/scores')).body.data;
    const entry = scores.find(s => s.assignmentId === asgStudent.id);
    expect(entry).toBeDefined();
    expect(entry.totalScore).toBe(row.finalScore);
  });
});
