/**
 * r3-d12-teacher-submissions-filter.test.js —— R3-D12（t22 / O-E2E-1）回归：
 *   GET /api/teacher/submissions 的 assignmentId 过滤曾静默失效（list.js 解构漏取 + 未传给 buildFilter）
 *   ⇒ 带/不带过滤返回同一批数据。本文件锁定三种请求形态：
 *     ① 带 assignmentId ⇒ 只含该作业提交（且不含另一作业）
 *     ② 带 classId     ⇒ 只含该班学生提交（另一班排除）
 *     ③ 不带过滤       ⇒ 仍返回该教师可见范围内的提交（含两个作业，行为不变）
 *   另加组合负例：assignmentId=A + classId=另一个班 ⇒ 空集（证明两个过滤都真正生效，而非「过滤到空」）。
 * 数据自建自清（r3d12_ 前缀）。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 'r3d12_';
const DAY = 86400000;
const now = () => Date.now();

let school, clsA, clsB, teacher, stuA, stuB, q1, q2, asgA, asgB, tokTeacher;

async function login(username) {
  const res = await request().post('/api/auth/login').send({ username, password: username });
  if (res.body.code !== 0) throw new Error('登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

const listSubs = async (query = '') => {
  const res = await request().get('/api/teacher/submissions?pageSize=100' + query).set('Authorization', 'Bearer ' + tokTeacher);
  if (res.body.code !== 0) throw new Error('列表失败: ' + JSON.stringify(res.body));
  return res.body.data;
};

const assignmentIds = (data) => [...new Set(data.list.map((s) => s.assignment.id))].sort();

async function purge() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  const schools = await prisma.school.findMany({ where: { officialCode: '29721' }, select: { id: true } });
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

async function mkAssignment(title, questionId, classIds) {
  return prisma.assignment.create({
    data: {
      teacherId: teacher.id, title: PREFIX + title,
      startTime: new Date(now() - DAY), endTime: new Date(now() + DAY),
      allowResubmit: true, maxAttempts: null, scorePolicy: 'best', answerVisibility: 'after_publish',
      assignmentQuestions: { create: [{ questionId, sortOrder: 1 }] },
      assignmentClasses: { create: classIds.map((classId) => ({ classId })) },
    },
  });
}

beforeAll(async () => {
  await purge();
  school = await prisma.school.create({ data: { name: PREFIX + 'school', officialCode: '29721' } });
  clsA = await prisma.class.create({ data: { name: PREFIX + 'A班', schoolId: school.id } });
  clsB = await prisma.class.create({ data: { name: PREFIX + 'B班', schoolId: school.id } });
  teacher = await prisma.user.create({ data: { username: PREFIX + 'teacher', password: bcrypt.hashSync(PREFIX + 'teacher', 10), realName: 'D12教师', role: 'teacher' } });
  stuA = await prisma.user.create({ data: { username: PREFIX + 'stuA', password: bcrypt.hashSync(PREFIX + 'stuA', 10), realName: 'D12学生A', role: 'student' } });
  stuB = await prisma.user.create({ data: { username: PREFIX + 'stuB', password: bcrypt.hashSync(PREFIX + 'stuB', 10), realName: 'D12学生B', role: 'student' } });
  await prisma.teacherSchool.create({ data: { teacherId: teacher.id, schoolId: school.id } });
  await prisma.teacherClass.create({ data: { teacherId: teacher.id, classId: clsA.id } });
  await prisma.teacherClass.create({ data: { teacherId: teacher.id, classId: clsB.id } });
  await prisma.studentClass.create({ data: { studentId: stuA.id, classId: clsA.id } });
  await prisma.studentClass.create({ data: { studentId: stuB.id, classId: clsB.id } });
  q1 = await prisma.question.create({ data: { teacherId: teacher.id, title: PREFIX + '题1', maxScore: 100, difficulty: 'medium', type: 'code' } });
  q2 = await prisma.question.create({ data: { teacherId: teacher.id, title: PREFIX + '题2', maxScore: 100, difficulty: 'medium', type: 'code' } });
  // 作业 A：投放 A 班（+B 班也投放，便于组合负例）；作业 B：只投放 B 班
  asgA = await mkAssignment('作业A', q1.id, [clsA.id, clsB.id]);
  asgB = await mkAssignment('作业B', q2.id, [clsB.id]);
  // 提交：A 班学生在作业 A 交 1 次；B 班学生在作业 A 与作业 B 各交 1 次
  await prisma.submission.create({ data: { assignmentId: asgA.id, studentId: stuA.id, questionId: q1.id, answer: 'a-1', status: 'submitted', attemptCount: 1, submittedAt: new Date() } });
  await prisma.submission.create({ data: { assignmentId: asgA.id, studentId: stuB.id, questionId: q1.id, answer: 'a-2', status: 'submitted', attemptCount: 1, submittedAt: new Date() } });
  await prisma.submission.create({ data: { assignmentId: asgB.id, studentId: stuB.id, questionId: q2.id, answer: 'b-1', status: 'submitted', attemptCount: 1, submittedAt: new Date() } });
  tokTeacher = await login(teacher.username);
}, 60000);

afterAll(async () => { await purge(); }, 60000);

describe('R3-D12 教师提交列表过滤（O-E2E-1）', () => {
  it('① 带 assignmentId=作业A ⇒ 只含作业 A 的提交（total=2，不含作业 B）', async () => {
    const data = await listSubs('&assignmentId=' + asgA.id);
    expect(data.total).toBe(2);
    expect(data.list).toHaveLength(2);
    expect(assignmentIds(data)).toEqual([asgA.id]);
    expect(data.list.every((s) => s.assignment.id === asgA.id)).toBe(true);
  });

  it('② 带 assignmentId=作业B ⇒ 只含作业 B 的提交（total=1，不含作业 A 的任何行）', async () => {
    const data = await listSubs('&assignmentId=' + asgB.id);
    expect(data.total).toBe(1);
    expect(data.list).toHaveLength(1);
    expect(assignmentIds(data)).toEqual([asgB.id]);
    expect(data.list[0].assignment.id).toBe(asgB.id);
  });

  it('③ 不带过滤 ⇒ 维持既有行为：返回可见范围内全部提交（含 A、B 两个作业，total=3）', async () => {
    const data = await listSubs();
    expect(data.total).toBe(3);
    expect(assignmentIds(data)).toEqual([asgA.id, asgB.id].sort());
  });

  it('④ 带 classId=A 班 ⇒ 只含 A 班学生提交（作业 B 的 B 班提交被排除）', async () => {
    const data = await listSubs('&classId=' + clsA.id);
    expect(data.total).toBe(1);
    expect(data.list).toHaveLength(1);
    expect(data.list[0].student.id).toBe(stuA.id);
    expect(data.list[0].assignment.id).toBe(asgA.id);
  });

  it('⑤ 组合负例：assignmentId=作业A + classId=B 班 ⇒ 只含 B 班在 A 的提交（1 条，非空；证明两过滤真正生效）', async () => {
    const data = await listSubs('&assignmentId=' + asgA.id + '&classId=' + clsB.id);
    expect(data.total).toBe(1);
    expect(data.list[0].student.id).toBe(stuB.id);
    expect(data.list[0].assignment.id).toBe(asgA.id);
  });

  it('⑥ 组合负例：assignmentId=作业B + classId=A 班 ⇒ 空集（B 作业没有 A 班提交）', async () => {
    const data = await listSubs('&assignmentId=' + asgB.id + '&classId=' + clsA.id);
    expect(data.total).toBe(0);
    expect(data.list).toHaveLength(0);
  });
});
