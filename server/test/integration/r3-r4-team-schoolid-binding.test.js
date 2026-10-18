/**
 * R3-R4（P1）回归断言：团队写授权基准必须是 team.schoolId，而非客户端可控的 req.query.schoolId
 *
 * 依据：reports/fix/round3/TICKETS/R3-R4.md §3 验收断言
 * 背景（HEAD c4e17f5）：teamController.js:4 getSchoolId(req)=req.query.schoolId；
 *   updateTeam 已查出的 team 行含 team.schoolId 却未用作基准（:93,:113,:123）⇒
 *   教师 A 传 ?schoolId=校B 即可把校B教师加入校A团队（跨租户授权注入）。
 *
 * 本套件需 DB（exam_system_test）；夹具自建自清（PREFIX=c3r4_，officialCode 29871/29872），
 * 不依赖 setup seed，也不修改任何既有测试文件。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 'c3r4_';
const CODE_A = '29871';
const CODE_B = '29872';
const PWD = 'C3r4-pwd-1';

let sA = null;
let sB = null;
let tA = null;
let tA2 = null;
let tB = null;
let tB2 = null;
let clsB = null;
let teamA = null;
let tokenA = null;

async function purge() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const schools = await prisma.school.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const schoolIds = schools.map((s) => s.id);
  const teams = await prisma.team.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const teamIds = teams.map((t) => t.id);
  const classes = await prisma.class.findMany({
    where: { OR: [{ name: { startsWith: PREFIX } }, { schoolId: { in: schoolIds } }] },
    select: { id: true },
  });
  const classIds = classes.map((c) => c.id);

  await prisma.teamClass.deleteMany({ where: { OR: [{ teamId: { in: teamIds } }, { classId: { in: classIds } }] } });
  await prisma.teamTeacher.deleteMany({ where: { OR: [{ teamId: { in: teamIds } }, { teacherId: { in: userIds } }] } });
  await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
  await prisma.teacherClass.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { classId: { in: classIds } }] } });
  await prisma.teacherSchool.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
}

async function mkTeacher(name, realName) {
  return prisma.user.create({
    data: { username: PREFIX + name, password: bcrypt.hashSync(PWD, 10), realName, role: 'teacher' },
  });
}

async function login(username) {
  const res = await request().post('/api/auth/login').send({ username, password: PWD });
  const token = res.body && res.body.data && res.body.data.token;
  if (!token) throw new Error('登录失败：' + username + ' :: ' + JSON.stringify(res.body));
  return token;
}

const putTeam = (token, teamId, query, body) =>
  request()
    .put('/api/teacher/teams/' + teamId + (query ? '?' + query : ''))
    .set('Authorization', 'Bearer ' + token)
    .send(body);

const memberIds = async () => {
  const rows = await prisma.teamTeacher.findMany({ where: { teamId: teamA.id }, select: { teacherId: true } });
  return rows.map((r) => r.teacherId).sort((a, b) => a - b);
};
const classIdsOfTeam = async () => {
  const rows = await prisma.teamClass.findMany({ where: { teamId: teamA.id }, select: { classId: true } });
  return rows.map((r) => r.classId).sort((a, b) => a - b);
};

describe('R3-R4 团队写授权基准 = team.schoolId（跨校 teacherIds 注入）', () => {
  beforeAll(async () => {
    await purge();
    sA = await prisma.school.create({ data: { name: PREFIX + 'school_a', officialCode: CODE_A } });
    sB = await prisma.school.create({ data: { name: PREFIX + 'school_b', officialCode: CODE_B } });
    clsB = await prisma.class.create({ data: { name: PREFIX + 'class_b', schoolId: sB.id } });
    tA = await mkTeacher('teacher_a', 'C3 教师A');
    tA2 = await mkTeacher('teacher_a2', 'C3 教师A2');
    tB = await mkTeacher('teacher_b', 'C3 教师B');
    tB2 = await mkTeacher('teacher_b2', 'C3 教师B2');
    await prisma.teacherSchool.createMany({
      data: [
        { teacherId: tA.id, schoolId: sA.id },
        { teacherId: tA2.id, schoolId: sA.id },
        { teacherId: tB.id, schoolId: sB.id },
        { teacherId: tB2.id, schoolId: sB.id },
      ],
    });
    teamA = await prisma.team.create({
      data: {
        name: PREFIX + 'team_a',
        schoolId: sA.id,
        createdBy: tA.id,
        teachers: { create: { teacherId: tA.id } },
      },
    });
    tokenA = await login(PREFIX + 'teacher_a');
  }, 60000);

  afterAll(async () => {
    await purge();
  });

  it('★攻击：?schoolId=校B + teacherIds=[校B教师] → 403(code 1003) 且零写入', async () => {
    const before = await memberIds();
    const res = await putTeam(tokenA, teamA.id, 'schoolId=' + sB.id, { teacherIds: [tB.id] });
    expect(res.status).toBe(403);
    expect(res.body && res.body.code).toBe(1003);
    expect(await memberIds()).toEqual(before);
  });

  it('★攻击：混合数组 [校B教师, 校B教师2]（全部外校）→ 整体 403，零写入', async () => {
    const before = await memberIds();
    const res = await putTeam(tokenA, teamA.id, 'schoolId=' + sB.id, { teacherIds: [tB.id, tB2.id] });
    expect(res.status).toBe(403);
    expect(res.body && res.body.code).toBe(1003);
    expect(await memberIds()).toEqual(before);
  });

  it('回归：混合数组 [本校教师, 校B教师] → 整体 403，禁止部分成功', async () => {
    const before = await memberIds();
    const res = await putTeam(tokenA, teamA.id, 'schoolId=' + sB.id, { teacherIds: [tA2.id, tB.id] });
    expect(res.status).toBe(403);
    expect(await memberIds()).toEqual(before);
  });

  it('正例：?schoolId=本校 + 本校教师 → 200 且成员落库', async () => {
    const res = await putTeam(tokenA, teamA.id, 'schoolId=' + sA.id, { teacherIds: [tA.id, tA2.id] });
    expect(res.status).toBe(200);
    expect(res.body && res.body.code).toBe(0);
    expect(await memberIds()).toEqual([tA.id, tA2.id].sort((a, b) => a - b));
  });

  it('旧客户端不传 ?schoolId：以 team.schoolId 为基准 → 本校教师 200（票面 §2.2/§3）', async () => {
    const res = await putTeam(tokenA, teamA.id, '', { teacherIds: [tA.id, tA2.id] });
    expect(res.status).toBe(200);
    expect(res.body && res.body.code).toBe(0);
  });

  it('classIds 跨校（校B班级）→ 403 且团队班级零写入', async () => {
    const before = await classIdsOfTeam();
    const res = await putTeam(tokenA, teamA.id, 'schoolId=' + sA.id, { classIds: [clsB.id] });
    expect(res.status).toBe(403);
    expect(await classIdsOfTeam()).toEqual(before);
  });

  it('非成员/非创建者写团队 → 403（既有归属校验不回归）', async () => {
    const tokenB = await login(PREFIX + 'teacher_b');
    const res = await putTeam(tokenB, teamA.id, 'schoolId=' + sB.id, { name: PREFIX + 'hack_rename' });
    expect(res.status).toBe(403);
    const team = await prisma.team.findUnique({ where: { id: teamA.id }, select: { name: true } });
    expect(team.name).toBe(PREFIX + 'team_a');
  });
});
