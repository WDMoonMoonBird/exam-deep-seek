/**
 * r3-d1-switches-score-policy.test.js —— R3-D1（t2）集成测试。
 *
 * 覆盖：三开关（允许重交/次数、计分口径、答案可见性）题型默认值与持久化回显 /
 * 历史作业（未配置列）口径与行为不变 / 取最高·取最后 / 教师分不被机器分覆盖 /
 * 次数上限的明确文案（编程题路径 + 实训题路径，含判定顺序）。
 *
 * 数据自建自清（r3d1_ 前缀），不依赖 setup seed 之外的既有数据。
 */
import prisma from '../../src/utils/prisma.js';
import { request, loginAsTeacher, loginAsStudent, getTestData } from './helpers.js';
import { submitProjectCore } from '../../src/interface/http/controllers/student/project-submit.js';

const PREFIX = 'r3d1_';
const DAY = 86400000;
const now = () => Date.now();

let td;
let teacherToken;
let qCode;
let qProj;
const assignmentIds = [];
const questionIds = [];

function tReq() {
  return {
    get: (u) => request().get(u).set('Authorization', 'Bearer ' + teacherToken),
    post: (u, b) => request().post(u).send(b).set('Authorization', 'Bearer ' + teacherToken),
  };
}

function sReq(token) {
  return {
    get: (u) => request().get(u).set('Authorization', 'Bearer ' + token),
    post: (u, b) => request().post(u).send(b).set('Authorization', 'Bearer ' + token),
  };
}

/** 经教师接口建作业（走题型默认值判定路径） */
async function createViaApi(body) {
  const res = await tReq().post('/api/teacher/assignments', {
    title: PREFIX + (body.title || 'a') + '_' + Math.random().toString(36).slice(2, 7),
    startTime: new Date(now() - DAY).toISOString(),
    endTime: new Date(now() + DAY).toISOString(),
    classIds: [td.classId],
    ...body,
  });
  if (res.body?.data?.id) assignmentIds.push(res.body.data.id);
  return res;
}

/** 直接建作业（不传开关列 ⇒ 走 DB 默认值，等价于「迁移前的历史作业」） */
async function createRaw({ title, questionId, ...switches }) {
  const a = await prisma.assignment.create({
    data: {
      teacherId: td.teacherId,
      title: PREFIX + title,
      startTime: new Date(now() - DAY),
      endTime: new Date(now() + DAY),
      ...switches,
      assignmentQuestions: { create: [{ questionId, sortOrder: 1 }] },
      assignmentClasses: { create: { classId: td.classId } },
    },
  });
  assignmentIds.push(a.id);
  return a;
}

/** 直接落一条提交行（避免触发真实评分链路） */
function mkSubmission(assignmentId, studentId, questionId, fields) {
  return prisma.submission.create({
    data: { assignmentId, studentId, questionId, answer: 'r3d1', submittedAt: new Date(), ...fields },
  });
}

/** 学生端作业详情里该题的可见行 */
async function studentRow(studentName, assignmentId, questionId) {
  const token = await loginAsStudent(studentName);
  const res = await sReq(token).get('/api/student/assignments/' + assignmentId);
  expect(res.body.code).toBe(0);
  return res.body.data.submissions.find((s) => s.questionId === questionId);
}

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
}

beforeAll(async () => {
  td = getTestData();
  teacherToken = await loginAsTeacher();
  qCode = await prisma.question.create({
    data: { teacherId: td.teacherId, title: PREFIX + '编程题', maxScore: 100, difficulty: 'easy', type: 'code' },
  });
  qProj = await prisma.question.create({
    data: { teacherId: td.teacherId, title: PREFIX + '实训题', maxScore: 100, difficulty: 'medium', type: 'project', material: PREFIX + '实训材料' },
  });
  questionIds.push(qCode.id, qProj.id);
});

afterAll(async () => {
  await prisma.submission.deleteMany({ where: { questionId: { in: questionIds } } });
  await prisma.assignmentQuestion.deleteMany({ where: { questionId: { in: questionIds } } });
  await prisma.assignmentClass.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
  await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
  await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
});

describe('R3-D1 三开关：题型默认值与持久化（US-B1）', () => {
  it('编程题默认：允许重交 + 不限次 + 取最高 + 提交后可见，且详情/列表可回显', async () => {
    const res = await createViaApi({ title: 'prog', questionIds: [qCode.id] });
    expect(res.body.code).toBe(0);
    expect(res.body.data).toMatchObject({
      scorePolicy: 'best', answerVisibility: 'immediate', allowResubmit: true, maxAttempts: null,
    });
    const id = res.body.data.id;

    const detail = await tReq().get('/api/teacher/assignments/' + id);
    expect(detail.body.data).toMatchObject({ scorePolicy: 'best', answerVisibility: 'immediate', maxAttempts: null });

    const list = await tReq().get('/api/teacher/assignments?page=1&pageSize=100');
    const row = list.body.data.list.find((a) => a.id === id);
    expect(row).toMatchObject({ scorePolicy: 'best', answerVisibility: 'immediate', allowResubmit: true, maxAttempts: null });
  });

  it('实训题默认：1 次 + 取最后 + 发布后可见', async () => {
    const res = await createViaApi({ title: 'proj', questionIds: [qProj.id], confirmWithoutStandardPackage: true });
    expect(res.body.code).toBe(0);
    expect(res.body.data).toMatchObject({
      scorePolicy: 'last', answerVisibility: 'after_publish', allowResubmit: true, maxAttempts: 1,
    });
    const row = await prisma.assignment.findUnique({ where: { id: res.body.data.id } });
    expect(row.scorePolicy).toBe('last');
    expect(row.answerVisibility).toBe('after_publish');
    expect(row.maxAttempts).toBe(1);
  });

  it('教师显式传值优先于题型默认值（可改）', async () => {
    const res = await createViaApi({
      title: 'explicit', questionIds: [qProj.id], confirmWithoutStandardPackage: true,
      scorePolicy: 'best', answerVisibility: 'immediate', maxAttempts: 3, allowResubmit: false,
    });
    expect(res.body.code).toBe(0);
    expect(res.body.data).toMatchObject({
      scorePolicy: 'best', answerVisibility: 'immediate', maxAttempts: 3, allowResubmit: false,
    });
  });

  it('历史作业（未配置新列）⇒ 列默认值 = 既有行为（取最后 / 发布后可见）', async () => {
    const a = await createRaw({ title: 'legacy', questionId: qCode.id });
    const row = await prisma.assignment.findUnique({ where: { id: a.id } });
    expect(row.scorePolicy).toBe('last');
    expect(row.answerVisibility).toBe('after_publish');
    expect(row.maxAttempts).toBeNull();
    expect(row.allowResubmit).toBe(false);
  });
});

describe('R3-D1 计分口径：接口返回按口径折算机器分（US-B4）', () => {
  it('口径=取最高 ⇒ 该题机器分用 bestScore（85，而非最新 78）', async () => {
    const a = await createRaw({ title: 'bestcase', questionId: qCode.id, scorePolicy: 'best', answerVisibility: 'immediate' });
    await mkSubmission(a.id, td.studentIds[0], qCode.id, { status: 'published', aiScore: 78, bestScore: 85, attemptCount: 3 });

    const row = await studentRow('test_stu_01', a.id, qCode.id);
    expect(row.finalScore).toBe(85);
    expect(row.bestScore).toBe(85);

    const scores = await sReq(await loginAsStudent('test_stu_01')).get('/api/student/scores');
    const agg = scores.body.data.find((d) => d.assignmentId === a.id);
    expect(agg.totalScore).toBe(85);
    expect(agg.subItems[0].score).toBe(85);
  });

  it('口径=取最后 ⇒ 该题机器分用最新 aiScore（78，而非历次最高 85）', async () => {
    const a = await createRaw({ title: 'lastcase', questionId: qCode.id, scorePolicy: 'last' });
    await mkSubmission(a.id, td.studentIds[1], qCode.id, { status: 'published', aiScore: 78, bestScore: 85, attemptCount: 3 });
    const row = await studentRow('test_stu_02', a.id, qCode.id);
    expect(row.finalScore).toBe(78);
  });

  it('历史作业未配置口径 ⇒ 取最后（finalScore ?? aiScore 与改动前逐字等价）', async () => {
    const a = await createRaw({ title: 'legacycase', questionId: qCode.id });
    await mkSubmission(a.id, td.studentIds[0], qCode.id, { status: 'published', aiScore: 70, bestScore: 90, attemptCount: 2 });
    const row = await studentRow('test_stu_01', a.id, qCode.id);
    expect(row.finalScore).toBe(70);
    expect(row.bestScore).toBe(90);
  });

  it('US-B4 AC3：教师 finalScore 不被机器分覆盖（换分/重交后仍为教师分）', async () => {
    const a = await createRaw({ title: 'teacherwins', questionId: qCode.id, scorePolicy: 'best', allowResubmit: true, maxAttempts: null });
    const sub = await mkSubmission(a.id, td.studentIds[2], qCode.id, { status: 'published', aiScore: 78, bestScore: 85, finalScore: 90, teacherFeedback: 'r3d1 教师评语', attemptCount: 1 });

    const before = await studentRow('test_stu_03', a.id, qCode.id);
    expect(before.finalScore).toBe(90);

    // 模拟下一轮机器评分写回（aiScore/bestScore 变化）⇒ 教师分不变
    await prisma.submission.update({ where: { id: sub.id }, data: { aiScore: 60, bestScore: 85 } });
    const afterRegrade = await studentRow('test_stu_03', a.id, qCode.id);
    expect(afterRegrade.finalScore).toBe(90);

    // 学生再次提交（允许重交 + 不限次）⇒ use-cases 不写 finalScore，教师分保留
    const token = await loginAsStudent('test_stu_03');
    const res = await sReq(token).post('/api/student/assignments/' + a.id + '/submit', { questionId: qCode.id, answer: 'again' });
    expect(res.body.code).toBe(0);
    const fresh = await prisma.submission.findUnique({ where: { id: sub.id } });
    expect(fresh.finalScore).toBe(90);
    expect(fresh.teacherFeedback).toBe('r3d1 教师评语');
  });
});

describe('R3-D1 次数上限拦截与文案（US-C2）', () => {
  it('编程题路径：次数=1，第 2 次提交被拒且文案为「已达提交次数上限」', async () => {
    const res = await createViaApi({ title: 'limitprog', questionIds: [qCode.id], maxAttempts: 1, allowResubmit: true });
    expect(res.body.code).toBe(0);
    const token = await loginAsStudent('test_stu_02');
    const post = (answer) => sReq(token).post('/api/student/assignments/' + res.body.data.id + '/submit', { questionId: qCode.id, answer });

    const first = await post('first');
    expect(first.body.code).toBe(0);
    const second = await post('second');
    expect(second.body.code).not.toBe(0);
    expect(second.body.message).toContain('已达提交次数上限');
    expect(second.body.message).toContain('1');
  });

  it('实训题路径：显式次数上限优先于 allowResubmit ⇒ 文案为「已达提交次数上限」', async () => {
    const a = await createRaw({ title: 'limitproj', questionId: qProj.id, maxAttempts: 1, allowResubmit: false });
    const stu = td.studentIds[2];
    await mkSubmission(a.id, stu, qProj.id, { status: 'submitted', attemptCount: 1 });

    const res = fakeRes();
    await submitProjectCore(
      { params: { assignmentId: String(a.id), questionId: String(qProj.id) }, user: { id: stu }, file: { buffer: Buffer.alloc(0), originalname: 'x.zip' } },
      res,
    );
    // 次数上限校验在解压之前短路返回 ⇒ 不会触发评分链路
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe('已达提交次数上限（最多 1 次）');
  });

  it('实训题路径：未配置次数上限时保留既有文案「该作业不允许重复提交」', async () => {
    const a = await createRaw({ title: 'legacylimit', questionId: qProj.id, allowResubmit: false });
    const stu = td.studentIds[1];
    await mkSubmission(a.id, stu, qProj.id, { status: 'submitted', attemptCount: 1 });

    const res = fakeRes();
    await submitProjectCore(
      { params: { assignmentId: String(a.id), questionId: String(qProj.id) }, user: { id: stu }, file: { buffer: Buffer.alloc(0), originalname: 'x.zip' } },
      res,
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe('该作业不允许重复提交');
  });
});
