/**
 * tc-b0 · lockAssignment 契约测试（step 9 · B0，打靶 plan §5.3 Z2）
 *
 * 目标：钉住 PUT /api/teacher/assignments/:id/lock（源 :792-809）。
 * 断言口径 = 状态码 + 响应体形状（含 code 与中文文案逐字）+ DB 终态 locked；
 * 覆盖 404 / 403（:797 teacherId 不符，且必须零写入）/ 连续两次调用的三元两态（'已锁定' / '已解锁'）。
 *
 * 夹具自建自清（tcb_ 前缀，独立学校院校代码 29611/29612），不依赖 setup seed。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 'tcb_';
const CODE_A = '29611';
const CODE_B = '29612';

let sA, sB, tA, tB, aOwn, aOther, tokenA, tokenB;

async function purge() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const userIds = users.map(u => u.id);
  const schools = await prisma.school.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const schoolIds = schools.map(s => s.id);
  const assignments = await prisma.assignment.findMany({
    where: { OR: [{ title: { startsWith: PREFIX } }, { teacherId: { in: userIds } }] },
    select: { id: true },
  });
  const assignmentIds = assignments.map(a => a.id);

  await prisma.submission.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
  await prisma.assignmentQuestion.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
  await prisma.assignmentClass.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
  await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
  await prisma.teacherClass.deleteMany({ where: { teacherId: { in: userIds } } });
  await prisma.teacherSchool.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
}

const mkTeacher = (name, realName) => prisma.user.create({
  data: { username: PREFIX + name, password: bcrypt.hashSync(PREFIX + name, 10), realName, role: 'teacher' },
});
const mkAsg = (teacherId, title) => prisma.assignment.create({
  data: { teacherId, title, mode: 'exam', startTime: new Date('2026-01-01'), endTime: new Date('2027-01-01') },
});

async function seed() {
  await purge();
  sA = await prisma.school.create({ data: { name: PREFIX + 'school_a', officialCode: CODE_A } });
  sB = await prisma.school.create({ data: { name: PREFIX + 'school_b', officialCode: CODE_B } });
  tA = await mkTeacher('teacher_a', 'tcb教师A');
  tB = await mkTeacher('teacher_b', 'tcb教师B');
  await prisma.teacherSchool.createMany({ data: [
    { teacherId: tA.id, schoolId: sA.id },
    { teacherId: tB.id, schoolId: sB.id },
  ] });
  aOwn = await mkAsg(tA.id, PREFIX + 'asg_own');
  aOther = await mkAsg(tB.id, PREFIX + 'asg_other');
  tokenA = await login('teacher_a');
  tokenB = await login('teacher_b');
}

async function login(name) {
  const res = await request().post('/api/auth/login').send({ username: PREFIX + name, password: PREFIX + name });
  if (res.body.code !== 0) throw new Error('登录失败 ' + name + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

const lock = (token, id, body) => request().put('/api/teacher/assignments/' + id + '/lock')
  .send(body ?? {}).set('Authorization', 'Bearer ' + token);
const lockedOf = async (id) => (await prisma.assignment.findUnique({ where: { id }, select: { locked: true } })).locked;

beforeAll(async () => { await seed(); }, 60000);
afterAll(async () => { await purge(); }, 60000);

describe('T-B · PUT /api/teacher/assignments/:id/lock（Z2 契约）', () => {
  it('T-B1 作业不存在 → 404 作业不存在', async () => {
    const res = await lock(tokenA, 999999999, {});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 1004, message: '作业不存在', data: null });
  });

  it('T-B2 他人作业 → 403 无权操作，且 locked 不变（零写入）', async () => {
    const before = await lockedOf(aOther.id);
    expect(before).toBe(false);
    const res = await lock(tokenA, aOther.id, {});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 1003, message: '无权操作', data: null });
    expect(await lockedOf(aOther.id)).toBe(false);
  });

  it('T-B3 本人作业连续两次 → 已锁定 / 已解锁（三元两态 + DB 回读）', async () => {
    const first = await lock(tokenA, aOwn.id, {});
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ code: 0, message: '已锁定', data: { id: aOwn.id, locked: true } });
    expect(await lockedOf(aOwn.id)).toBe(true);

    const second = await lock(tokenA, aOwn.id, {});
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ code: 0, message: '已解锁', data: { id: aOwn.id, locked: false } });
    expect(await lockedOf(aOwn.id)).toBe(false);
  });
});
