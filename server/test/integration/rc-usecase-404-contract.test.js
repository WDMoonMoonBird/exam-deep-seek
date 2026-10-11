/**
 * rc-usecase-404-contract.test.js — reviewController 拆分（step 8）B0b 前置补测：
 * regradeSubmission(:275-276) 与 updateScore(:295-296) 的 `EntityNotFoundError → 404` 分支（Z7/Z8）。
 *
 * 背景（docs/split/reviewController-plan.md §1.4-3 + docs/split/reviewController-B0-verify.md §5）：
 *   - 「黑盒不可达」成立：守卫 loadVisibleSubmission(:95-101) 与用例层查的是同表、同谓词、同 id 转换，
 *     除非同一请求内被并发删除，否则第二次查询不会返回 null。
 *   - 但 app.js:29 的 Object.assign(app.locals, compose(...)) 让 app.locals.reviewUseCases 成为
 *     **可写普通属性** ⇒ 只替换这一个端口，即可在真实路由 + 真实中间件 + 真实守卫 + 真实控制器
 *     完全不变的前提下，确定性触发 :275-276 / :295-296（C 的 5/5 实验结论）。
 *   - ★ 硬约束（C 的 C4 实验）：替身抛出的 message **必须区别于守卫文案**「提交不存在」——
 *     否则用例可能在守卫 :100 处短路却仍然全绿（两种情形的响应体逐字节相同）= 假阳性。
 *     本文件用 RCB0B-REGRADE-USE-CASE-404 / RCB0B-ADJUST-USE-CASE-404，并逐例断言
 *     「替身确实被调用 1 次（且 cmd 正确）」+「message ≠ 守卫文案」；另加一条对照：
 *     不存在的 id → 同样是 404/1004，但 message 是守卫文案且替身**零调用**（两个 404 不同源）。
 *
 * 断言口径：状态码 + code + message 逐字 + 替身收到的 cmd + DB 终态（零写入）。
 * 夹具自建自清（rcb0z_ 前缀，独立院校代码 29441），不依赖 setup seed；PORT=0；不出网（用例层被替身接管）。
 */
import bcrypt from 'bcryptjs';
import app from '../../src/app.js';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 'rcb0z_';
const CODE = '29441';
const GUARD_MESSAGE = '提交不存在';                 // loadVisibleSubmission(:100) 的守卫文案
const REGRADE_404 = 'RCB0B-REGRADE-USE-CASE-404';   // ★ 必须 ≠ GUARD_MESSAGE
const ADJUST_404 = 'RCB0B-ADJUST-USE-CASE-404';     // ★ 同上
const MISSING_ID = 2000000000;                      // 正整数、不存在（守卫 :99-101 短路）

let school, classA, teacher, student, qCode, subId;
let originalUseCases;

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

const mkUser = (username, realName, role) => prisma.user.create({
  data: { username, password: bcrypt.hashSync(username, 10), realName, role },
});

async function seed() {
  await purge();

  school = await prisma.school.create({ data: { name: PREFIX + 'school', officialCode: CODE } });
  classA = await prisma.class.create({ data: { name: PREFIX + 'class_a', schoolId: school.id } });

  teacher = await mkUser(PREFIX + 'teacher', 'B0b端口教师', 'teacher');
  await prisma.teacherSchool.create({ data: { teacherId: teacher.id, schoolId: school.id } });
  await prisma.teacherClass.create({ data: { teacherId: teacher.id, classId: classA.id } });

  student = await mkUser(PREFIX + 'stu', 'B0b端口学生', 'student');
  await prisma.studentClass.create({ data: { studentId: student.id, classId: classA.id } });

  qCode = await prisma.question.create({
    data: {
      teacherId: teacher.id, title: PREFIX + '编程题', maxScore: 100, difficulty: 'easy', type: 'code',
      subQuestions: { create: [{ sortOrder: 1, title: PREFIX + '小1', type: 'code', score: 100, content: '<p>1</p>', referenceAnswer: 'x', language: 'python' }] },
    },
    include: { subQuestions: true },
  });

  const asg = await prisma.assignment.create({
    data: {
      teacherId: teacher.id, title: PREFIX + '考试', mode: 'exam',
      startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01'),
      assignmentClasses: { create: [{ classId: classA.id }] },
      assignmentQuestions: { create: [{ questionId: qCode.id, sortOrder: 1 }] },
    },
  });

  const sub = await prisma.submission.create({
    data: {
      assignmentId: asg.id, studentId: student.id, questionId: qCode.id, subQuestionId: qCode.subQuestions[0].id,
      answer: 'a', status: 'ai_graded', aiScore: 60, aiFeedback: 'SEED_AI',
      finalScore: null, teacherFeedback: null, submittedAt: new Date('2026-02-01T10:00:00Z'),
    },
  });
  subId = sub.id;
}

async function login(username) {
  const res = await request().post('/api/auth/login').send({ username, password: username });
  if (res.body.code !== 0) throw new Error('登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

/** 安装端口替身：三个用例方法全部记账；返回 calls 数组 */
function installStub(handlers) {
  const calls = [];
  app.locals.reviewUseCases = {
    regrade: async (cmd) => { calls.push({ fn: 'regrade', cmd }); return handlers.regrade(cmd); },
    manualAdjust: async (cmd) => { calls.push({ fn: 'manualAdjust', cmd }); return handlers.manualAdjust(cmd); },
    review: async (cmd) => { calls.push({ fn: 'review', cmd }); return handlers.review(cmd); },
  };
  return calls;
}

function restoreStub() {
  app.locals.reviewUseCases = originalUseCases;
}

/** 构造一个 message 与守卫文案不同的 EntityNotFoundError */
function notFound(message) {
  return Object.assign(new Error(message), { name: 'EntityNotFoundError' });
}

const DB = () => prisma.submission.findUnique({ where: { id: subId } });

describe('reviewController B0b 补测 · 端口替身打靶 EntityNotFoundError → 404（Z7/Z8）', () => {
  let token;

  beforeAll(async () => {
    originalUseCases = app.locals.reviewUseCases;
    expect(typeof originalUseCases).toBe('object');
    expect(originalUseCases).not.toBeNull();
    await seed();
    token = await login(PREFIX + 'teacher');
  }, 60000);

  afterAll(async () => {
    app.locals.reviewUseCases = originalUseCases;
    await purge();
  }, 60000);

  it('T-Z7: regradeSubmission —— 200 正例 + EntityNotFoundError→404(:275-276)，替身文案 ≠ 守卫文案且替身真被调用', async () => {
    // (a) 200 正例：证明「守卫通过 + 控制器真的抵达 :272 调用点 + 不出网」
    let calls = installStub({ regrade: async () => ({ aiScore: 7, aiFeedback: 'RCB0B-AI' }) });
    try {
      const res = await request().post(`/api/teacher/submissions/${subId}/regrade`).set('Authorization', 'Bearer ' + token);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ code: 0, message: '重新评分完成', data: { aiScore: 7, aiFeedback: 'RCB0B-AI' } });
      expect(calls).toEqual([{ fn: 'regrade', cmd: { submissionId: subId } }]);
    } finally { restoreStub(); }

    // (b) 替身抛 EntityNotFoundError(特异文案) → :275-276 命中
    calls = installStub({ regrade: async () => { throw notFound(REGRADE_404); } });
    try {
      const res = await request().post(`/api/teacher/submissions/${subId}/regrade`).set('Authorization', 'Bearer ' + token);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 1004, message: REGRADE_404, data: null });
      // ★ 反假阳性：文案必须与守卫文案不同，且替身确实被调用（不是守卫短路）
      expect(REGRADE_404).not.toBe(GUARD_MESSAGE);
      expect(res.body.message).not.toBe(GUARD_MESSAGE);
      expect(calls).toEqual([{ fn: 'regrade', cmd: { submissionId: subId } }]);
    } finally { restoreStub(); }

    // (c) 对照：不存在的 id → 同样 404/1004，但 message 是守卫文案、替身零调用（两个 404 不同源）
    calls = installStub({ regrade: async () => { throw notFound(REGRADE_404); } });
    try {
      const res = await request().post(`/api/teacher/submissions/${MISSING_ID}/regrade`).set('Authorization', 'Bearer ' + token);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 1004, message: GUARD_MESSAGE, data: null });
      expect(calls).toEqual([]);
    } finally { restoreStub(); }
  });

  it('T-Z8: updateScore —— EntityNotFoundError→404(:295-296)，替身文案 ≠ 守卫文案、cmd 带 finalScore 且 DB 零写入', async () => {
    const before = await DB();
    expect(before.finalScore).toBeNull();
    expect(before.teacherFeedback).toBeNull();

    // (a) 替身抛 EntityNotFoundError(特异文案) → :295-296 命中
    let calls = installStub({ manualAdjust: async () => { throw notFound(ADJUST_404); } });
    try {
      const res = await request().put(`/api/teacher/submissions/${subId}/score`)
        .set('Authorization', 'Bearer ' + token).send({ finalScore: 88 });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 1004, message: ADJUST_404, data: null });
      // ★ 反假阳性：文案必须与守卫文案不同，且替身确实被调用（cmd 逐字）
      expect(ADJUST_404).not.toBe(GUARD_MESSAGE);
      expect(res.body.message).not.toBe(GUARD_MESSAGE);
      expect(calls).toEqual([{ fn: 'manualAdjust', cmd: { submissionId: subId, finalScore: 88 } }]);
    } finally { restoreStub(); }

    // (b) 对照：不存在的 id → 守卫 :100 短路，替身零调用
    calls = installStub({ manualAdjust: async () => { throw notFound(ADJUST_404); } });
    try {
      const res = await request().put(`/api/teacher/submissions/${MISSING_ID}/score`)
        .set('Authorization', 'Bearer ' + token).send({ finalScore: 88 });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 1004, message: GUARD_MESSAGE, data: null });
      expect(calls).toEqual([]);
    } finally { restoreStub(); }

    // 全程零写入（替身接管 ⇒ 不落库）
    const after = await DB();
    expect(after.finalScore).toBe(before.finalScore);
    expect(after.teacherFeedback).toBe(before.teacherFeedback);
    expect(after.status).toBe(before.status);
  });
});
