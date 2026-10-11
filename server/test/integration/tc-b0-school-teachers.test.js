/**
 * tc-b0 · 学校切换 / 我的学校 / 教师列表 契约测试（step 9 · B0，打靶 plan §5.3 Z8 + Z9 + Z10）
 *
 * 目标：钉住三条 jest 零覆盖路由：
 *   PUT /api/teacher/switch-school（源 :71-81，无守卫，直接 user.update）
 *   GET /api/teacher/my-schools（源 :832-843，只返回本人关联学校）
 *   GET /api/teacher/teachers（源 :813-828，无 schoolId 全量 / 有 schoolId 收窄）
 * 断言口径 = 状态码 + 响应体形状（含 code 与中文文案逐字）+ DB 终态 lastSchoolId + 集合相等（含负控）。
 *
 * 夹具自建自清（tcf_ 前缀，独立学校院校代码 29651/29652/29653），不依赖 setup seed。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 'tcf_';
const CODE_A = '29651';
const CODE_B = '29652';
const CODE_C = '29653';

let sA, sB, sC, tA, tB, tC, tokenA, tokenB;

async function purge() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const userIds = users.map(u => u.id);
  const schools = await prisma.school.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const schoolIds = schools.map(s => s.id);
  await prisma.teacherSchool.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
}

const mkTeacher = (name, realName) => prisma.user.create({
  data: { username: PREFIX + name, password: bcrypt.hashSync(PREFIX + name, 10), realName, role: 'teacher' },
});

async function seed() {
  await purge();
  sA = await prisma.school.create({ data: { name: PREFIX + 'school_a', officialCode: CODE_A } });
  sB = await prisma.school.create({ data: { name: PREFIX + 'school_b', officialCode: CODE_B } });
  sC = await prisma.school.create({ data: { name: PREFIX + 'school_c', officialCode: CODE_C } });
  tA = await mkTeacher('teacher_a', 'tcf教师A');
  tB = await mkTeacher('teacher_b', 'tcf教师B');
  tC = await mkTeacher('teacher_c', 'tcf教师C');
  // tA ∈ {A,B}；tB ∈ {B}；tC ∈ {A,C}
  await prisma.teacherSchool.createMany({ data: [
    { teacherId: tA.id, schoolId: sA.id },
    { teacherId: tA.id, schoolId: sB.id },
    { teacherId: tB.id, schoolId: sB.id },
    { teacherId: tC.id, schoolId: sA.id },
    { teacherId: tC.id, schoolId: sC.id },
  ] });
  tokenA = await login('teacher_a');
  tokenB = await login('teacher_b');
}

async function login(name) {
  const res = await request().post('/api/auth/login').send({ username: PREFIX + name, password: PREFIX + name });
  if (res.body.code !== 0) throw new Error('登录失败 ' + name + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

const get = (token, url) => request().get(url).set('Authorization', 'Bearer ' + token);
const idsOf = (list) => list.map(x => x.id).sort((a, b) => a - b);

beforeAll(async () => { await seed(); }, 60000);
afterAll(async () => { await purge(); }, 60000);

describe('T-F · 学校切换 / 我的学校 / 教师列表（Z8 · Z9 · Z10 契约）', () => {
  it('T-F1 PUT /switch-school → 200 切换成功 + data 为学校全行 + 回读 user.lastSchoolId', async () => {
    const res = await request().put('/api/teacher/switch-school')
      .send({ schoolId: sB.id }).set('Authorization', 'Bearer ' + tokenA);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['code', 'message', 'data']);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toBe('切换成功');
    const schoolB = await prisma.school.findUnique({ where: { id: sB.id } });
    expect(res.body.data).toEqual(JSON.parse(JSON.stringify(schoolB)));
    const u = await prisma.user.findUnique({ where: { id: tA.id }, select: { lastSchoolId: true } });
    expect(u.lastSchoolId).toBe(sB.id);
  });

  it('T-F2 GET /my-schools → 只含本人关联学校（tA 两校 / tB 一校，负控排除 C 校）', async () => {
    const resA = await get(tokenA, '/api/teacher/my-schools');
    expect(resA.status).toBe(200);
    expect(resA.body.code).toBe(0);
    expect(resA.body.message).toBe('ok');
    expect(idsOf(resA.body.data)).toEqual([sA.id, sB.id].sort((a, b) => a - b));
    expect(resA.body.data.map(s => s.name).sort()).toEqual([sA.name, sB.name].sort());
    // 全行透出（不是投影）
    const schoolA = await prisma.school.findUnique({ where: { id: sA.id } });
    expect(resA.body.data.find(s => s.id === sA.id)).toEqual(JSON.parse(JSON.stringify(schoolA)));
    expect(resA.body.data.some(s => s.id === sC.id)).toBe(false);

    const resB = await get(tokenB, '/api/teacher/my-schools');
    expect(resB.status).toBe(200);
    expect(idsOf(resB.body.data)).toEqual([sB.id]); // 负控：tB 只有一校
  });

  it('T-F3 GET /teachers（不带 schoolId）→ 含全部教师，且满足投影 4 键 + createdAt 降序', async () => {
    const res = await get(tokenA, '/api/teacher/teachers');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toBe('ok');
    expect(Array.isArray(res.body.data)).toBe(true);
    const ids = res.body.data.map(u => u.id);
    for (const t of [tA, tB, tC]) expect(ids).toContain(t.id); // 跨校教师也在（未按校收窄）
    for (const u of res.body.data) {
      expect(Object.keys(u).sort()).toEqual(['createdAt', 'id', 'realName', 'username']);
    }
    const times = res.body.data.map(u => new Date(u.createdAt).getTime());
    for (let i = 1; i < times.length; i++) expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
    // 负控：不含学生（role:'teacher' 过滤）
    expect(res.body.data.some(u => u.username.startsWith('test_stu'))).toBe(false);
  });

  it('T-F4 GET /teachers?schoolId= → 恰为该【校】教师集合（集合相等，含负控）', async () => {
    const resA = await get(tokenA, '/api/teacher/teachers?schoolId=' + sA.id);
    expect(resA.status).toBe(200);
    expect(resA.body.code).toBe(0);
    expect(idsOf(resA.body.data)).toEqual([tA.id, tC.id].sort((a, b) => a - b));
    expect(resA.body.data.some(u => u.id === tB.id)).toBe(false); // 负控：B 校教师不出现

    const resB = await get(tokenB, '/api/teacher/teachers?schoolId=' + sB.id);
    expect(resB.status).toBe(200);
    expect(idsOf(resB.body.data)).toEqual([tA.id, tB.id].sort((a, b) => a - b));
    expect(resB.body.data.some(u => u.id === tC.id)).toBe(false);
  });
});
