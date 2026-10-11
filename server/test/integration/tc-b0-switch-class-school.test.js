/**
 * tc-b0 · switchClassSchool 契约测试（step 9 · B0，打靶 plan §5.3 Z1）
 *
 * 目标：钉住 PUT /api/teacher/classes/:id/switch-school（源 :946-1001，56 行，本文件最长的零覆盖 handler）。
 * 断言口径 = 状态码 + 响应体形状（含 code 与中文文案**逐字**）+ 关键 DB 终态 + 越权路径零写入。
 * 覆盖 6 条守卫分支（含全仓唯一的两条专属文案 '无权操作当前学校'(:971) / '你不属于目标学校'(:972)）
 * 与 200 分支（$transaction + teamClass 清理 + 拼接文案的两个三元形态）。
 *
 * 夹具自建自清（tca_ 前缀，独立学校院校代码 29601/29602/29603），不依赖 setup seed，
 * 不修改任何既有测试文件与产品代码。
 */
import bcrypt from 'bcryptjs';
import prisma from '../../src/utils/prisma.js';
import { request } from './helpers.js';

const PREFIX = 'tca_';
const CODE_A = '29601';
const CODE_B = '29602';
const CODE_C = '29603';

let sA, sB, sC;
let tMain, tNoOld, tNoNew, tOutsider;
let clsA, clsNoOld, clsNoNew, clsOut;
let teamA;
let tokenMain, tokenNoOld, tokenNoNew, tokenOutsider;

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
  const teams = await prisma.team.findMany({
    where: { OR: [{ name: { startsWith: PREFIX } }, { schoolId: { in: schoolIds } }, { createdBy: { in: userIds } }] },
    select: { id: true },
  });
  const teamIds = teams.map(t => t.id);

  await prisma.teamClass.deleteMany({ where: { OR: [{ teamId: { in: teamIds } }, { classId: { in: classIds } }] } });
  await prisma.teamTeacher.deleteMany({ where: { OR: [{ teamId: { in: teamIds } }, { teacherId: { in: userIds } }] } });
  await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
  await prisma.projectClass.deleteMany({ where: { classId: { in: classIds } } });
  await prisma.assignmentClass.deleteMany({ where: { classId: { in: classIds } } });
  await prisma.studentClass.deleteMany({ where: { OR: [{ studentId: { in: userIds } }, { classId: { in: classIds } }] } });
  await prisma.teacherClass.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { classId: { in: classIds } }] } });
  await prisma.teacherSchool.deleteMany({ where: { OR: [{ teacherId: { in: userIds } }, { schoolId: { in: schoolIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
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

  tMain = await mkTeacher('teacher_main', 'tca教师主线');
  tNoOld = await mkTeacher('teacher_no_old', 'tca不在旧校');
  tNoNew = await mkTeacher('teacher_no_new', 'tca不在新校');
  tOutsider = await mkTeacher('teacher_outsider', 'tca非本班教师');

  // tMain：同属 A、B 两校（走通 200）；tNoOld：同属 B 校但不在 A 校（旧校校验失败）；
  // tNoNew：同属 A 校但不在 B 校（新校校验失败）；tOutsider：在 A 校但非该班教师。
  await prisma.teacherSchool.createMany({ data: [
    { teacherId: tMain.id, schoolId: sA.id },
    { teacherId: tMain.id, schoolId: sB.id },
    { teacherId: tNoOld.id, schoolId: sB.id },
    { teacherId: tNoNew.id, schoolId: sA.id },
    { teacherId: tOutsider.id, schoolId: sA.id },
    { teacherId: tOutsider.id, schoolId: sB.id },
  ] });

  clsA = await prisma.class.create({ data: { name: PREFIX + 'class_a', schoolId: sA.id } });
  clsNoOld = await prisma.class.create({ data: { name: PREFIX + 'class_no_old', schoolId: sA.id } });
  clsNoNew = await prisma.class.create({ data: { name: PREFIX + 'class_no_new', schoolId: sA.id } });
  clsOut = await prisma.class.create({ data: { name: PREFIX + 'class_out', schoolId: sA.id } });

  await prisma.teacherClass.createMany({ data: [
    { teacherId: tMain.id, classId: clsA.id },
    { teacherId: tNoOld.id, classId: clsNoOld.id },
    { teacherId: tNoNew.id, classId: clsNoNew.id },
    // tOutsider 刻意【不】建 teacherClass 行 ⇒ 命中 :964 的「非本班教师」
  ] });

  // clsA 挂 1 个团队班（团队名进 200 的拼接文案；迁移后 teamClass 行必须清零）
  teamA = await prisma.team.create({ data: { name: PREFIX + 'team_one', schoolId: sA.id, createdBy: tMain.id } });
  await prisma.teamTeacher.create({ data: { teamId: teamA.id, teacherId: tMain.id } });
  await prisma.teamClass.create({ data: { teamId: teamA.id, classId: clsA.id } });

  tokenMain = await login('teacher_main');
  tokenNoOld = await login('teacher_no_old');
  tokenNoNew = await login('teacher_no_new');
  tokenOutsider = await login('teacher_outsider');
}

async function login(name) {
  const res = await request().post('/api/auth/login').send({ username: PREFIX + name, password: PREFIX + name });
  if (res.body.code !== 0) throw new Error('登录失败 ' + name + ': ' + JSON.stringify(res.body));
  return res.body.data.token;
}

const api = (token) => ({
  put: (url, body) => request().put(url).send(body ?? {}).set('Authorization', 'Bearer ' + token),
});
const sw = (id) => '/api/teacher/classes/' + id + '/switch-school';

/** 越权/守卫路径的「零写入」快照：班级 schoolId + 该班 teamClass 行数 */
async function snapClass(classId) {
  const c = await prisma.class.findUnique({ where: { id: classId }, select: { schoolId: true } });
  const n = await prisma.teamClass.count({ where: { classId } });
  return { schoolId: c.schoolId, teamClassCount: n };
}

beforeAll(async () => { await seed(); }, 60000);
afterAll(async () => { await purge(); }, 60000);

describe('T-A · PUT /api/teacher/classes/:id/switch-school（Z1 契约）', () => {
  it('T-A1 缺/假 newSchoolId → 400 请选择目标学校（两条入参各一次，零写入）', async () => {
    const before = await snapClass(clsA.id);
    for (const body of [{}, { newSchoolId: 0 }, { newSchoolId: null }]) {
      const res = await api(tokenMain).put(sw(clsA.id), body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: 1001, message: '请选择目标学校', data: null });
    }
    expect(await snapClass(clsA.id)).toEqual(before);
  });

  it('T-A2 班级不存在 → 404 班级不存在（零写入）', async () => {
    const res = await api(tokenMain).put(sw(999999999), { newSchoolId: sB.id });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 1004, message: '班级不存在', data: null });
  });

  it('T-A3 目标学校 === 当前学校 → 400 目标学校与当前学校相同（零写入）', async () => {
    const before = await snapClass(clsA.id);
    const res = await api(tokenMain).put(sw(clsA.id), { newSchoolId: sA.id });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 1001, message: '目标学校与当前学校相同', data: null });
    expect(await snapClass(clsA.id)).toEqual(before);
  });

  it('T-A4 非本班教师 → 403 无权操作（零写入）', async () => {
    const before = await snapClass(clsOut.id);
    const res = await api(tokenOutsider).put(sw(clsOut.id), { newSchoolId: sB.id });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 1003, message: '无权操作', data: null });
    // 该教师同属 B 校（确保命中的是 :964 的「非本班教师」判定，而不是更靠后的新校校验）
    expect(await snapClass(clsOut.id)).toEqual(before);
  });

  it('T-A5 教师不在【旧】校 → 403 无权操作当前学校（全仓唯一文案 :971，零写入）', async () => {
    const before = await snapClass(clsNoOld.id);
    const res = await api(tokenNoOld).put(sw(clsNoOld.id), { newSchoolId: sB.id });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 1003, message: '无权操作当前学校', data: null });
    expect(await snapClass(clsNoOld.id)).toEqual(before);
  });

  it('T-A6 教师不在【新】校 → 403 你不属于目标学校（全仓唯一文案 :972，零写入）', async () => {
    const before = await snapClass(clsNoNew.id);
    const res = await api(tokenNoNew).put(sw(clsNoNew.id), { newSchoolId: sB.id });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 1003, message: '你不属于目标学校', data: null });
    // 旧校校验必须先通过（tNoNew 属 A 校），否则命中的会是 :971 而非 :972
    expect(await snapClass(clsNoNew.id)).toEqual(before);
  });

  it('T-A7 合法迁移 → 200 全字段 + 拼接文案（两态）+ teamClass 清零 + 回读 DB', async () => {
    const res = await api(tokenMain).put(sw(clsA.id), { newSchoolId: sB.id });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['code', 'message', 'data']);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toBe('已从「' + sA.name + '」迁移至「' + sB.name + '」，已退出团队：' + teamA.name);
    expect(Object.keys(res.body.data)).toEqual(['oldSchoolId', 'newSchoolId', 'school', 'removedTeams']);
    expect(res.body.data).toEqual({
      oldSchoolId: sA.id,
      newSchoolId: sB.id,
      school: { id: sB.id, name: sB.name },
      removedTeams: [teamA.name],
    });
    // 终态 DB：班级已迁到 B；该班 teamClass 行清零（其余团队班行不受影响）
    const cls = await prisma.class.findUnique({ where: { id: clsA.id }, select: { schoolId: true } });
    expect(cls.schoolId).toBe(sB.id);
    expect(await prisma.teamClass.count({ where: { classId: clsA.id } })).toBe(0);
    expect(await prisma.team.count({ where: { id: teamA.id } })).toBe(1);

    // 迁回 A：此时该班已无团队 ⇒ 文案三元假分支（无「，已退出团队」后缀）
    const back = await api(tokenMain).put(sw(clsA.id), { newSchoolId: sA.id });
    expect(back.status).toBe(200);
    expect(back.body.message).toBe('已从「' + sB.name + '」迁移至「' + sA.name + '」');
    expect(back.body.message).not.toContain('已退出团队');
    expect(back.body.data.removedTeams).toEqual([]);
    expect((await prisma.class.findUnique({ where: { id: clsA.id }, select: { schoolId: true } })).schoolId).toBe(sA.id);
  });
});
