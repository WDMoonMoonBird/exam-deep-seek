/**
 * ★H3/H4（P0）回归断言：横向越权（BOLA）
 *   H3 非成员/跨校教师 GET /api/teacher/teams/:id      ⇒ **404**（与"不存在"同形状，不泄漏存在性）
 *   H4 非属主教师    GET /api/teacher/questions/:id/checker ⇒ **404**（不返回任何 checker 状态）
 *   各带一条正对照（成员本人/属主本人 200），证明 404 不是"接口坏了"。
 *
 * 注（实现口径，务必对齐）：H3 的判据是「**团队成员 ∨ 同校教师**」——
 *   同校教师的读取是**有意保留**的（同租户协作），因此"非成员⇒404"的可复算场景是**跨校非成员**。
 * 修复前（HEAD）：getTeam/getChecker 无归属过滤 ⇒ 200。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 'secp0_';
const CODE_A = '29951';
const CODE_B = '29952';
const TAG = PREFIX + Date.now() + '_';

let sA; let sB; let tA; let tB; let teamA; let qA; let tokenA; let tokenB;

async function purge() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  const teams = await prisma.team.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const tids = teams.map((t) => t.id);
  if (tids.length) await prisma.teamTeacher.deleteMany({ where: { teamId: { in: tids } } });
  if (uids.length) {
    await prisma.teamTeacher.deleteMany({ where: { teacherId: { in: uids } } });
    await prisma.question.deleteMany({ where: { teacherId: { in: uids } } });
  }
  await prisma.team.deleteMany({ where: { name: { startsWith: PREFIX } } });
  if (uids.length) {
    await prisma.teacherSchool.deleteMany({ where: { teacherId: { in: uids } } });
    await prisma.user.deleteMany({ where: { id: { in: uids } } });
  }
  const schools = await prisma.school.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  if (schools.length) {
    const sids = schools.map((s) => s.id);
    await prisma.team.deleteMany({ where: { schoolId: { in: sids } } });
    await prisma.school.deleteMany({ where: { id: { in: sids } } });
  }
}

async function login(username) {
  const res = await request().post('/api/auth/login').send({ username, password: username });
  if (res.body.code !== 0) throw new Error('夹具登录失败 ' + username + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

beforeAll(async () => {
  await purge();
  sA = await prisma.school.create({ data: { name: TAG + 'school_a', officialCode: CODE_A } });
  sB = await prisma.school.create({ data: { name: TAG + 'school_b', officialCode: CODE_B } });
  tA = await prisma.user.create({ data: { username: TAG + 'teacher_a', password: bcrypt.hashSync(TAG + 'teacher_a', 10), realName: 'SEC-P0 教师A', role: 'teacher' } });
  tB = await prisma.user.create({ data: { username: TAG + 'teacher_b', password: bcrypt.hashSync(TAG + 'teacher_b', 10), realName: 'SEC-P0 教师B', role: 'teacher' } });
  await prisma.teacherSchool.createMany({
    data: [{ teacherId: tA.id, schoolId: sA.id }, { teacherId: tB.id, schoolId: sB.id }],
  });
  teamA = await prisma.team.create({ data: { name: TAG + 'team_a', schoolId: sA.id, createdBy: tA.id } });
  await prisma.teamTeacher.create({ data: { teamId: teamA.id, teacherId: tA.id } });
  qA = await prisma.question.create({
    data: { teacherId: tA.id, title: TAG + 'q_project', type: 'project', difficulty: 'medium', material: 'SEC-P0 题干', maxScore: 100 },
  });
  tokenA = await login(TAG + 'teacher_a');
  tokenB = await login(TAG + 'teacher_b');
});

afterAll(async () => { await purge(); });

const asB = (url) => request().get(url).set('Authorization', 'Bearer ' + tokenB);
const asA = (url) => request().get(url).set('Authorization', 'Bearer ' + tokenA);

describe('★H3（P0）：getTeam 越权读团队 ⇒ 404', () => {
  it('H3-1 跨校非成员教师读他人团队 ⇒ 404 且不返回团队数据', async () => {
    const res = await asB('/api/teacher/teams/' + teamA.id);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1004);
    expect(res.body.data).toBeNull();
  });

  it('H3-2 越权 404 与「不存在」404 形状一致（不泄漏存在性）', async () => {
    const denied = await asB('/api/teacher/teams/' + teamA.id);
    const missing = await asB('/api/teacher/teams/999999999');
    expect(denied.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(denied.body).toEqual(missing.body);
  });

  it('H3-3 团队成员本人可读（正对照）', async () => {
    const res = await asA('/api/teacher/teams/' + teamA.id);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.id).toBe(teamA.id);
  });
});

describe('★H4（P0）：getChecker 越权读他人题目 ⇒ 404', () => {
  it('H4-1 非属主教师读他人题目评分器 ⇒ 404 且不返回状态', async () => {
    const res = await asB('/api/teacher/questions/' + qA.id + '/checker');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1004);
    expect(res.body.data).toBeNull();
  });

  it('H4-2 属主教师可读（正对照）', async () => {
    const res = await asA('/api/teacher/questions/' + qA.id + '/checker');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
  });
});
