/**
 * r3-d11-submit-question-validation.test.js —— R3-D11（t20 / F-E2E-1）回归：
 *   提交接口对【非法/缺失 questionId】与【不属于该题目的小题】必须返回 400 + 可读文案，
 *   不得 500、不得泄漏 Prisma/内部错误文本（原实现：NaN 传进 Prisma ⇒ 500 + 'Argument questionId is missing'）。
 *
 * 同时锁定「正常提交路径行为不变」：合法提交 200；允许重交 ⇒ 第二次仍 200 且 attemptCount 递增。
 * 数据自建自清（r3d11_ 前缀）。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 'r3d11_';
const DAY = 86400000;
const now = () => Date.now();

let school, cls, teacher, stu, tokStu;
let qIn, qOut, sqIn, sqOut, asg;

async function login(username) {
  const res = await request().post('/api/auth/login').send({ username, password: username });
  if (res.body.code !== 0) throw new Error('登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

const submit = (body) => request()
  .post('/api/student/assignments/' + asg.id + '/submit')
  .set('Authorization', 'Bearer ' + tokStu)
  .send(body);

const draft = (body) => request()
  .put('/api/student/assignments/' + asg.id + '/draft')
  .set('Authorization', 'Bearer ' + tokStu)
  .send(body);

const rowsFor = (questionId) => prisma.submission.findMany({ where: { assignmentId: asg.id, studentId: stu.id, questionId } });

async function purge() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  const schools = await prisma.school.findMany({ where: { officialCode: '29711' }, select: { id: true } });
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

beforeAll(async () => {
  await purge();
  school = await prisma.school.create({ data: { name: PREFIX + 'school', officialCode: '29711' } });
  cls = await prisma.class.create({ data: { name: PREFIX + 'class', schoolId: school.id } });
  teacher = await prisma.user.create({ data: { username: PREFIX + 'teacher', password: bcrypt.hashSync(PREFIX + 'teacher', 10), realName: 'D11教师', role: 'teacher' } });
  stu = await prisma.user.create({ data: { username: PREFIX + 'stu', password: bcrypt.hashSync(PREFIX + 'stu', 10), realName: 'D11学生', role: 'student' } });
  await prisma.teacherSchool.create({ data: { teacherId: teacher.id, schoolId: school.id } });
  await prisma.teacherClass.create({ data: { teacherId: teacher.id, classId: cls.id } });
  await prisma.studentClass.create({ data: { studentId: stu.id, classId: cls.id } });
  qIn = await prisma.question.create({ data: { teacherId: teacher.id, title: PREFIX + '在作业内', maxScore: 100, difficulty: 'medium', type: 'code' } });
  qOut = await prisma.question.create({ data: { teacherId: teacher.id, title: PREFIX + '不在作业内', maxScore: 100, difficulty: 'medium', type: 'code' } });
  sqIn = await prisma.subQuestion.create({ data: { questionId: qIn.id, title: '小题A', type: 'code', score: 50, content: 'A', referenceAnswer: 'A', language: 'java' } });
  sqOut = await prisma.subQuestion.create({ data: { questionId: qOut.id, title: '小题B', type: 'code', score: 50, content: 'B', referenceAnswer: 'B', language: 'java' } });
  // 作业只投放 qIn（qOut 不属于该作业；sqOut 属于 qOut）
  asg = await prisma.assignment.create({
    data: {
      teacherId: teacher.id, title: PREFIX + '作业',
      startTime: new Date(now() - DAY), endTime: new Date(now() + DAY),
      allowResubmit: true, maxAttempts: null, scorePolicy: 'best', answerVisibility: 'after_publish',
      assignmentQuestions: { create: [{ questionId: qIn.id, sortOrder: 1 }] },
      assignmentClasses: { create: [{ classId: cls.id }] },
    },
  });
  tokStu = await login(stu.username);
}, 60000);

afterAll(async () => { await purge(); }, 60000);

describe('R3-D11 提交入参校验（F-E2E-1）', () => {
  it('① 缺 questionId ⇒ 400 +「题目不存在或不属于该作业」，无 500、无 Prisma 文本', async () => {
    const res = await submit({ answer: 'x' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 1001, message: '题目不存在或不属于该作业', data: null });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/prisma|Prisma|invocation|Argument|questionId is missing|NaN/i);
    expect(await prisma.submission.count({ where: { assignmentId: asg.id, studentId: stu.id } })).toBe(0);
  });

  it('② questionId 不属于该作业 ⇒ 400 + 同一文案，且不落库', async () => {
    const res = await submit({ questionId: qOut.id, answer: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('题目不存在或不属于该作业');
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|invocation|Argument/i);
    expect(await rowsFor(qOut.id)).toHaveLength(0);
  });

  it('③ subQuestionId 不属于该题目 ⇒ 400 +「小题不存在或不属于该题目」，且不落库', async () => {
    const res = await submit({ questionId: qIn.id, subQuestionId: sqOut.id, answer: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('小题不存在或不属于该题目');
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|invocation|Argument/i);
    expect(await rowsFor(qIn.id)).toHaveLength(0);
  });

  it('④ questionId 非数字 → 400 可读文案（不触达 Prisma）', async () => {
    const res = await submit({ questionId: 'abc', answer: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('题目不存在或不属于该作业');
  });

  it('⑤ 草稿接口同样校验（缺 questionId ⇒ 400）', async () => {
    const res = await draft({ answer: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('题目不存在或不属于该作业');
  });

  it('⑥ 正常路径行为不变：合法提交 200；允许重交 ⇒ 二次提交 200 且 attemptCount 递增', async () => {
    const first = await submit({ questionId: qIn.id, answer: 'code-1' });
    expect(first.status).toBe(200);
    expect(first.body.message).toBe('提交成功');
    const second = await submit({ questionId: String(qIn.id), answer: 'code-2' });
    expect(second.status).toBe(200);
    const row = (await rowsFor(qIn.id))[0];
    expect(row.attemptCount).toBe(2);
    expect(row.answer).toBe('code-2');
  });

  it('⑦ 合法小题提交：subQuestionId 属于该题目 ⇒ 200 且落库携带 subQuestionId', async () => {
    await prisma.submission.deleteMany({ where: { assignmentId: asg.id, studentId: stu.id } });
    const res = await submit({ questionId: qIn.id, subQuestionId: sqIn.id, answer: 'sub-1' });
    expect(res.status).toBe(200);
    const row = await prisma.submission.findFirst({ where: { assignmentId: asg.id, studentId: stu.id, questionId: qIn.id } });
    expect(row.subQuestionId).toBe(sqIn.id);
  });
});
