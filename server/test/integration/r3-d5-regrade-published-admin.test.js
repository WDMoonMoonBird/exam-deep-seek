/**
 * r3-d5-regrade-published-admin.test.js —— R3-D5（t12）后端三处修复的集成验证：
 *
 *   G3（US-A2 AC2）：已发布提交改分后**保持 published**，学生端即时可见新 finalScore
 *      （覆盖实训题 /project/review、编程题 /review 与 /score 三条改分链路；含改分前后状态对比）。
 *   G2：非法分值（非数字 / NaN / 小数 / 负 / 超满分）→ 400 + 可读文案（不再 500、不再静默夹取）。
 *   G5（US-A3 AC2）：管理员可对**任意班级**的实训提交重评/改分（/api/admin/...，super_admin 鉴权链）。
 *   ④ 可见性对齐：同班级的非作业所属教师（团队/直连可见）可查看与审核；不可见教师仍 403 且零写入。
 *
 * 数据自建自清（r3d5_ 前缀），不依赖 setup seed 之外的既有数据。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';
import { ABNORMAL_FEEDBACK } from '../../src/constants.js';

const PREFIX = 'r3d5_';
const DAY = 86400000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let schoolA, schoolB, clsA, clsB, teacherA, teacherPeer, teacherOut, admin, stuA, stuB;
let qProj, qCode, qProjB, asgProj, asgCode, asgOther, subPub, subProgPub, subOtherProj, sqCode;
let tokA, tokPeer, tokOut, tokAdmin, tokStuA;

const mkUser = (username, realName, role) => prisma.user.create({
  data: { username, password: bcrypt.hashSync(username, 10), realName, role },
});

async function login(username) {
  const res = await request().post('/api/auth/login').send({ username, password: username });
  if (res.body.code !== 0) throw new Error('登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

const auth = (token) => ({
  get: (u) => request().get(u).set('Authorization', 'Bearer ' + token),
  put: (u, b) => request().put(u).send(b).set('Authorization', 'Bearer ' + token),
  post: (u, b) => request().post(u).send(b).set('Authorization', 'Bearer ' + token),
});

const envelope = () => JSON.stringify({
  kind: 'project', currentVersion: 1, history: [],
  grading: { state: 'done', version: 1, startedAt: null, finishedAt: null, error: null },
});

const DB = (id) => prisma.submission.findUnique({ where: { id } });
const studentRow = async (assignmentId, questionId) => {
  const res = await auth(tokStuA).get('/api/student/assignments/' + assignmentId);
  expect(res.body.code).toBe(0);
  return res.body.data.submissions.find((s) => s.questionId === questionId);
};

async function seed() {
  schoolA = await prisma.school.create({ data: { name: PREFIX + 'schA', officialCode: '29801' } });
  schoolB = await prisma.school.create({ data: { name: PREFIX + 'schB', officialCode: '29802' } });
  clsA = await prisma.class.create({ data: { name: PREFIX + 'clsA', schoolId: schoolA.id } });
  clsB = await prisma.class.create({ data: { name: PREFIX + 'clsB', schoolId: schoolB.id } });
  teacherA = await mkUser(PREFIX + 'teacher', 'D5作业所属教师', 'teacher');
  teacherPeer = await mkUser(PREFIX + 'peer', 'D5同班他师', 'teacher');
  teacherOut = await mkUser(PREFIX + 'out', 'D5同校不可见师', 'teacher');
  admin = await mkUser(PREFIX + 'admin', 'D5管理员', 'super_admin');
  stuA = await mkUser(PREFIX + 'stu_a', 'D5学生A', 'student');
  stuB = await mkUser(PREFIX + 'stu_b', 'D5学生B', 'student');
  await prisma.teacherSchool.createMany({ data: [
    { teacherId: teacherA.id, schoolId: schoolA.id },
    { teacherId: teacherPeer.id, schoolId: schoolA.id },
    { teacherId: teacherOut.id, schoolId: schoolA.id },
  ] });
  // teacherA 与 teacherPeer 都可见 clsA（peer 可见但**不是**作业所属教师）；teacherOut 同校但不可见 clsA
  await prisma.teacherClass.createMany({ data: [
    { teacherId: teacherA.id, classId: clsA.id },
    { teacherId: teacherPeer.id, classId: clsA.id },
  ] });
  await prisma.studentClass.createMany({ data: [
    { studentId: stuA.id, classId: clsA.id },
    { studentId: stuB.id, classId: clsB.id },
  ] });

  qProj = await prisma.question.create({ data: { teacherId: teacherA.id, title: PREFIX + '实训题', maxScore: 100, difficulty: 'medium', type: 'project' } });
  qProjB = await prisma.question.create({ data: { teacherId: teacherA.id, title: PREFIX + '实训题B', maxScore: 100, difficulty: 'medium', type: 'project' } });
  qCode = await prisma.question.create({
    data: { teacherId: teacherA.id, title: PREFIX + '编程题', maxScore: 100, difficulty: 'easy', type: 'code',
      subQuestions: { create: [{ sortOrder: 1, title: '小题', content: '<p>c</p>', referenceAnswer: 'x', language: 'python', score: 100 }] } },
    include: { subQuestions: true },
  });
  sqCode = qCode.subQuestions[0].id;

  const mkAsg = (title, questionId, classId) => prisma.assignment.create({
    data: { teacherId: teacherA.id, title: PREFIX + title, startTime: new Date(Date.now() - DAY), endTime: new Date(Date.now() + DAY),
      assignmentQuestions: { create: [{ questionId, sortOrder: 1 }] },
      assignmentClasses: { create: [{ classId }] } },
  });
  asgProj = await mkAsg('作业实训', qProj.id, clsA.id);
  asgCode = await mkAsg('作业编程', qCode.id, clsA.id);
  asgOther = await mkAsg('作业B班实训', qProjB.id, clsB.id);

  subPub = await prisma.submission.create({ data: {
    assignmentId: asgProj.id, studentId: stuA.id, questionId: qProj.id, answer: envelope(),
    status: 'published', aiScore: 75, finalScore: 80, teacherFeedback: '初评', attemptCount: 1, submittedAt: new Date(),
  } });
  subProgPub = await prisma.submission.create({ data: {
    assignmentId: asgCode.id, studentId: stuA.id, questionId: qCode.id, subQuestionId: sqCode, answer: 'print(1)',
    status: 'published', aiScore: 65, finalScore: 70, teacherFeedback: '编程初评', attemptCount: 1, submittedAt: new Date(),
  } });
  // B 校班级的实训提交：教师不可见，仅管理员可操作（G5「任意班级」）
  subOtherProj = await prisma.submission.create({ data: {
    assignmentId: asgOther.id, studentId: stuB.id, questionId: qProjB.id, answer: envelope(),
    status: 'ai_graded', aiScore: 60, attemptCount: 1, submittedAt: new Date(),
  } });

  tokA = await login(teacherA.username);
  tokPeer = await login(teacherPeer.username);
  tokOut = await login(teacherOut.username);
  tokAdmin = await login(admin.username);
  tokStuA = await login(stuA.username);
}

async function purge() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  const schools = await prisma.school.findMany({ where: { officialCode: { in: ['29801', '29802'] } }, select: { id: true } });
  const sids = schools.map((s) => s.id);
  const classes = await prisma.class.findMany({ where: { schoolId: { in: sids } }, select: { id: true } });
  const cids = classes.map((c) => c.id);
  const questions = await prisma.question.findMany({ where: { teacherId: { in: uids } }, select: { id: true } });
  const qids = questions.map((q) => q.id);
  const assignments = await prisma.assignment.findMany({ where: { teacherId: { in: uids } }, select: { id: true } });
  const aids = assignments.map((a) => a.id);
  await prisma.submission.deleteMany({ where: { OR: [{ questionId: { in: qids } }, { assignmentId: { in: aids } }] } });
  await prisma.assignmentQuestion.deleteMany({ where: { OR: [{ questionId: { in: qids } }, { assignmentId: { in: aids } }] } });
  await prisma.assignmentClass.deleteMany({ where: { OR: [{ assignmentId: { in: aids } }, { classId: { in: cids } }] } });
  await prisma.assignment.deleteMany({ where: { id: { in: aids } } });
  await prisma.subQuestion.deleteMany({ where: { questionId: { in: qids } } });
  await prisma.question.deleteMany({ where: { id: { in: qids } } });
  await prisma.studentClass.deleteMany({ where: { classId: { in: cids } } });
  await prisma.teacherClass.deleteMany({ where: { classId: { in: cids } } });
  await prisma.teacherSchool.deleteMany({ where: { schoolId: { in: sids } } });
  await prisma.class.deleteMany({ where: { id: { in: cids } } });
  await prisma.user.deleteMany({ where: { id: { in: uids } } });
  await prisma.school.deleteMany({ where: { id: { in: sids } } });
}

beforeAll(async () => { await purge(); await seed(); }, 60000);
afterAll(async () => { await purge(); }, 60000);

describe('R3-D5 G3：已发布提交改分后保持 published，学生端即时可见新分', () => {
  it('实训题 /project/review 改分：改分前学生见 80 → 改分后见 88，DB 仍 published', async () => {
    const before = await studentRow(asgProj.id, qProj.id);
    expect(before.status).toBe('published');
    expect(before.finalScore).toBe(80);

    const res = await auth(tokA).put('/api/teacher/submissions/' + subPub.id + '/project/review', { finalScore: 88, teacherFeedback: '改分后评语' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: 0, message: '审核成功' });
    expect(res.body.data).toMatchObject({ id: subPub.id, status: 'published', finalScore: 88, teacherFeedback: '改分后评语' });

    const row = await DB(subPub.id);
    expect(row.status).toBe('published');   // G3：不得打回 reviewed
    expect(row.finalScore).toBe(88);
    expect(row.reviewedAt).not.toBeNull();

    const after = await studentRow(asgProj.id, qProj.id);
    expect(after.status).toBe('published'); // 学生端仍看得到（旧实现此处变 reviewed ⇒ finalScore=null）
    expect(after.finalScore).toBe(88);
  });

  it('编程题 /review 与 /score 改分：状态保持 published，学生端可见新分', async () => {
    const r1 = await auth(tokA).put('/api/teacher/submissions/' + subProgPub.id + '/review', { finalScore: 92 });
    expect(r1.status).toBe(200);
    expect((await DB(subProgPub.id)).status).toBe('published');
    expect((await DB(subProgPub.id)).finalScore).toBe(92);
    expect((await studentRow(asgCode.id, qCode.id)).finalScore).toBe(92);

    const r2 = await auth(tokA).put('/api/teacher/submissions/' + subProgPub.id + '/score', { finalScore: 95 });
    expect(r2.status).toBe(200);
    const row = await DB(subProgPub.id);
    expect(row.status).toBe('published');   // manualAdjust 只在 ai_graded/submitted 时推进状态
    expect(row.finalScore).toBe(95);
    expect((await studentRow(asgCode.id, qCode.id)).finalScore).toBe(95);
  });
});

describe('R3-D5 G2：非法分值 400 + 可读文案（不再 500 / 不再静默夹取）', () => {
  it('实训题改分：非数字 / 超满分 / 负数 / 小数 → 400 且零写入', async () => {
    const before = await DB(subPub.id);
    // 注：JSON 无法表达 NaN ⇒ 用字符串 'NaN' 覆盖「输入无法转成有限数字」分支（Number('NaN') === NaN）
    const cases = ['abc', 'NaN', 150, -5, 85.5];
    for (const v of cases) {
      const res = await auth(tokA).put('/api/teacher/submissions/' + subPub.id + '/project/review', { finalScore: v, teacherFeedback: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
      expect(res.body.message).toContain('分数不合法');
    }
    const after = await DB(subPub.id);
    expect(after.finalScore).toBe(before.finalScore);
    expect(after.teacherFeedback).toBe(before.teacherFeedback);
    expect(after.status).toBe('published');
  });

  it('编程题 /score 与 /review：非法分值 → 400（原实现 NaN 落库 → 500）', async () => {
    const before = await DB(subProgPub.id);
    const bad = await auth(tokA).put('/api/teacher/submissions/' + subProgPub.id + '/score', { finalScore: 'abc' });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toContain('分数不合法');
    const over = await auth(tokA).put('/api/teacher/submissions/' + subProgPub.id + '/score', { finalScore: 1000 });
    expect(over.status).toBe(400);
    expect(over.body.message).toContain('分数不合法');
    const badReview = await auth(tokA).put('/api/teacher/submissions/' + subProgPub.id + '/review', { finalScore: 12.5 });
    expect(badReview.status).toBe(400);
    expect(badReview.body.message).toContain('分数不合法');
    const after = await DB(subProgPub.id);
    expect(after.finalScore).toBe(before.finalScore);
    expect(after.status).toBe(before.status);
  });
});

describe('R3-D5 ④：project.js 可见性对齐「可见班级」（越权仍 403）', () => {
  it('同班非作业所属教师（可见）⇒ 可查看 + 可审核（原实现 403「无权操作」）', async () => {
    const view = await auth(tokPeer).get('/api/teacher/submissions/' + subPub.id + '/project');
    expect(view.status).toBe(200);
    expect(view.body.code).toBe(0);

    const res = await auth(tokPeer).put('/api/teacher/submissions/' + subPub.id + '/project/review', { finalScore: 91, teacherFeedback: '同班他师复核' });
    expect(res.status).toBe(200);
    expect((await DB(subPub.id)).finalScore).toBe(91);
  });

  it('同校不可见教师 ⇒ 403「无权访问该提交」且零写入（越权反例）', async () => {
    const before = await DB(subPub.id);
    const view = await auth(tokOut).get('/api/teacher/submissions/' + subPub.id + '/project');
    expect(view.status).toBe(403);
    expect(view.body).toEqual({ code: 1003, message: '无权访问该提交', data: null });

    const res = await auth(tokOut).put('/api/teacher/submissions/' + subPub.id + '/project/review', { finalScore: 1 });
    expect(res.status).toBe(403);
    const after = await DB(subPub.id);
    expect(after.finalScore).toBe(before.finalScore);
    expect(after.status).toBe(before.status);
  });
});

describe('R3-D5 G5：管理员可重评/改分任意班级（教师不可越权走管理端点）', () => {
  it('管理员重评 B 校班级的实训提交 ⇒ 200（教师侧不可见）', async () => {
    const res = await auth(tokAdmin).post('/api/admin/submissions/' + subOtherProj.id + '/project/regrade');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: 0, message: '已重新触发评分', data: null });
    // 异步评分（无学生文件 ⇒ Worker 标记 failed 并恢复 prevStatus，见 project-regrade.test.js）
    await sleep(2500);
    const row = await DB(subOtherProj.id);
    expect(row.status).toBe('ai_graded');       // prevStatus 已恢复（未被降级/未误发布）
    // 本次无学生文件 ⇒ 既有 markFailed 落痕（aiScore=0 + ABNORMAL_FEEDBACK）：
    // 证明管理员与教师走的是**同一条**重评链路（异步 Worker 真实执行）
    expect(row.aiScore).toBe(0);
    expect(row.aiFeedback).toBe(ABNORMAL_FEEDBACK);
  });

  it('管理员改分任意班级 ⇒ 200 + 落库；教师走管理端点 ⇒ 403（super_admin 鉴权链）', async () => {
    const res = await auth(tokAdmin).put('/api/admin/submissions/' + subOtherProj.id + '/project/review', { finalScore: 66, teacherFeedback: '管理员复核' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: subOtherProj.id, status: 'reviewed', finalScore: 66, teacherFeedback: '管理员复核' });
    const row = await DB(subOtherProj.id);
    expect(row.finalScore).toBe(66);
    expect(row.status).toBe('reviewed');

    const denied = await auth(tokA).post('/api/admin/submissions/' + subOtherProj.id + '/project/regrade');
    expect([403, 1003]).toContain(denied.status === 403 ? 403 : denied.body.code);
    const deniedStudent = await auth(tokStuA).put('/api/admin/submissions/' + subOtherProj.id + '/project/review', { finalScore: 1 });
    expect(deniedStudent.status).toBe(403);
    expect((await DB(subOtherProj.id)).finalScore).toBe(66);   // 零写入
  });
});
