/**
 * t6 · classId/questionId 型越权入口一次性收敛（含答案导出）测试
 *
 * 覆盖 t6 验收面：
 *   R-A export-review：不可见/跨校 classId → 403 且响应体不含任何姓名/学号/答案/分数；可见 classId → 正常导出
 *   R-B review-class/:classId：不可见 classId → 403 零内容；可见 → 正常
 *   R-C review-questions：不传 classId 也只返回可见范围的题目（旧实现全局返回）；传不可见 classId → 403（本任务选择的 fail-closed 语义）
 *   R-D 提示词预览三端点（编程题模板 / 实训题模板 / 实训题实际提示词）：他人题目/提交 → 403 且无题目、答案、标准包内容；自己的 → 正常
 *   R-E 实训题按 id 直取的详情/重评：不可见提交 → 403 且 DB 零写入
 *   R-F 学生详情 R14 对齐：published 且 finalScore=null、aiScore=55 → 详情与列表/成绩页一致（55），且仍无 aiScore/aiFeedback 字段名
 *   R-G 交付说明登记项：批量端点 classId 缺失/非法 → 403（旧实现为 200 零写入）
 *
 * 夹具自建自清（t6_ 前缀，独立学校 29931/29932），不依赖 setup seed。
 */
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';
import { standardDir, STANDARDS_ROOT } from '../../src/utils/projectPaths.js';

const PREFIX = 't6_';
const CODE_A = '29931';
const CODE_B = '29932';
const REF_A = PREFIX + 'REF_A';
const CRIT_A = PREFIX + 'CRIT_A';
const REF_C = PREFIX + 'REF_C_绝密';
const CRIT_C = PREFIX + 'CRIT_C_绝密';
const ANSWER_C = PREFIX + 'ANSWER_C_绝密';
const STANDARD_SECRET_B = PREFIX + 'STANDARD_SECRET_B_绝密';
const ANSWER_PROJ_B = PREFIX + 'PROJ_ANSWER_B_绝密';

let sA, sB, clsA, clsHidden, clsB;
let tA, tB, tC;
let sa, sc, sb;
let qa, qc, qb, qaProj, qbProj;
let asgA, asgCh, asgB, asgAProj, asgBProj, asgStudent, asgBatch;
let tokenA, tokenSa;
const sub = {};
const stdDirs = [];

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
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
}

/** 只清理本套件创建的标准包目录 */
function purgeStandardDirs() {
  for (const dir of stdDirs) {
    if (dir.startsWith(STANDARDS_ROOT + path.sep)) fs.rmSync(dir, { recursive: true, force: true });
  }
  stdDirs.length = 0;
}

const mkUser = (username, realName, role) => prisma.user.create({
  data: { username, password: bcrypt.hashSync(username, 10), realName, role },
});

async function seed() {
  await purge();

  sA = await prisma.school.create({ data: { name: PREFIX + 'school_a', officialCode: CODE_A } });
  sB = await prisma.school.create({ data: { name: PREFIX + 'school_b', officialCode: CODE_B } });
  clsA = await prisma.class.create({ data: { name: PREFIX + 'class_a', schoolId: sA.id } });
  clsHidden = await prisma.class.create({ data: { name: PREFIX + 'class_hidden', schoolId: sA.id } }); // 同校不可见
  clsB = await prisma.class.create({ data: { name: PREFIX + 'class_b', schoolId: sB.id } });

  tA = await mkUser(PREFIX + 'teacher_a', 't6教师A', 'teacher');
  tB = await mkUser(PREFIX + 'teacher_b', 't6教师B', 'teacher');
  tC = await mkUser(PREFIX + 'teacher_c', 't6教师C', 'teacher');
  await prisma.teacherSchool.createMany({ data: [
    { teacherId: tA.id, schoolId: sA.id },
    { teacherId: tB.id, schoolId: sB.id },
    { teacherId: tC.id, schoolId: sA.id },
  ] });
  await prisma.teacherClass.createMany({ data: [
    { teacherId: tA.id, classId: clsA.id },
    { teacherId: tB.id, classId: clsB.id },
    { teacherId: tC.id, classId: clsHidden.id },
  ] });

  sa = await mkUser(PREFIX + 'stu_a', 't6生A', 'student');
  sc = await mkUser(PREFIX + 'stu_c', 't6生C绝密', 'student');
  sb = await mkUser(PREFIX + 'stu_b', 't6生B', 'student');
  await prisma.studentClass.createMany({ data: [
    { studentId: sa.id, classId: clsA.id },
    { studentId: sc.id, classId: clsHidden.id },
    { studentId: sb.id, classId: clsB.id },
  ] });

  const mkCodeQ = (teacherId, title, ref, crit) => prisma.question.create({
    data: {
      teacherId, title, maxScore: 100, difficulty: 'easy', type: 'code',
      subQuestions: { create: [
        { sortOrder: 1, title: title + '-小1', content: '<p>1</p>', referenceAnswer: ref, language: 'python', score: 100, scoringCriteria: crit },
      ] },
    },
    include: { subQuestions: true },
  });
  const mkProjQ = (teacherId, title) => prisma.question.create({
    data: { teacherId, title, maxScore: 100, difficulty: 'medium', type: 'project', material: PREFIX + 'project material', scoringRubric: PREFIX + 'rubric' },
  });
  qa = await mkCodeQ(tA.id, PREFIX + '题A', REF_A, CRIT_A);
  qc = await mkCodeQ(tC.id, PREFIX + '题C', REF_C, CRIT_C);
  qb = await mkCodeQ(tB.id, PREFIX + '题B', PREFIX + 'REF_B', PREFIX + 'CRIT_B');
  qaProj = await mkProjQ(tA.id, PREFIX + '题A-proj');
  qbProj = await mkProjQ(tB.id, PREFIX + '题B-proj');
  // B 的实训题上传了标准工程包（含绝密内容）→ 用于证明 A 的 403 不泄漏标准包
  const stdDir = standardDir(qbProj.id);
  fs.mkdirSync(stdDir, { recursive: true });
  fs.writeFileSync(path.join(stdDir, 'main.py'), 'SECRET = "' + STANDARD_SECRET_B + '"\n');
  stdDirs.push(path.dirname(stdDir));
  qbProj = await prisma.question.update({
    where: { id: qbProj.id },
    data: { attachmentUrl: 'project-questions/' + qbProj.id + '/standard' },
  });

  const mkAsg = (teacherId, title, classIds, questionIds) => prisma.assignment.create({
    data: {
      teacherId, title, mode: 'exam',
      startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01'),
      assignmentClasses: { create: classIds.map(classId => ({ classId })) },
      assignmentQuestions: { create: questionIds.map((questionId, i) => ({ questionId, sortOrder: i + 1 })) },
    },
  });
  asgA = await mkAsg(tA.id, PREFIX + '作业A', [clsA.id], [qa.id]);
  asgCh = await mkAsg(tC.id, PREFIX + '作业C隐藏', [clsHidden.id], [qc.id]);
  asgB = await mkAsg(tB.id, PREFIX + '作业B', [clsB.id], [qb.id]);
  asgAProj = await mkAsg(tA.id, PREFIX + '作业A-proj', [clsA.id], [qaProj.id]);
  asgBProj = await mkAsg(tB.id, PREFIX + '作业B-proj', [clsB.id], [qbProj.id]);
  asgStudent = await mkAsg(tA.id, PREFIX + '作业A-学生端口径', [clsA.id], [qa.id]);
  asgBatch = await mkAsg(tA.id, PREFIX + '作业A-批量', [clsA.id], [qa.id]);

  const mkSub = (assignmentId, studentId, questionId, subQuestionId, data) => prisma.submission.create({
    data: {
      assignmentId, studentId, questionId, subQuestionId: subQuestionId || null,
      answer: data.answer ?? '', status: data.status, aiScore: data.aiScore ?? null, aiFeedback: data.aiFeedback ?? null,
      finalScore: data.finalScore ?? null, teacherFeedback: data.teacherFeedback ?? null,
      attemptCount: 1, submittedAt: data.submittedAt ?? new Date('2026-02-01T10:00:00Z'),
    },
  });
  const sqa1 = qa.subQuestions[0].id;
  const sqc1 = qc.subQuestions[0].id;

  sub.A_ai = (await mkSub(asgA.id, sa.id, qa.id, sqa1, { status: 'ai_graded', aiScore: 40, aiFeedback: PREFIX + 'AI_A', answer: PREFIX + 'ANSWER_A' })).id;
  sub.Ch_ai = (await mkSub(asgCh.id, sc.id, qc.id, sqc1, { status: 'ai_graded', aiScore: 70, aiFeedback: PREFIX + 'AI_C', answer: ANSWER_C })).id;
  sub.B_ai = (await mkSub(asgB.id, sb.id, qb.id, qb.subQuestions[0].id, { status: 'ai_graded', aiScore: 60, aiFeedback: PREFIX + 'AI_B', answer: PREFIX + 'ANSWER_B' })).id;
  sub.Batch_ai = (await mkSub(asgBatch.id, sa.id, qa.id, sqa1, { status: 'ai_graded', aiScore: 45, aiFeedback: PREFIX + 'AI_BATCH' })).id;

  // 实训题提交（envelope）
  const envelope = JSON.stringify({ kind: 'project', currentVersion: 0, history: [], grading: { state: 'pending', version: 0, startedAt: null, finishedAt: null, error: null } });
  sub.A_proj = (await mkSub(asgAProj.id, sa.id, qaProj.id, null, { status: 'submitted', answer: envelope })).id;
  sub.B_proj = (await mkSub(asgBProj.id, sb.id, qbProj.id, null, { status: 'submitted', answer: envelope + ANSWER_PROJ_B })).id;

  // 学生端口径（R14）：published 且 finalScore=null（aiScore=55）+ published 有值 30
  await mkSub(asgStudent.id, sa.id, qa.id, sqa1, { status: 'published', finalScore: null, aiScore: 55, bestScore: 55 });
  await mkSub(asgStudent.id, sa.id, qa.id, null, { status: 'published', finalScore: 30, aiScore: 25, bestScore: 30 });
}

const get = (token, url) => request().get(url).set('Authorization', 'Bearer ' + token);
const post = (token, url, body) => request().post(url).send(body).set('Authorization', 'Bearer ' + token);

async function login(username) {
  const res = await request().post('/api/auth/login').send({ username, password: username });
  if (res.body.code !== 0) throw new Error('登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

/** 递归收集响应体字段名（字段级断言） */
function collectKeys(value, out = new Set()) {
  if (Array.isArray(value)) { for (const v of value) collectKeys(v, out); return out; }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.add(k); collectKeys(v, out); }
  }
  return out;
}

/** 403 零内容断言：状态码 + code + data:null + 不含给定敏感串 + 不含内容型字段名 */
function expectEmptyDenied(res, forbiddenStrings = []) {
  expect(res.status).toBe(403);
  expect(res.body.code).toBe(1003);
  expect(res.body.data).toBeNull();
  const keys = collectKeys(res.body);
  for (const k of ['rows', 'headerCells', 'list', 'subs', 'system', 'user', 'standardFiles', 'studentFiles', 'cellScores', 'allSubmissions', 'question', 'student']) {
    expect(keys.has(k)).toBe(false);
  }
  const text = JSON.stringify(res.body);
  for (const s of forbiddenStrings) expect(text).not.toContain(s);
}

describe('t6 · classId/questionId 型越权入口收敛', () => {
  beforeAll(async () => {
    await seed();
    tokenA = await login(PREFIX + 'teacher_a');
    tokenSa = await login(PREFIX + 'stu_a');
  }, 60000);

  afterAll(async () => { await purge(); purgeStandardDirs(); }, 60000);

  // ================= R-A export-review =================

  it('R-A1: export-review 同校不可见班级 → 403 且不含任何姓名/学号/答案/分数', async () => {
    const res = await get(tokenA, '/api/teacher/export-review?classId=' + clsHidden.id + '&assignmentId=' + asgCh.id);
    expectEmptyDenied(res, ['t6生C绝密', 't6_stu_c', ANSWER_C, REF_C]);
  });

  it('R-A2: export-review 跨校班级 → 403 零内容', async () => {
    const res = await get(tokenA, '/api/teacher/export-review?classId=' + clsB.id + '&assignmentId=' + asgB.id);
    expectEmptyDenied(res, ['t6生B', 't6_stu_b']);
  });

  it('R-A3: export-review 可见班级 → 正常导出（含学生名与表头）', async () => {
    const res = await get(tokenA, '/api/teacher/export-review?classId=' + clsA.id + '&assignmentId=' + asgA.id);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data.rows)).toBe(true);
    expect(res.body.data.rows.some(r => r.studentName === 't6生A')).toBe(true);
    expect(Array.isArray(res.body.data.headerCells)).toBe(true);
    expect(res.body.data.rows.some(r => r.studentName === 't6生C绝密')).toBe(false);
  });

  it('R-A4: export-review 缺参 → 400（既有参数校验不变）', async () => {
    const r1 = await get(tokenA, '/api/teacher/export-review?classId=' + clsA.id);
    expect(r1.status).toBe(400);
    expect(r1.body.code).toBe(1001);
    const r2 = await get(tokenA, '/api/teacher/export-review');
    expect(r2.status).toBe(400);
  });

  // ================= R-B review-class/:classId =================

  it('R-B1: review-class 不可见班级（同校隐藏 + 跨校）→ 403 零内容', async () => {
    const hidden = await get(tokenA, '/api/teacher/review-class/' + clsHidden.id + '?assignmentId=' + asgCh.id);
    expectEmptyDenied(hidden, ['t6生C绝密', 't6_stu_c', ANSWER_C]);

    const cross = await get(tokenA, '/api/teacher/review-class/' + clsB.id + '?assignmentId=' + asgB.id);
    expectEmptyDenied(cross, ['t6生B', 't6_stu_b']);
  });

  it('R-B2: review-class 可见班级 → 正常返回花名册行', async () => {
    const res = await get(tokenA, '/api/teacher/review-class/' + clsA.id + '?assignmentId=' + asgA.id);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.list.some(r => r.studentName === 't6生A')).toBe(true);
    expect(res.body.data.list.some(r => r.studentName === 't6生C绝密')).toBe(false);
  });

  // ================= R-C review-questions =================

  it('R-C1: review-questions 不传 classId → 只返回可见范围内的题目（不得全局返回）', async () => {
    const res = await get(tokenA, '/api/teacher/review-questions');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    const ids = res.body.data.map(q => q.id);
    expect(ids).toContain(qa.id);
    // 旧实现会全局返回：B 的题目（跨校）与 C 的题目（同校不可见）都不得出现
    expect(ids).not.toContain(qb.id);
    expect(ids).not.toContain(qc.id);
  });

  it('R-C2: review-questions 传不可见 classId → 403（本任务选择的 fail-closed 语义）', async () => {
    const hidden = await get(tokenA, '/api/teacher/review-questions?classId=' + clsHidden.id);
    expectEmptyDenied(hidden, ['t6题C', REF_C]);
    const cross = await get(tokenA, '/api/teacher/review-questions?classId=' + clsB.id);
    expectEmptyDenied(cross, ['t6题B']);
  });

  it('R-C3: review-questions 传可见 classId → 该班题目（回归）', async () => {
    const res = await get(tokenA, '/api/teacher/review-questions?classId=' + clsA.id);
    expect(res.body.code).toBe(0);
    const ids = res.body.data.map(q => q.id);
    expect(ids).toContain(qa.id);          // sa 的编程题提交
    expect(ids).toContain(qaProj.id);      // sa 的实训题提交（同班同生）
    expect(ids).not.toContain(qc.id);      // 同校不可见班题目
    expect(ids).not.toContain(qb.id);      // 跨校题目
  });

  // ================= R-D 提示词预览三端点 =================

  it('R-D1: 编程题模板预览——他人题目 → 403 且无参考答案/评分标准', async () => {
    const denied = await get(tokenA, '/api/teacher/questions/' + qc.id + '/prompt-preview');
    expectEmptyDenied(denied, [REF_C, CRIT_C, 't6题C']);

    const own = await get(tokenA, '/api/teacher/questions/' + qa.id + '/prompt-preview');
    expect(own.status).toBe(200);
    expect(own.body.code).toBe(0);
    expect(own.body.data.subs[0].user).toContain(REF_A);
  });

  it('R-D2: 实训题模板预览——他人题目 → 403 且无标准包内容', async () => {
    const denied = await get(tokenA, '/api/teacher/questions/' + qbProj.id + '/project-prompt-preview');
    expectEmptyDenied(denied, [STANDARD_SECRET_B, 't6题B-proj']);

    const own = await get(tokenA, '/api/teacher/questions/' + qaProj.id + '/project-prompt-preview');
    expect(own.status).toBe(200);
    expect(own.body.code).toBe(0);
    expect(own.body.data.type).toBe('project');
  });

  it('R-D3: 实训题实际提示词——他人提交 → 403 且无标准包/学生工程内容', async () => {
    const denied = await get(tokenA, '/api/teacher/submissions/' + sub.B_proj + '/project/prompt');
    expectEmptyDenied(denied, [STANDARD_SECRET_B, ANSWER_PROJ_B, 't6生B']);

    const own = await get(tokenA, '/api/teacher/submissions/' + sub.A_proj + '/project/prompt');
    expect(own.status).toBe(200);
    expect(own.body.code).toBe(0);
    expect(own.body.data.type).toBe('project');
  });

  it('R-D4: 编程题实际提示词（t4 已收敛，回归）——他人提交 → 403', async () => {
    const denied = await get(tokenA, '/api/teacher/submissions/' + sub.Ch_ai + '/prompt');
    expectEmptyDenied(denied, [ANSWER_C, REF_C]);
  });

  // ================= R-E 实训题按 id 直取的详情/重评 =================

  it('R-E1: /project-submission/:id 他人提交 → 403 零内容；自己的 → 200', async () => {
    const denied = await get(tokenA, '/api/teacher/project-submission/' + sub.B_proj);
    expectEmptyDenied(denied, [STANDARD_SECRET_B, ANSWER_PROJ_B, 't6生B']);

    const own = await get(tokenA, '/api/teacher/project-submission/' + sub.A_proj);
    expect(own.status).toBe(200);
    expect(own.body.code).toBe(0);
    expect(own.body.data.submission.id).toBe(sub.A_proj);
  });

  it('R-E2: /submissions/:id/project/regrade 他人提交 → 403 且 DB 零写入', async () => {
    const before = await prisma.submission.findUnique({ where: { id: sub.B_proj } });
    const res = await post(tokenA, '/api/teacher/submissions/' + sub.B_proj + '/project/regrade', {});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
    const after = await prisma.submission.findUnique({ where: { id: sub.B_proj } });
    expect(after.status).toBe(before.status);
    expect(after.answer).toBe(before.answer);
    expect(after.aiScore).toBe(before.aiScore);
  });

  // ================= R-F 学生详情口径（R14 对齐） =================

  it('R-F1: 学生详情 published+finalScore=null → 与列表/成绩页一致（55），且无 aiScore/aiFeedback 字段名', async () => {
    const detail = await get(tokenSa, '/api/student/assignments/' + asgStudent.id);
    expect(detail.status).toBe(200);
    expect(detail.body.code).toBe(0);
    const row = detail.body.data.submissions.find(s => s.finalScore !== null || s.status === 'published');
    expect(row).toBeDefined();
    // 详情逐行：aiScore=55 的那行 finalScore 应为 55（旧行为为 null）
    const nullRowBefore = detail.body.data.submissions.filter(s => s.status === 'published');
    expect(nullRowBefore.length).toBe(2);
    expect(nullRowBefore.map(s => s.finalScore).sort((a, b) => a - b)).toEqual([30, 55]);

    const keys = collectKeys(detail.body);
    expect(keys.has('aiScore')).toBe(false);
    expect(keys.has('aiFeedback')).toBe(false);
    expect(JSON.stringify(detail.body)).not.toContain(PREFIX + 'AI');

    // 列表与成绩页同口径
    const list = (await get(tokenSa, '/api/student/assignments?pageSize=100')).body.data.list;
    const listRow = list.find(a => a.id === asgStudent.id);
    expect(listRow.finalScore).toBe(85);
    const scores = (await get(tokenSa, '/api/student/scores')).body.data;
    const entry = scores.find(s => s.assignmentId === asgStudent.id);
    expect(entry.totalScore).toBe(85);
    // 详情逐行之和 == 列表 == 成绩页
    expect(nullRowBefore.reduce((sum, s) => sum + s.finalScore, 0)).toBe(listRow.finalScore);
  });

  // ================= R-G 批量端点 classId 行为变更登记 =================

  it('R-G1: 批量端点 classId 缺失/非法 → 403（行为变更，旧实现 200 零写入）；schoolId 缺失 → 400', async () => {
    const noClass = await post(tokenA, '/api/teacher/submissions/batch-review', { schoolId: sA.id, assignmentId: asgBatch.id });
    expect(noClass.status).toBe(403);
    expect(noClass.body.code).toBe(1003);

    const badClass = await post(tokenA, '/api/teacher/submissions/batch-publish', { schoolId: sA.id, classId: 'abc', assignmentId: asgBatch.id });
    expect(badClass.status).toBe(403);

    const noSchool = await post(tokenA, '/api/teacher/submissions/batch-review', { classId: clsA.id, assignmentId: asgBatch.id });
    expect(noSchool.status).toBe(400);
    expect(noSchool.body.code).toBe(1001);
  });

  it('R-G2: 批量审核可见班级 → 200 且 DB 生效（回归）', async () => {
    const res = await post(tokenA, '/api/teacher/submissions/batch-review', { schoolId: sA.id, classId: clsA.id, assignmentId: asgBatch.id });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    const row = await prisma.submission.findUnique({ where: { id: sub.Batch_ai } });
    expect(row.status).toBe('reviewed');
    expect(row.finalScore).toBe(45);
  });
});
